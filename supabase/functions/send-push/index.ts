import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'https://deno.land/x/jose@v5.2.0/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID')!;

// The full service account JSON is stored as a single secret
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);

// ─── Google OAuth2 access token via service account JWT ─────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessToken(): Promise<string> {
  // Reuse token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const privateKey = await importPKCS8(SERVICE_ACCOUNT.private_key, 'RS256');

  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(SERVICE_ACCOUNT.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const { access_token, expires_in } = await resp.json();
  cachedToken = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

// ─── Send single FCM v1 push ────────────────────────────────────────────────

async function sendFCMPush(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getGoogleAccessToken();

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data,
          android: {
            priority: 'high',
            notification: {
              channel_id: 'general',
              sound: 'default',
            },
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error('[send-push] FCM error:', err);
    return { success: false, error: err };
  }

  return { success: true };
}

// ─── Edge function handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { targetUserIds, title, body, data } = await req.json();

    if (!targetUserIds?.length || !title) {
      return new Response(
        JSON.stringify({ error: 'targetUserIds and title are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Admin client to read user metadata (FCM tokens)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: Array<{ userId: string; sent: boolean; reason?: string }> = [];

    for (const userId of targetUserIds) {
      const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);

      if (error || !user) {
        results.push({ userId, sent: false, reason: 'user_not_found' });
        continue;
      }

      const fcmToken = user.user_metadata?.fcm_token;
      if (!fcmToken) {
        results.push({ userId, sent: false, reason: 'no_fcm_token' });
        continue;
      }

      const result = await sendFCMPush(fcmToken, title, body, data ?? {});
      results.push({
        userId,
        sent: result.success,
        reason: result.error,
      });
    }

    const sent = results.filter((r) => r.sent).length;
    return new Response(
      JSON.stringify({ sent, total: targetUserIds.length, results }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-push] Error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
