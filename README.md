# Evenly 💸

**Split expenses with friends — settle up in fiat or crypto.**

Evenly is a full-featured expense-splitting app (think Splitwise) built with Expo / React Native, with an offline-first architecture and on-chain settlement verification on Monad and other EVM chains.

## Features

- **Groups & expenses** — create groups, add expenses, split equally / by amount / by percentage / by shares
- **Offline-first** — everything is written to local SQLite first; a sync queue mirrors changes to Supabase when online and replays after reconnect
- **Crypto settlements** — set a receiving network (Monad, Ethereum, Polygon, Base, Solana) + stablecoin (USDC/USDT); payers scan a QR from any wallet app
- **On-chain verification** — the app auto-detects the payer's transfer via `eth_getLogs`; a Supabase Edge Function is the *only* writer of `payment_verified` (client column grants revoked), so the "Verified on-chain" badge can't be spoofed
- **Debt simplification** — minimizes the number of payments needed to settle a group
- **Scan a bill** — camera + on-device ML Kit OCR extracts totals and line items from receipts
- **Voice input** — add expenses by speaking (on-device speech recognition, no API)
- **Recurring expenses, trip budgets, personal budgets, friend requests, comments, trip report PDF/CSV export, smart debt-reminder notifications, dark mode**

## Stack

| Layer | Tech |
|-------|------|
| App | Expo SDK 54, expo-router v6, React Native 0.81, TypeScript |
| State | Redux Toolkit; SQLite (expo-sqlite) as source of truth |
| Cloud | Supabase (Postgres, Auth, Edge Functions, Realtime) |
| Web3 | viem, EVM RPC scanning, `EvenlyAnchor.sol` on Monad testnet |
| ML | react-native-mlkit-ocr, expo-speech-recognition |

## Architecture in one paragraph

All reads/writes hit local SQLite first (`db/`), then a queued sync proxy (`services/syncProxy.ts` → `services/syncQueue.ts`) mirrors writes to Supabase — immediately when online, replayed from a persistent queue when not. On a fresh login, `services/cloudRestore.ts` pulls every cloud table back into SQLite. Redux holds in-memory UI state; custom hooks bridge DB ↔ Redux. Crypto payments are verified server-side: the payer pays externally, the app finds the transfer log on-chain, and the `verify-payment` Edge Function independently re-verifies before marking the settlement.

## Getting started

```bash
yarn install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
yarn start                   # expo start --clear
```

Run on a device/emulator with `yarn android` / `yarn ios`. Firebase push notifications require a native dev-client build (EAS) and a `google-services.json` (not committed); the app detects its absence and skips FCM gracefully.

### Environment

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_WEB3_ENABLED=true
```

Supabase schema lives in `supabase/migrations/`; Edge Functions in `supabase/functions/` (`verify-payment`, `simplify-debts`, `monad-relay`).
