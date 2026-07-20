# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## App Identity

**Evenly** — a Splitwise-clone expense-splitting app (package `com.evenly.app`). The repo folder is named `StickerSmash` (legacy Expo starter name); the actual product name is **Evenly**.

---

## Commands

```bash
# Start dev server (clears cache)
yarn start          # or: expo start --clear

# Run on device/emulator (requires EAS dev-client build for Firebase features)
yarn android        # expo run:android
yarn ios            # expo run:ios

# Lint
yarn lint           # expo lint (ESLint via eslint-config-expo)
```

There are no automated tests. Type-check with:
```bash
npx tsc --noEmit
```

**Important:** Firebase (`@react-native-firebase/*`) requires a native dev-client build via EAS — it does not work in Expo Go. The app detects this at runtime via `TurboModuleRegistry.get('RNFBAppModule')` and gracefully skips Firebase features.

`google-services.json` is required for Android FCM but must **not** be committed (it contains Firebase API keys). Add it to `.gitignore`.

Environment variables — create an `.env.local` at the root:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Architecture

### Data flow: SQLite-first, Supabase as cloud mirror

All reads and writes go to local **expo-sqlite** (`splitwise.db`) first. Supabase is a secondary sync target. This means:

1. **Write to SQLite** (via `db/queries/*.ts`)
2. **Enqueue cloud sync** via `services/syncProxy.ts` → `services/syncQueue.ts`
3. `syncQueue` executes immediately if online, otherwise stores in `sync_queue` SQLite table and replays on reconnect (NetInfo listener, 5-retry drop)

Use the **queued proxy** when writing data — never call `expenseSync` / `settlementSync` / `groupSync` directly from UI code:
```ts
import { queuedExpenseSync } from '@/services/syncProxy';
```

On fresh device login, `services/cloudRestore.ts` pulls all 12 Supabase tables into local SQLite (skip-if-exists by PK).

### Bootstrap sequence (`app/_layout.tsx`)

`AppInitializer` runs on mount in this order:
1. `initDatabase()` — opens `splitwise.db`, runs `CREATE TABLE IF NOT EXISTS` for all tables, applies idempotent `ALTER TABLE` migrations
2. Restores theme/font/notification prefs from `expo-secure-store`
3. Calls `getSession()` (Supabase auth)
4. Routes to `/onboarding`, `/(auth)/login`, or `/(tabs)` depending on state
5. Lazy-loads services (Firebase, nudges, recurring processor, sync queue, cloud restore) to avoid startup crashes

### Redux store (`store/index.ts`)

8 slices: `auth`, `groups`, `expenses`, `friends`, `settlements`, `ui`, `tripBudgets`, `budgets`.

Always use typed hooks — **never** raw `useDispatch`/`useSelector`:
```ts
import { useAppDispatch, useAppSelector } from '@/store';
```

Redux holds in-memory UI state. SQLite is the source of truth for persisted data. Custom hooks in `hooks/` bridge them: load from DB on mount/focus, dispatch to Redux for reactivity.

### Database layer (`db/`)

- `db/index.ts` — singleton DB handle, `initDatabase()`, `getDatabaseSafe()` (auto-reconnect for fast-refresh), idempotent migrations
- `db/schema.ts` — `CREATE_TABLES_SQL` string with all 12 tables: `users`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`, `activity_log`, `custom_categories`, `trip_budgets`, `comments`, `personal_budgets`, `recurring_templates`
- `db/queries/*.ts` — typed query modules (`usersDb`, `groupsDb`, `expensesDb`, `settlementsDb`, `categoriesDb`, `commentsDb`)

**Migrations** are inline in `initDatabase()` as idempotent `ALTER TABLE … ADD COLUMN` calls wrapped in try/catch (column-already-exists is swallowed).

### Routing (`app/` — expo-router v6)

- `app/(tabs)/` — 4 tabs: `index` (Dashboard), `groups`, `friends`, `account`
- `app/(auth)/` — `login`, `register`, `forgot-password`, `profile-setup`
- `app/onboarding.tsx` — shown once; flag stored via `StorageKeys.ONBOARDING_DONE`
- Modals: `expense/add`, `expense/scan`, `expense/edit/[id]`, `group/create`, `group/edit/[id]`, `settle/index`
- Path alias `@/` maps to repo root (configured in `tsconfig.json`)

### Theme system

`constants/colors.ts` exports `Colors` with a nested `Colors.dark` object. Screens use the `useAppTheme()` hook (or `useColorScheme` + Redux `ui.themeMode`) to pick between light/dark palettes. Theme mode (`light` / `dark` / `system`) is stored in SecureStore under `StorageKeys.THEME_MODE`.

### Supabase auth

`services/supabase.ts` — Supabase client with a chunked SecureStore adapter (splits tokens >2048 chars across multiple SecureStore keys). Only `SIGNED_OUT` events trigger logout in Redux; `TOKEN_REFRESHED` / `SIGNED_IN` keep Redux in sync silently.

### Key services

| File | Purpose |
|------|---------|
| `services/syncQueue.ts` | Offline write queue — SQLite `sync_queue` table, NetInfo listener |
| `services/syncProxy.ts` | Queued wrappers for expense/settlement/group syncs |
| `services/cloudRestore.ts` | Pull all Supabase tables → local SQLite on fresh device |
| `services/nudgeService.ts` | Smart debt reminder local notifications (expo-notifications) |
| `services/recurringExpenses.ts` | Process `recurring_templates` on app start, backfill missed dates |
| `services/firebase.ts` | FCM push notification registration (lazy, native-only) |
| `services/authService.ts` | `getSession()` — wraps Supabase session into app `User` type |
| `services/storage.ts` | Thin wrapper over `expo-secure-store` |

### Component conventions

- `components/ui/` — primitives exported from `index.ts` (`CustomText`, `CustomButton`, `CustomTextInput`, `CustomAvatar`, `CustomCard`, `CustomBadge`, etc.)
- `components/features/` — domain components (`FriendCard`, `GroupCard`, `ExpenseItem`, `SettlementCard`, `CategoryPickerModal`, etc.)
- `PremiumHeader` — custom `headerTitle` component used in every Stack screen
- Animations use `react-native-reanimated` v4; gesture handling uses `react-native-gesture-handler`

### IDs and currencies

All entity IDs are UUID v4 via `react-native-uuid`. Currency amounts are stored as `REAL` (SQLite). Default currency is `USD`; user preference stored on the `users` table and in profile.

### OCR / Voice / AI features

- **Scan Bill** (`app/expense/scan.tsx`) — `expo-camera` → `react-native-mlkit-ocr` → `utils/ocrParser.ts` (total extraction) + `utils/receiptItemParser.ts` (line items)
- **Voice expense** — `expo-speech-recognition` (on-device, no API); parsed in `app/expense/add.tsx`
- **Debt simplification** — local algo in `utils/debtSimplifier.ts`; Supabase Edge Function version in `supabase/functions/simplify-debts/` called via `services/debtSimplifyApi.ts`
