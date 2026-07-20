import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Where the invite link lands after the user confirms. For a mobile deep link
// set this to e.g. "evenly://invite". Falls back to the Supabase site URL.
const INVITE_REDIRECT = Deno.env.get('APP_INVITE_REDIRECT') ?? undefined;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Edge function handler ──────────────────────────────────────────────────
// Sends an "you've been added to a group on Evenly" email invite via Supabase
// Auth (inviteUserByEmail). This provisions a pending auth account and emails a
// link; when the person finishes signing up, the app calls claim_invites() to
// turn their pending group invites into real memberships.
//
// Body: { email: string, groupName?: string, inviterName?: string }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { email, groupName, inviterName } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'email is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // inviteUserByEmail: sends a branded Supabase email + creates a pending
    // auth user. The `data` becomes user_metadata the app can read on first run.
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        invited_to_group: groupName ?? null,
        invited_by: inviterName ?? null,
      },
      ...(INVITE_REDIRECT ? { redirectTo: INVITE_REDIRECT } : {}),
    });

    if (error) {
      // Most common: the person already has an account. That's fine — they'll
      // pick up the invite via claim_invites() next time they open the app.
      const alreadyRegistered =
        error.status === 422 || /already been registered|already exists/i.test(error.message);
      if (alreadyRegistered) {
        return new Response(
          JSON.stringify({ sent: false, reason: 'already_registered' }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }
      console.error('[send-invite] inviteUserByEmail error:', error.message);
      return new Response(
        JSON.stringify({ sent: false, error: error.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ sent: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-invite] Error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
