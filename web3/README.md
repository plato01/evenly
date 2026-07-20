# web3/ — Monad settlement module

Self-contained Web3 layer for Evenly. **Bolt-on, not core.** The app stays
SQLite-first (see root `CLAUDE.md`); this module is only touched at the Settle
screen and a wallet-activity screen. If the experiment is dropped, delete this
folder and the two call-sites.

## Design rules

1. **Chain is read-mostly.** Reading a wallet's balance/history costs no gas and
   is the safe half — build this first (`walletActivity.ts`).
2. **SQLite stays the source of truth.** On-chain settlements enrich a
   `settlements` row with a `tx_hash`; they don't replace the local record.
   Still write through `queuedSettlementSync`.
3. **Gasless.** Users never hold MON. A relayer (Supabase Edge Function) pays
   gas. See `settle.ts`.
4. **Testnet only** until proven. Zero real-money risk.
5. **Guard native/web differences** at call-sites with `Platform.OS` where
   needed. Wallet connect is smoother on web.

## Files

| File | Purpose | Needs deps? |
|------|---------|-------------|
| `config.ts` | Monad chain id, RPC, token addresses | no |
| `types.ts` | Shared Web3 types | no |
| `client.ts` | viem public/wallet client for Monad | `viem` |
| `wallet.ts` | Connect / embedded wallet | wallet SDK |
| `walletActivity.ts` | Read balances + USDC transfers (SAFE, free) | indexer API |
| `settle.ts` | Gasless settlement via relayer | `viem` |
| `contracts/` | `SettleUp.sol` + ABI for batch settle (stretch) | — |

## To enable

```bash
yarn add viem
# + a wallet SDK (Reown/WalletConnect for web, Privy for embedded)
```

Fill real values in `config.ts` (verify Monad testnet chain id / RPC against the
official docs before trusting the placeholders).

## Roadmap (hackathon order)

1. `config.ts` + `types.ts` — no deps ✅ (scaffolded)
2. `walletActivity.ts` — read-only wallet view, no gas, always-works demo
3. `wallet.ts` + `settle.ts` — one gasless settlement on testnet
4. `contracts/SettleUp.sol` — batch-settle a whole group (feed `utils/debtSimplifier.ts`) — the headline demo
