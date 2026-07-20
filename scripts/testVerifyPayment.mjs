/**
 * End-to-end test of the on-chain payment verification pipeline on Monad
 * testnet, without the app UI:
 *
 *   1. set the payee user's receiving wallet (Monad + USDC)
 *   2. insert a pending settlement (payer → payee)
 *   3. send a real TestUSDC transfer on Monad testnet
 *   4. attach the tx hash and call the verify-payment Edge Function
 *   5. assert payment_verified = true / status = confirmed
 *   6. negative test: a second settlement reusing the same tx must be rejected
 *   7. delete the test settlements
 *
 * Run:
 *   MONAD_DEPLOYER_KEY=0x... SUPABASE_SERVICE_ROLE_KEY=... node scripts/testVerifyPayment.mjs
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY / EXPO_PUBLIC_MONAD_USDC from
 * .env.local automatically. Testnet only — uses the throwaway deployer wallet.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWalletClient, createPublicClient, http, defineChain, parseUnits, parseAbi } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TOKEN = env.EXPO_PUBLIC_MONAD_USDC;
const KEY = process.env.MONAD_DEPLOYER_KEY ?? env.MONAD_DEPLOYER_KEY;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYEE_EMAIL = process.env.PAYEE_EMAIL ?? 'tyamm.kou@gmail.com';
const AMOUNT = 12.5; // USD debt → strict amount check in the Edge Function

if (!KEY || !SRK) {
  console.error('✗ Need MONAD_DEPLOYER_KEY (env or .env.local) and SUPABASE_SERVICE_ROLE_KEY (env).');
  process.exit(1);
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
});

const db = async (method, path, body) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const fail = (msg) => { console.error('❌ ' + msg); process.exit(1); };

// ── 1. Resolve users ────────────────────────────────────────────────────────
const users = await db('GET', 'users?select=id,name,email,wallet_address');
const payee = users.find((u) => u.email === PAYEE_EMAIL);
const payer = users.find((u) => u.email !== PAYEE_EMAIL);
if (!payee || !payer) fail('Need at least two users in the cloud users table');
console.log(`› Payee: ${payee.name} (${payee.email})   Payer: ${payer.name}`);

// ── 2. Payee receiving wallet (fresh throwaway unless already set) ─────────
let receiving = payee.wallet_address;
if (!receiving) {
  receiving = privateKeyToAccount(generatePrivateKey()).address;
  console.log('› Generated payee receiving address:', receiving);
}
await db('PATCH', `users?id=eq.${payee.id}`, {
  wallet_address: receiving,
  wallet_chain_id: 10143,
  wallet_token: 'USDC',
});
console.log('  ✓ payee receiving wallet set (Monad testnet / USDC)');

// ── 3. Pending settlement ───────────────────────────────────────────────────
const [settlement] = await db('POST', 'settlements', {
  from_user_id: payer.id,
  to_user_id: payee.id,
  amount: AMOUNT,
  currency: 'USD',
  note: 'E2E verification test (auto-created, will be deleted)',
  status: 'pending',
  settled_at: new Date().toISOString(),
});
console.log('› Settlement created:', settlement.id);

// ── 4. Real on-chain transfer ───────────────────────────────────────────────
const account = privateKeyToAccount(KEY);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
const pub = createPublicClient({ chain: monadTestnet, transport: http() });
const erc20 = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

console.log(`› Sending ${AMOUNT} TestUSDC → ${receiving} …`);
const txHash = await wallet.writeContract({
  address: TOKEN, abi: erc20, functionName: 'transfer',
  args: [receiving, parseUnits(String(AMOUNT), 6)],
});
console.log('  tx:', txHash);
const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
console.log('  ✓ mined in block', receipt.blockNumber.toString());

// ── 5. Attach hash + call verify-payment ────────────────────────────────────
await db('PATCH', `settlements?id=eq.${settlement.id}`, {
  payment_tx_hash: txHash,
  payment_chain_id: 10143,
});

const verify = async (id) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ settlementId: id }),
  });
  return res.json();
};

console.log('› Calling verify-payment …');
const result = await verify(settlement.id);
console.log('  response:', JSON.stringify(result));
if (!result.verified) fail('Expected verified=true, got: ' + JSON.stringify(result));

// ── 6. Assert the DB row was stamped by the function ────────────────────────
const [row] = await db('GET',
  `settlements?id=eq.${settlement.id}&select=payment_verified,status,payment_chain_id`);
if (!row.payment_verified || row.status !== 'confirmed' || row.payment_chain_id !== 10143) {
  fail('Settlement row not stamped correctly: ' + JSON.stringify(row));
}
console.log('  ✓ settlement stamped: payment_verified=true, status=confirmed, chain=10143');

// ── 7. Replay attack: same tx on a second settlement must be rejected ───────
const [replay] = await db('POST', 'settlements', {
  from_user_id: payer.id,
  to_user_id: payee.id,
  amount: AMOUNT,
  currency: 'USD',
  note: 'E2E replay test (auto-created, will be deleted)',
  status: 'pending',
  settled_at: new Date().toISOString(),
});
let replayBlocked = false;
try {
  await db('PATCH', `settlements?id=eq.${replay.id}`, { payment_tx_hash: txHash });
  const replayResult = await verify(replay.id);
  console.log('› Replay response:', JSON.stringify(replayResult));
  replayBlocked = replayResult.verified === false;
} catch (e) {
  // The partial unique index on payment_tx_hash may reject the reuse outright.
  console.log('› Replay blocked at the DB layer:', e.message.split('\n')[0]);
  replayBlocked = true;
}
if (!replayBlocked) fail('Replay was NOT blocked — one tx proved two debts!');
console.log('  ✓ replay attack rejected');

// ── 8. Cleanup ──────────────────────────────────────────────────────────────
await db('DELETE', `settlements?id=in.(${settlement.id},${replay.id})`);
console.log('› Test settlements deleted');

console.log('\n✅ E2E PASSED — on-chain payment verification works end to end');
console.log('   Explorer:', `https://testnet.monadscan.com/tx/${txHash}`);
