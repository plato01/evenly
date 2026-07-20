import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── Types ─────────────────────────────────────────────────────────────────

interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

interface SimplifiedDebt {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  currency: string;
}

// ─── Algorithm ─────────────────────────────────────────────────────────────

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

function simplifyDebts(
  edges: DebtEdge[],
  userNames: Record<string, string>,
  currency: string,
): SimplifiedDebt[] {
  const balances: Record<string, number> = {};

  for (const edge of edges) {
    balances[edge.from] = (balances[edge.from] ?? 0) - edge.amount;
    balances[edge.to] = (balances[edge.to] ?? 0) + edge.amount;
  }

  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, balance] of Object.entries(balances)) {
    if (balance > 0.005) creditors.push({ id, amount: balance });
    if (balance < -0.005) debtors.push({ id, amount: Math.abs(balance) });
  }

  const result: SimplifiedDebt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = roundToTwo(Math.min(creditor.amount, debtor.amount));

    result.push({
      from: debtor.id,
      fromName: userNames[debtor.id] ?? debtor.id,
      to: creditor.id,
      toName: userNames[creditor.id] ?? creditor.id,
      amount,
      currency,
    });

    creditor.amount = roundToTwo(creditor.amount - amount);
    debtor.amount = roundToTwo(debtor.amount - amount);

    if (creditor.amount < 0.005) ci++;
    if (debtor.amount < 0.005) di++;
  }

  return result;
}

// ─── Edge Function Handler ─────────────────────────────────────────────────

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
    const { groupId, currency = 'USD' } = await req.json();

    if (!groupId) {
      return new Response(
        JSON.stringify({ error: 'groupId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch group members with names
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select('user_id, users(name)')
      .eq('group_id', groupId);

    if (membersError) throw membersError;

    const userNames: Record<string, string> = {};
    for (const m of members ?? []) {
      const name = (m as any).users?.name ?? m.user_id;
      userNames[m.user_id] = name;
    }

    // Fetch all expenses with splits for this group
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('id, paid_by, expense_splits(user_id, amount)')
      .eq('group_id', groupId)
      .is('deleted_at', null);

    if (expError) throw expError;

    // Build debt edges
    const edges: DebtEdge[] = [];
    for (const exp of expenses ?? []) {
      for (const split of (exp as any).expense_splits ?? []) {
        if (split.user_id !== exp.paid_by && split.amount > 0) {
          edges.push({ from: split.user_id, to: exp.paid_by, amount: split.amount });
        }
      }
    }

    // Subtract confirmed settlements
    const { data: settlements, error: settError } = await supabase
      .from('settlements')
      .select('from_user_id, to_user_id, amount')
      .eq('group_id', groupId)
      .eq('status', 'confirmed');

    if (settError) throw settError;

    for (const s of settlements ?? []) {
      edges.push({ from: s.to_user_id, to: s.from_user_id, amount: s.amount });
    }

    // Compute per-member balances
    const balances: Record<string, number> = {};
    for (const edge of edges) {
      balances[edge.from] = (balances[edge.from] ?? 0) - edge.amount;
      balances[edge.to] = (balances[edge.to] ?? 0) + edge.amount;
    }

    const memberBalances = Object.entries(balances).map(([userId, balance]) => ({
      userId,
      name: userNames[userId] ?? userId,
      balance: roundToTwo(balance),
    })).sort((a, b) => b.balance - a.balance);

    // Simplify debts
    const simplified = simplifyDebts(edges, userNames, currency);

    // Total group spending
    const totalSpending = (expenses ?? []).reduce(
      (sum: number, e: any) => sum + (e.total_amount ?? 0),
      0,
    );

    return new Response(
      JSON.stringify({
        groupId,
        currency,
        totalSpending: roundToTwo(totalSpending),
        memberBalances,
        simplifiedDebts: simplified,
        memberCount: members?.length ?? 0,
        expenseCount: expenses?.length ?? 0,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[simplify-debts] Error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
