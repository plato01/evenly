# Evenly — On-chain Anchor (Monad Testnet)

`EvenlyAnchor.sol` is a minimal contract that records Evenly expenses/groups on
Monad. Deploying it gives you a **contract address** — moving your submission
from *Hosted* (+50 XP) to **Testnet** (+250 XP).

## How it fits together

- The app builds a small human-readable JSON payload (`web3/encode.ts`).
- The **monad-relay** Edge Function (a sponsor wallet) submits it — users pay no
  gas and need no wallet.
- With `ANCHOR_CONTRACT` set, the relayer **calls `EvenlyAnchor.anchor(...)`**,
  which emits an `Anchored` event (Option B). Without it, the relayer falls back
  to a self-tx calldata anchor (Option A, no contract).

## Deploy (one time)

1. **Get a funded testnet wallet.** Create/export a private key and fund it with
   test MON from <https://faucet.monad.xyz>. You can reuse the relayer wallet.

2. **Deploy** (from repo root):

   PowerShell:
   ```powershell
   $env:MONAD_DEPLOYER_KEY = "0x<funded testnet private key>"
   node scripts/deployAnchor.mjs
   ```
   bash:
   ```bash
   MONAD_DEPLOYER_KEY=0x<funded testnet private key> node scripts/deployAnchor.mjs
   ```

   It compiles with `solc`, deploys with `viem`, and prints the contract address
   + explorer link. The key is read from the environment only — never commit it.

3. **Wire the address in** (three places):
   - `web3/config.ts` → set `EXPO_PUBLIC_ANCHOR_CONTRACT` (or paste into `ANCHOR_CONTRACT`).
   - The relayer secret: `supabase secrets set ANCHOR_CONTRACT=0x...`
   - Redeploy the function: `supabase functions deploy monad-relay`

4. **Enable web3 in the app** (`.env.local`):
   ```
   EXPO_PUBLIC_WEB3_ENABLED=true
   EXPO_PUBLIC_MONAD_RELAYER_URL=https://<project>.supabase.co/functions/v1/monad-relay
   EXPO_PUBLIC_ANCHOR_CONTRACT=0x<deployed address>
   ```

## Verify it worked

Add an expense in the app → the relayer calls the contract → open the printed
explorer link. You should see the `Anchored` event and `anchorCount` increment.

**Submit the deployed contract address** shown in step 2 as your Testnet entry.

## Security note

`MONAD_DEPLOYER_KEY` / `MONAD_RELAYER_KEY` are secrets. Keep them in your shell
env or `supabase secrets` — never in the repo. Use a throwaway testnet wallet.
