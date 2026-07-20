# Evenly — Feature TODO

---

## Project Stack

### Current (Local-first)
- [x] Expo (expo-router v6, React Native 0.81)
- [x] Redux Toolkit (global state)
- [x] expo-sqlite (local SQLite — offline-first)
- [x] TypeScript
- [x] Custom fonts via expo-font (Inter_18pt)

### Planned (Full Stack Upgrade)
- [x] Supabase — auth, PostgreSQL database, real-time subscriptions
- [ ] Supabase Edge Functions — debt simplification algo runs server-side
- [ ] Google Vision API or GPT-4o — receipt OCR + AI line-item extraction
- [ ] Firebase Cloud Messaging (FCM) — push notifications (iOS + Android)
- [x] Full cloud sync — all 12 tables synced to Supabase (push on write, pull on login) via sync services + `cloudRestore.ts`
- [x] Offline-first sync queue — `services/syncQueue.ts` + `services/syncProxy.ts`, SQLite queue table, NetInfo listener, auto-replay on reconnect, 5-retry drop
- [ ] UPI / Venmo / PayPal / Apple Pay SDK — in-app payment settlement
- [ ] OTP Service — SMS/email OTP verification for auth flows (login, password reset, account actions)

---

## Phase 1 — Foundation & Auth

### 1.1 Auth / Onboarding
- [x] Splash screen — clean dark background (placeholder icon removed), transitions into branded animated splash
- [x] Native Google Sign-In — `@react-native-google-signin/google-signin` (device account picker, no browser) → Supabase `signInWithIdToken`; `signInWithGoogle()` in `services/authService.ts`, `googleLogin()` in `hooks/useAuth.ts`. Needs a dev-client build, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Web client), and the build keystore's SHA-1 registered in Google Cloud/Firebase. Web-browser OAuth (`signInWithOAuth` + `expo-web-browser`/`expo-auth-session`) kept for Apple/other providers.
- [x] Session persistence fix — only explicit SIGNED_OUT logs user out (no accidental logouts)
- [x] Onboarding carousel (4 slides: Welcome, Voice, Balance, Crew) — `app/onboarding.tsx` — dark theme, Evenly branding
- [x] Registration screen (name, email, password) — `app/(auth)/register.tsx`
- [x] Login screen (email/password) — `app/(auth)/login.tsx`
- [x] Forgot password screen (email OTP flow) — `app/(auth)/forgot-password.tsx`
- [x] Profile setup after registration (avatar, currency preference) — `app/(auth)/profile-setup.tsx`
- [x] Persist auth state across sessions (AsyncStorage / SecureStore)
- [x] Supabase Auth integration (replace local DB auth)
- [x] Logout with confirmation dialog — `app/(tabs)/account.tsx`

### 1.2 User Profile
- [x] View/edit profile (name, email, phone, avatar) — `app/profile/edit.tsx`
- [x] Random emoji avatars for users with no profile picture — deterministic per name via `getAvatarEmoji()` in `utils/formatters.ts`, rendered in `CustomAvatar`
- [x] Change password — links to forgot-password OTP flow
- [x] Set default currency — searchable dropdown modal with 50+ currencies in edit profile
- [x] Notification preferences toggle — improved with dynamic icon, subtitle, full-row tap, persisted to SecureStore
- [x] App theme toggle (light / dark / system) — cycles in account.tsx, stored in Redux + SecureStore
- [x] Account deletion — double-confirm alert in account.tsx

---

## Phase 2 — Friends

### 2.1 Friends Management
- [x] Add friend by email or phone — modal with name, email, phone fields in `app/(tabs)/friends.tsx`
- [x] Add friend from device contacts — `expo-contacts` integration, contact picker modal
- [x] Share invite link — native Share sheet with deep link via `expo-sharing`
- [x] Invite methods modal (Manual / Contacts / Share Link) — FAB opens options sheet
- [x] Search friends list — debounced search bar in `app/(tabs)/friends.tsx`
- [x] View friend profile — `app/friend/[id].tsx`
- [x] Remove friend (with warning if active balance exists) — `app/friend/[id].tsx`
- [x] Friend request accept/decline flow — `services/friendRequestService.ts` + Accept/Decline UI in `app/(tabs)/friends.tsx` (registered users only; ghost friends still added directly)
- [x] Friends list sorted by balance (highest owed first) — sorted by `Math.abs(balance)` descending

### 2.2 Friend Balance View
- [x] Per-friend balance detail screen — `app/friend/[id].tsx` (redesigned: balance card, info card, remove button)
- [x] Real balance computed from expenses + settlements — `usersDb.computeFriendBalances()`
- [x] Balances refresh on tab focus via `useFocusEffect`
- [x] List of all shared expenses with that friend — collapsible "Shared Expenses" section in `app/friend/[id].tsx`
- [ ] Grouped by group context vs. non-group
- [x] Settle up button per friend — sticky bottom in `app/friend/[id].tsx`

---

## Phase 3 — Groups

### 3.1 Group Creation & Management
- [x] Create group (name, group type, members) — `app/group/create.tsx`
- [x] Group types with distinct Ionicons: Home, Trip, Couple, Work, Food, Sports, Party, Family, Roommates, Other — `GroupCard.tsx`
- [x] Add/remove members — `useGroups` hook + DB queries
- [x] Edit group name and type — `app/group/edit/[id].tsx`
- [x] Group avatar / color picker — color picker in edit screen
- [x] Archive group (hides from active list, preserves history) — button in group detail settings
- [x] Delete group (only when all balances are $0) — balance check + confirmation alert
- [x] Leave group (with balance check) — balance check + confirmation alert
- [x] View group members list in group detail screen — members section with avatars

### 3.2 Group Balance Overview
- [x] Total group spending displayed at top — "Balances" card in group detail
- [x] Per-member balance inside the group — color-coded per-member net balances (green/red/grey)
- [ ] "Simplify debts" toggle — algorithm done in `utils/debtSimplifier.ts`, no UI
- [ ] Visual debt graph between members

---

## Phase 4 — Expenses

### 4.1 Add Expense
- [x] Add expense form: description, amount, category — `app/expense/add.tsx`
- [x] Choose who paid (single payer) — payer picker modal selects from group members or friends
- [ ] Choose who paid (multiple payers) — split the "paid" amount across people
- [ ] Split type selection UI:
  - [x] Equal split — `utils/splitCalculator.ts`
  - [x] Exact amounts — `utils/splitCalculator.ts`
  - [x] Percentage split — `utils/splitCalculator.ts`
  - [x] Share-based split — `utils/splitCalculator.ts`
- [x] Group expense splits among all group members — `app/expense/add.tsx` loads members via `loadMembers()`
- [x] Group selector in Add Expense form — modal picker with search, selects group + loads members
- [x] Add expense between friends only (non-group) — friend multi-select picker in add expense
- [x] Attach notes / memo — multiline text input in `app/expense/add.tsx`
- [x] Assign category — modal picker with search, custom categories, color picker
- [x] Set expense date (past dates allowed) — `@react-native-community/datetimepicker` in `app/expense/add.tsx`
- [ ] Multi-currency entry with conversion
- [ ] Currency switch button on amount input — tap ₹ badge to change currency inline

### 4.15 Expense Detail
- [x] Expense detail screen with full info — `app/expense/[id].tsx`
- [x] Split breakdown per person (avatar, name, amount, paid/owes label)
- [x] Splits loaded from DB (survives app restart)
- [x] Payer name resolved from users table
- [x] Category Ionicons badge + info card with icons (replaced emoji with `CATEGORY_IONICONS` map)
- [x] Auto-shrinking amount text for large numbers

### 4.2 Edit / Delete Expense
- [x] Edit expense screen — `app/expense/edit/[id].tsx` (pre-filled form, edit description/amount/category/notes)
- [x] Edit + Delete buttons on expense detail screen — `app/expense/[id].tsx`
- [x] Soft delete with confirmation dialog — `expensesDb.softDelete()` in `db/queries/expenses.ts`
- [x] Restore deleted expense — "Deleted Expenses" modal in Account settings with per-item Restore button
- [ ] View expense history / audit trail

### 4.3 Recurring Expenses ⭐ Edge Feature
- [x] Mark expense as recurring: weekly / fortnightly / monthly / yearly — toggle + interval picker in `app/expense/add.tsx`
- [x] Auto-split on due date — `services/recurringExpenses.ts` processes on app startup, catches up missed dates
- [x] Push reminder notification before due date — 5 days and 2 days before `next_due`, via `scheduleRecurringReminders()` in `nudgeService.ts`
- [x] Edit or stop recurring series — `app/recurring.tsx` with toggle switches per template
- [ ] Recurring expense history — show all past auto-generated entries
- [x] Schema: `recurring_templates` table — `db/schema.ts` (id, description, amount, interval, next_due, active, group_id, member_ids, etc.)
- [x] Manage recurring screen — `app/recurring.tsx` with active count, est. monthly cost, delete

### 4.4 Expense List & Filtering
- [x] Chronological expense list per group — `app/group/[id].tsx`
- [x] Filter state (date range, category, payer) — `expensesSlice` + `selectFilteredExpenses`
- [x] Search expenses by description keyword
- [x] Filter UI (bottom sheet to apply filters) — category chips + search in group detail
- [ ] Pagination / infinite scroll

---

## Phase 5 — Settlement

### 5.1 Settle Up
- [x] Settle up screen — `app/settle/index.tsx` (redesigned: clean row layout, search, staggered animations)
- [x] Record cash payment — `useSettlements.settleUp()` persists to SQLite
- [x] Direction toggle: "I paid them" (red) / "They paid me" (green) — swaps from/to user IDs
- [x] Group-scoped settle — Settle Up button in group detail passes `groupId`, settle screen shows group members with per-member balances
- [x] Settlement saved to DB — `db/queries/settlements.ts`
- [x] Settlement confirmation flow — payer creates `pending` request, recipient confirms/rejects
- [x] Settlement status field (`pending` / `confirmed` / `rejected`) — `types/settlement.ts`
- [x] Only `confirmed` settlements reduce balances — `db/queries/groups.ts` filters by status
- [x] Pending settlement requests on Dashboard — `app/(tabs)/index.tsx`
- [x] Confirm/Reject buttons on SettlementCard — `components/features/SettlementCard.tsx`
- [x] DB migration for status column with backfill — `db/index.ts`
- [x] Settle up within a group (optimal payment suggestions) — `debtSimplifier` + UI in `app/group/[id].tsx`
- [x] Settlement history log UI — per-group history with status badges in `app/group/[id].tsx`

### 5.2 Debt Simplification
- [x] Algorithm: minimize number of transactions — `utils/debtSimplifier.ts`
- [x] Supabase Edge Function version — `supabase/functions/simplify-debts/index.ts` + client `services/debtSimplifyApi.ts`
- [ ] Display simplified repayment plan UI
- [ ] Toggle between simplified and raw balances

### 5.3 Payment App Detector ⭐ Edge Feature (Android only)

> When the user opens a payment app (GPay, PhonePe, Paytm, etc.) and leaves it,
> Evenly fires a notification: "Just paid? Tap to log it in Evenly" — one tap opens Add Expense.

- [ ] `PaymentMonitorService.kt` — Android Foreground Service, polls `UsageStatsManager` every 3s for payment app in foreground
- [ ] `PaymentMonitorModule.kt` — React Native bridge (start / stop / isRunning / hasPermission)
- [ ] `PaymentMonitorPackage.kt` — registers the native module
- [ ] Update `MainApplication.kt` — register `PaymentMonitorPackage`
- [ ] Update `AndroidManifest.xml` — `PACKAGE_USAGE_STATS` permission + foreground service declaration + `FOREGROUND_SERVICE_TYPE_DATA_SYNC`
- [ ] `services/paymentMonitor.ts` — JS wrapper around the native module
- [ ] Permission request UI — explain why, button to open Android Settings > Special app access > Usage access
- [ ] Notification deep-links to `/expense/add` on tap
- [ ] Settings toggle in Account screen — enable/disable the monitor
- [ ] Payment apps to detect: GPay (`com.google.android.apps.nbu.paisa.user`), PhonePe (`com.phonepe.app`), Paytm (`net.one97.paytm`), BHIM (`in.org.npci.upiapp`), Amazon Pay (`in.amazon.mshop.android.shopping`), WhatsApp (`com.whatsapp`), Venmo (`com.venmo`), Cash App (`com.squareup.cash`), PayPal (`com.paypal.android.p2pmobile`)
- [ ] Cooldown: don't re-notify within 5 minutes of last notification (avoid spam)
- [ ] Requires rebuild after native changes (`npx expo run:android`)

### 5.4 Real-Time Payment Integration ⭐ Edge Feature
- [ ] "Pay Now" button next to every balance owed
- [ ] UPI deep-link integration (India — GPay, PhonePe, Paytm)
- [ ] Venmo deep-link integration
- [ ] PayPal SDK integration
- [ ] Apple Pay (iOS only) via Stripe or native API
- [ ] Auto-mark settlement as paid after successful payment callback
- [ ] Payment status: pending / completed / failed
- [ ] Schema: add `payment_method` and `payment_ref` columns to `settlements`

---

## Phase 6 — Dashboard / Activity

### 6.1 Home Dashboard
- [x] Total "you owe" and "you are owed" summary — inline balance card with net balance + breakdown
- [x] Category donut chart — expandable, shows weekly bar chart on tap with per-day detail tooltips
- [x] Time-based greeting with emoji (morning/afternoon/evening)
- [x] Animated notification bell — shakes when pending requests exist
- [x] Staggered card enter animations — `FadeInDown.springify()` with delays
- [x] Collapsible pending requests banner — amber banner, tap to expand
- [x] Recent activity feed (last 15 expenses / settlements) — collapsible "Recent Activity" on dashboard
- [x] Quick action pills: Expense, Scan, Settle, Group — with `AnimatedPressable` scale effect
- [ ] Unread activity badge on bottom tab

### 6.2 Activity Feed
- [ ] `activitySlice` Redux slice — NOT created yet
- [ ] Real-time activity log via Supabase real-time subscriptions
- [ ] Per-group activity feed
- [x] Timestamps with relative formatting — `utils/dateUtils.timeAgo()`
- [ ] Mark all as read

---

## Phase 7 — Smart Nudges ⭐ Edge Feature

> Smart payment reminders that aren't annoying

- [x] Day 3 — gentle nudge: "Hey, you owe [name] $X for [expense]" — `services/nudgeService.ts`
- [x] Day 7 — contextual: "[Name] covered dinner last week, want to settle up?"
- [x] Day 14+ — escalating tone: "This is overdue, settle up with [name]"
- [x] User reminder preferences: Off / Weekly / Smart — dropdown in `app/(tabs)/account.tsx`
- [x] Per-friend mute (never remind me about this person) — toggle in `app/friend/[id].tsx`
- [x] Scheduled via `expo-notifications` local notifications (runs on app startup)
- [x] Preferences stored in SecureStore (nudge_frequency, nudge_muted_friends)

---

## Phase 8 — Push Notifications

- [x] FCM setup (Firebase Cloud Messaging) for iOS + Android — `services/firebase.ts`, token saved to Supabase user metadata
- [x] Expo Notifications SDK integration — foreground handler shows system notifications via `expo-notifications`
- [x] Notification types:
  - [x] New expense added by someone in your group — `pushNotify.expenseAdded()`
  - [x] Someone settled up with you — `pushNotify.settlementRequested/Confirmed/Rejected()`
  - [ ] Smart nudge reminders (Phase 7)
  - [ ] Recurring expense auto-generated
  - [x] Someone added you to a group — `pushNotify.addedToGroup()`
- [ ] In-app notification center with unread count
- [ ] Notification settings (enable/disable per type)
- [ ] Deep-link from notification to relevant screen

---

## Phase 9 — Receipt Scanning & AI ⭐ Edge Feature

### 9.1 Basic OCR Receipt Scanner
- [x] In-app camera with `expo-camera` CameraView — live viewfinder, receipt guide frame overlay
- [x] Flash toggle in camera view
- [x] Receipt frame guide with corner markers — visual alignment aid
- [x] Gallery fallback via `expo-image-picker` — if camera permission denied or user prefers
- [x] Image preprocessing via `expo-image-manipulator` — resize for optimal OCR
- [x] On-device OCR via `react-native-mlkit-ocr` — no network needed
- [x] Smart total extraction — keyword-matched (grand total, amount due, etc.) with fallback to largest number
- [x] Auto-fill amount and description fields from OCR result
- [x] Auto-detect category from receipt keywords (restaurant→Food, uber→Transport, etc.)
- [x] OCR confidence indicator (high/medium/low) shown to user
- [x] "Scan Bill" quick action on dashboard — `app/(tabs)/index.tsx`
- [x] 3-step flow: capture → enter details (amount, description, category, split with) → confirm & save
- [x] Receipt image preview with retake option
- [ ] Upload receipt photo to Supabase Storage
- [ ] Google Vision API / GPT-4o call → higher accuracy cloud OCR (upgrade from on-device)
- [ ] Schema: `receipt_images` table (expense_id, storage_url, ocr_raw_json)

### 9.2 AI Line-Item Scanner (Full Edge Feature)
> User takes a photo → app extracts every line item → lets users assign
> each item to specific people. No more splitting the whole bill equally
> when someone ordered lobster and you got salad.

- [ ] GPT-4o Vision API call → extract itemized receipt (item name, qty, price)
- [ ] Line-item assignment screen — each person taps the items they ordered
- [ ] Tax + tip distribution — proportional to each person's subtotal
- [ ] Per-person total calculated automatically
- [ ] "Split This Item" option for shared items (e.g., shared appetizer)
- [ ] Preview screen showing each person's total before confirming
- [ ] Save as expense with `exact` split type using calculated amounts
- [ ] Fallback: manual item entry if OCR fails or receipt is unclear

### 9.3 Bill Split at Restaurant — Quick Mode ⭐ Edge Feature
> Scan receipt → each person taps their items → auto-calculates
> tax + tip → shows exact amount per person. Done in 30 seconds.

- [x] "Split by Items" button in Scan Bill details step — `app/expense/scan.tsx`
- [x] Camera scan → ML Kit OCR extracts line items via `utils/receiptItemParser.ts`
- [x] Participants loaded from selected group or friends (reuses existing picker)
- [x] Tap-to-assign UI — each item shows avatar circles, tap to toggle assignment
- [x] Shared items split equally among selected people
- [x] Tax % and Tip % stepper controls (+/- buttons)
- [x] Per-person summary screen with items + proportional tax/tip breakdown
- [x] One tap to save expense with `exact` split type using calculated amounts
- [x] Camera button added to Add Expense screen header — `app/expense/add.tsx`
- [ ] Drag an item to reassign (not implemented — tap is faster on mobile)
- [x] Manual item entry fallback if OCR fails — inline name + price inputs with add button on "Split by Items" step

---

## Phase 10 — Voice Add Expense ⭐ Edge Feature

> Speak naturally to add an expense — "I spent 500 on dinner at Pizza Hut" →
> app extracts amount, description, and category automatically.

### 10.1 Voice Input & Transcription
- [x] `expo-speech-recognition` integration — on-device speech-to-text, no API calls
- [x] Microphone permission request (iOS + Android) — auto-request on first tap
- [x] "Voice" quick action on Dashboard — `app/(tabs)/index.tsx`
- [x] Real-time speech-to-text with pulse animation on mic button
- [x] Tap-to-start, tap-to-stop — mic button toggles recording
- [x] Auto-stop on silence — native speech recognizer handles end-of-speech
- [x] Fallback: shows error + manual editing if permission denied or no speech detected

### 10.2 Offline Natural Language Parsing
- [x] Parse spoken text → extract: amount, description, category, date, group/friend — `utils/voiceParser.ts`
- [x] Supported phrases:
  - "I spent 500 on dinner" → 500, dinner, Food category
  - "Paid 1200 for Uber to airport" → 1200, Uber to airport, Transport
  - "Coffee 250 yesterday" → 250, Coffee, Food, yesterday's date
  - "Split grocery 3000 in Roommates group" → 3000, grocery, Groceries, Roommates group
  - "Dinner with Alex 800" → 800, Dinner, Food, friend hint: Alex
- [x] Offline regex-based extraction for amount, description, date, group/friend hints
- [x] Category auto-mapping from keywords — reuses `CATEGORY_KEYWORDS` from `ocrParser.ts`
- [x] Auto-match group/friend hints to actual groups and friends in Redux store
- [ ] GPT-4o / Claude API call for NLP extraction (AI upgrade for complex sentences)

### 10.3 Confirmation & Save Flow
- [x] Voice result → pre-filled review form with amount, description, category
- [x] All fields editable before confirming
- [x] One-tap "Add Expense" to save
- [x] "Try Again" button to re-record
- [x] Matched group/friend shown as hint badges
- [x] Date offset shown as hint badge (e.g. "Yesterday", "2 days ago")

### 10.4 Voice Expense Screen
- [ ] `app/expense/voice.tsx` — dedicated voice expense screen (file missing, voice is inline in add.tsx)
- [x] Large mic button (80px) with animated pulse ring (listening state) — in `app/expense/add.tsx`
- [x] Transcribed text shown in real-time as user speaks (interim results)
- [x] Confidence indicator (high/medium/low) on parsed result
- [x] Category selector with modal picker

### 10.5 Schema & State
- [x] No new DB tables needed — saves as regular expense via existing `expenses` table
- [x] No Redux slice needed — local component state handles recording + parsing
- [ ] Analytics: track voice vs. manual expense creation ratio

---

## Phase 11 — Trip Mode ⭐ Edge Feature

> Set a trip budget, track spending by category, show live burn rate,
> generate full trip report with charts at the end.

- [x] Trip creation: name, destination, dates, members, total budget — `app/group/trip-budget.tsx`
- [x] Trip budget breakdown by category (food, transport, accommodation, activities, miscellaneous) — 5 category inputs with auto-distribute
- [x] Live burn rate — donut chart + "$420 / $1200" + percentage in `TripBudgetDashboard`
- [x] Per-day spending view — daily bar chart in `app/group/trip-report.tsx`
- [x] Category progress bars (e.g., Food: $180/$300) — `CategoryProgressBar` component, turns red when over budget
- [x] Trip expenses list filtered to trip date range — group detail auto-filters when trip budget exists
- [x] "Trip Mode" badge on group card — `TripModeBadge` with airplane icon + days left
- [x] "Trip Mode" toggle in group creation — Switch in `app/group/create.tsx`, auto-redirects to budget setup
- [x] End-of-trip report — `app/group/trip-report.tsx`:
  - [x] Total spent vs. budget with over/under status
  - [x] Category breakdown chart with progress bars
  - [x] Who paid the most / least (top spenders ranked list)
  - [x] Day-by-day spending timeline (horizontal bar chart)
  - [ ] Shareable PDF or image export
- [x] Schema: `trip_budgets` table (id, group_id, destination, start/end date, total_budget, 5 category budget columns, currency)
- [x] Redux: `tripBudgetsSlice` + memoized selectors
- [x] Hook: `useTripBudget(groupId)` — loads budget, computes summary (burn rate, per-day, category breakdown)
- [x] Category mapping: expense categories auto-mapped to 5 trip budget categories via `TRIP_BUDGET_CATEGORY_MAP`

---

## Phase 11.5 — Personal Expense Tracker

> Track your own spending without a group. Quick-add expenses, set monthly
> budgets by category, see where your money goes. No splitting, no friends — just you.

### Core
- [x] Quick add personal expense — `app/expense/add.tsx?personal=1` simplified flow
- [x] Personal wallet view — `app/personal.tsx` with hero card, mini donut, quick actions, categories, expense list
- [x] Monthly summary card — total spent this month, vs last month %, daily average, all-time total, expense count
- [x] "Personal" section on dashboard — Personal Wallet card on dashboard, always visible, navigates to `app/personal.tsx`

### Budgeting
- [x] Monthly budget — set a total monthly spending limit — `app/personal-budget.tsx` setup/edit screen
- [x] Category budgets — per-category monthly limits with "Split Evenly" button — `app/personal-budget.tsx`
- [x] Budget progress bars — animated bars on `app/personal.tsx` (total + per-category)
- [x] Budget alerts — warning banner on Personal Wallet when total or category budget >80% (amber) or >100% (red)
- [x] Schema: `personal_budgets` table — `db/schema.ts` (user_id, month, total_budget, category_budgets JSON, currency)
- [x] Budget card in Personal Wallet — shows % used, remaining, category mini-bars, color-coded (green/amber/red)
- [x] "Set a monthly budget" prompt when no budget exists — navigates to setup screen

### Insights
- [x] Smart Analysis screen — `app/personal-analytics.tsx` with 3 tabs (Overview, Categories, Expenses)
- [x] Category breakdown animated donut chart — fills from zero with easeOutExpo stagger
- [x] Spending trends — weekly animated bar chart + 6-month monthly trend bars (grow from zero)
- [x] Smart insights — top category, biggest expense, daily average, trend vs previous period, most frequent
- [x] Period selector — This Week / This Month / Last Month / All Time filters
- [x] All-time category fallback when current period is empty
- [ ] Top merchants — "Starbucks: $120 this month (15 visits)"

### Organization
- [x] Search & filter — search by description and category in Personal Wallet
- [x] Tags — comma-separated labels ("vacation", "work lunch") on personal expenses, stored in `tags` column, shown as pill chips on detail
- [x] Recurring personal expenses — rent, subscriptions, gym — auto-logged via `recurring_templates` + `services/recurringExpenses.ts`
- [ ] Filter by date range, amount range, tags

### What it reuses
- `expenses` table (group_id = null, no splits)
- `CategoryProgressBar`, `SpendingCharts`, category system
- `CustomAmountInput`, date picker, category picker

---

## Phase 12 — Expense Chat & Disputes ⭐ Edge Feature

> Mini chat per expense. "I didn't drink that night" → edit the split
> right from the comment thread.

- [x] Comment thread per expense — `db/queries/comments.ts` + inline UI on `app/expense/[id].tsx`
- [x] Send text message on any expense — comment input with send button
- [ ] Edit your own comment
- [x] Delete your own comment — X button on own comments with confirmation
- [ ] Mention @user in comment (triggers notification)
- [ ] "Dispute" action in comment — opens Edit Expense for that person's split
- [ ] Edit split amount inline from comment thread without leaving the conversation
- [ ] Comment count badge on ExpenseItem
- [ ] Real-time comment sync via Supabase real-time
- [ ] Comment notification to all expense participants

---

## Phase 13 — Group Analytics ⭐ Edge Feature

> Spending analytics per group + fun stats

- [ ] `app/group/analytics/[id].tsx` screen
- [ ] Who pays the most vs. least (bar chart)
- [ ] Monthly spending trend (line chart)
- [ ] Category breakdown per group (pie/donut chart)
- [ ] Fun stats:
  - [ ] "Alex has paid for 73% of all pizza"
  - [ ] "Jamie always pays for Ubers"
  - [ ] "You've never paid for breakfast"
- [ ] All-time total spent by group
- [ ] Average expense amount
- [ ] Most expensive single expense
- [ ] Biggest debtor / creditor in the group
- [ ] Chart library: `react-native-chart-kit` or `victory-native`
- [ ] Export analytics as image (share to WhatsApp etc.)

---

## Phase 14 — Reports & Insights

- [ ] Monthly spending summary per group
- [ ] Category-wise spending breakdown (pie chart) across all groups
- [ ] Spending trends over time (line chart)
- [x] Export all expenses to CSV — "Export Data" in Account settings, generates CSV + native share sheet via `expo-sharing`
- [ ] Total spent vs. total owed comparison
- [ ] Year-in-review summary (à la Spotify Wrapped)

---

## Phase 15 — Settings & Preferences

- [x] Custom themes / theme picker — Midnight Soft, Dream Haze, Aqua Rave club themes in the Account theme sheet
- [ ] Currency settings (default currency, supported currencies list)
- [ ] Language/locale setting
- [ ] App lock (PIN / biometric via `expo-local-authentication`)
- [ ] Data backup (export full SQLite DB)
- [ ] Restore from backup
- [x] Privacy policy screen — `app/privacy.tsx` (plain-English, matches actual data practices; terms doc still TODO)
- [ ] Rate the app prompt (after 5th settled expense)
- [x] Help & FAQ screen — `app/help.tsx` (8 expandable FAQs)
- [x] Contact support — mailto button on the Help screen

---

## Database Schema

### Current Local SQLite Tables (done)
- [x] `users`
- [x] `groups`
- [x] `group_members`
- [x] `expenses`
- [x] `expense_splits`
- [x] `settlements`
- [x] `activity_log` — schema only, no query module
- [x] `comments` — schema only, no query module
- [x] `custom_categories` — user-defined expense categories with color

### New Tables Needed
- [ ] `receipt_images` — expense_id, storage_url, ocr_raw_json, created_at
- [ ] `receipt_line_items` — receipt_id, description, amount, assigned_user_id
- [x] `trip_budgets` — group_id, destination, total_budget, 5 category budget columns, start_date, end_date, currency
- [x] `recurring_templates` — description, amount, interval, next_due, active, group_id, member_ids, is_personal, created_by
- [x] `personal_budgets` — user_id, month, total_budget, category_budgets JSON, currency (UNIQUE per user+month)
- [ ] `reminder_preferences` — user_id, frequency ENUM, muted_friend_ids TEXT
- [ ] `payment_intents` — settlement_id, method, external_ref, status, created_at

### Supabase Migration (Planned)
- [x] Mirror all local SQLite tables in Supabase PostgreSQL — `supabase/migrations/001_create_all_tables.sql`
- [x] Row-Level Security (RLS) policies — users only see their own groups/expenses — all 12 tables covered
- [ ] Real-time subscriptions on `expenses`, `settlements`, `comments`
- [ ] Supabase Storage bucket for receipt images
- [ ] Supabase Edge Functions: debt simplification, recurring expense scheduler, OCR proxy

---

## Redux Slices

- [x] `authSlice` — `store/slices/authSlice.ts`
- [x] `groupsSlice` — `store/slices/groupsSlice.ts`
- [x] `expensesSlice` — `store/slices/expensesSlice.ts`
- [x] `friendsSlice` — `store/slices/friendsSlice.ts`
- [x] `settlementsSlice` — `store/slices/settlementsSlice.ts`
- [ ] `activitySlice` — NOT created yet
- [x] `uiSlice` — `store/slices/uiSlice.ts`
- [ ] `notificationsSlice` — unread count, notification list
- [x] `tripBudgetsSlice` — `store/slices/tripBudgetsSlice.ts` — trip budget, burn rate, category totals
- [x] `budgetsSlice` — `store/slices/budgetsSlice.ts` — current personal budget state
- [ ] `analyticsSlice` — cached analytics data per group
- [ ] `receiptSlice` — OCR scan state, line items, assignment map

---

## Component Library

### UI Primitives — Current
- [x] `CustomText`
- [x] `CustomTextInput`
- [x] `CustomButton`
- [x] `CustomAvatar`
- [x] `CustomBadge`
- [x] `CustomCard`
- [x] `CustomDivider`
- [x] `CustomLoader`
- [x] `CustomSearchBar`
- [x] `CustomChip`
- [x] `CustomAmountInput`
- [x] `AnimatedPressable` — scale-on-press with `withSpring` + haptic feedback

### UI Primitives — Needed
- [ ] `CustomModal` — bottom sheet + center modal
- [ ] `CustomHeader` — screen header with back + action buttons
- [ ] `CustomToast` — render component (state exists in uiSlice, no UI)
- [ ] `CustomBottomSheet` — swipeable bottom sheet (for filters, settle up, etc.)
- [x] `CustomDatePicker` — uses `@react-native-community/datetimepicker` directly in expense forms
- [x] `CustomProgressBar` — `CategoryProgressBar` used for trip budget burn rate
- [ ] `CustomSlider` — tip/tax percentage slider in restaurant mode

### Feature Components — Current
- [x] `ExpenseItem`
- [x] `GroupCard`
- [x] `MemberChip`
- [x] `FriendCard`
- [x] `BalanceLabel`
- [x] `SettlementCard`
- [x] `DebtSummaryCard`
- [x] `CategoryDonut` — expandable donut chart with weekly bar chart drill-down
- [x] `WeeklyBarChart` — gradient bars with tappable day detail tooltips
- [x] `SpendingCharts` — `components/features/SpendingCharts.tsx`

### Feature Components — Needed
- [x] `SkeletonLoader` — shimmer loading skeletons for dashboard, cards, expense lists (`components/ui/SkeletonLoader.tsx`)
- [ ] `ActivityItem` — activity feed row with icon and timestamp
- [ ] `SplitBreakdownRow` — per-person amount row in expense detail
- [ ] `CategoryIcon` — icon + label for expense category
- [ ] `CurrencyRow` — currency selector row
- [ ] `ReceiptLineItem` — tappable row for AI line-item assignment screen
- [x] `TripBudgetDashboard` — donut chart burn rate + category progress bars
- [x] `CategoryProgressBar` — horizontal bar with spent/budgeted, turns red when over
- [x] `TripModeBadge` — airplane icon pill badge with days left
- [ ] `AnalyticsChart` — wrapper around chart library for consistent styling
- [ ] `FunStatCard` — "Alex paid for 73% of pizza" card
- [ ] `PayNowButton` — UPI/Venmo/PayPal one-tap pay button
- [ ] `NudgeBanner` — inline reminder card in friend/group detail
- [ ] `CommentBubble` — chat bubble in expense comment thread

---

## App Screens — Current
- [x] `(auth)/login`
- [x] `(auth)/register`
- [x] `(tabs)/index` — Dashboard
- [x] `(tabs)/groups`
- [x] `(tabs)/friends`
- [x] `(tabs)/account`
- [x] `group/[id]`
- [x] `group/create`
- [x] `expense/add`
- [x] `expense/[id]`
- [x] `friend/[id]`
- [x] `settle/index`

## App Screens — Needed
- [x] `(auth)/forgot-password` — exists at `app/(auth)/forgot-password.tsx`
- [x] `group/edit/[id]` — edit name, type, color picker
- [x] `expense/edit/[id]` — exists at `app/expense/edit/[id].tsx`
- [ ] `expense/[id]/comments` — chat thread
- [x] `expense/scan` — scan bill → enter details → confirm & save
- [ ] `expense/restaurant` — quick restaurant bill split mode
- [ ] `group/[id]/analytics` — group analytics + fun stats
- [ ] `group/[id]/members` — members list with balances
- [x] `group/trip-budget` — trip budget create/edit form
- [x] `group/trip-report` — full trip report with charts + top spenders
- [x] `personal-budget` — Monthly budget setup/edit with total + category inputs — `app/personal-budget.tsx`
- [x] `recurring` — Manage recurring expenses, toggle active, delete — `app/recurring.tsx`
- [ ] `settle/[id]` — settle up with a specific person
- [ ] `notifications/index` — notification center
- [ ] `settings/index` — settings hub
- [ ] `settings/currency`
- [ ] `settings/notifications`
- [ ] `settings/security` — PIN / biometrics
- [x] `profile/edit` — exists at `app/profile/edit.tsx`
- [x] `personal` — Personal Wallet with hero card, donut, quick actions, categories, expense list
- [x] `personal-analytics` — Smart Analysis with animated charts, 3 tabs, period selector, insights
- [x] `spending-detail` — Spending overview with animated donut + animated weekly bar chart

---

## UI Polish & Micro-interactions (done)

- [x] All emoji icons replaced with Ionicons across entire app (17 files)
- [x] `CATEGORY_IONICONS` map added to `constants/categories.ts`
- [x] Login brand updated: logo icon, "Evenly" branding across all screens
- [x] Tab bar: center floating + button, active dot indicator, updated icons
- [x] Account/Profile screen revamped — sectioned cards, colored icon badges, collapsible dropdowns
- [x] Haptic feedback on all interactive elements via `expo-haptics`
- [x] Success haptic on expense add + settlement confirm
- [x] `fontVariant: ['tabular-nums']` on all currency displays
- [x] Staggered `FadeInDown.springify()` enter animations on dashboard cards
- [x] `AnimatedPressable` component — scale 0.96 on press with `withSpring`
- [x] Dev build configured — `npx expo run:android` with all native modules
- [x] Test data seeder — `db/seed.ts` populates 4 friends, 3 groups, 15 expenses, 3 settlements
- [x] `react-native-svg` installed for chart rendering
- [x] App renamed to "Evenly" — app.json, package.json, all UI references
- [x] KeyboardAvoidingView fixed on Android — `behavior='height'` across all 13 screens
- [x] Edit Profile revamped — card-based layout, searchable currency dropdown modal (50+ currencies)
- [x] OCR receipt scanner improved — bottom-up total search, smarter number extraction, better description detection
- [x] Test data seeder removed from app startup (new users start clean)
- [x] Smart Nudges — 3-tier escalating local notifications via `expo-notifications`
- [x] Animated donut charts — segments fill from zero with easeOutExpo, staggered per segment
- [x] Animated bar charts — bars grow from zero with overshoot easing + label pop
- [x] Animated progress bars — grow from 0% with easeOutCubic
- [x] Consistent back button — rounded 36x36 `chevron-back` box across ALL screens (global Stack screenOptions)
- [x] Groups screen shows real per-group balances (was always "Settled Up")
- [x] Settle Up screen redesigned — clean rows, direction toggle (I paid / They paid me), group-scoped member list
- [x] Spending detail loads from DB directly (was reading stale Redux state)
- [x] Personal Wallet quick actions expanded — Add, Budget, Insights, Recurring
- [x] Dashboard spending card — animated donut + category dots + total amount
- [x] Personal Wallet — gradient hero card, mini animated donut, quick actions (Add/Insights/Scan), category progress bars
- [x] Smart Analysis — 3-tab layout (Overview/Categories/Expenses), period selector, animated charts, smart insights
- [x] Personal expense test data seeder — 15 realistic expenses across 8 categories
- [x] Dashboard Personal Wallet always visible — navigates to full wallet screen
- [x] Splash screen animation — `dollar origami real.png` animates from top-right to center like a paper plane (`app/_layout.tsx`)
- [x] App icons updated — all icon references (home screen, adaptive icon, splash) changed to `dollar origami real.png` in `app.json`
- [x] Android notification icon updated — changed to `black origami new.png` (transparent bg, EAS auto-resizes) in `app.json`
- [x] Dashboard "Overall Spending" donut fixed — `CategoryDonut` now shows empty state instead of returning null; expenses loaded in same `Promise.all` as balance data
- [x] Balance card layout fixed — "Owed"/"Owe" labels no longer truncated; `balanceSide` uses fixed pixel width instead of `width: '100%'` inside flex row
- [x] Settlement reject race condition fixed — removed `loadPendingSettlements` calls from confirm/reject handlers; SQLite WAL flush race was restoring stale state via `setPendingForMe`
- [x] Circles header fixed — title on its own line above segment control (column layout, `alignSelf: 'stretch'`)
- [x] Personal Wallet hero number — `adjustsFontSizeToFit` + `minimumFontScale={0.6}` + `numberOfLines={1}` for large amounts
- [x] Tab bar label clipping fixed — explicit pixel width per tab calculated from `useWindowDimensions`, label wrapped in `alignSelf: 'stretch'` View
- [x] Circles tab icon — custom SVG `FriendsIcon` component (two people with raised arms, outline/filled states) using `react-native-svg`
- [x] Release APK built locally — `npx expo run:android --variant release`; APK at `android/app/build/outputs/apk/release/app-release.apk`
- [x] EAS CLI installed globally — `npm install -g eas-cli`
- [x] Review bug fixes (2026-07-19) — sync queue no longer drops ordering-transient FK failures; settle picker derives direction from balance sign; wallet-request button reports real success/failure; weekend insight timezone-safe; profile stats scoped to personal expenses; migration 009 schema reload
- [x] Shared `PickerSheet` bottom-sheet component — theme, font, and Payment Reminders pickers all use it (reminders was the last inline dropdown)
- [x] Branded Account footer — origami logo, wordmark, tagline, version chip from `expo-constants`
- [x] Avatar buddies expanded — ~2300 combos (crown/curl/bunny ears, sleepy/starry eyes, tongue/smirk mouths, 8 body tints); picker offers 24 seeds
- [x] Avatar removal actually persists — explicit `''` cleared value (COALESCE skipped null); legacy/dead photo URIs detected and labeled honestly
- [x] Share card polish — near-opaque backdrop, contained control panel, multi-debt hero total + paired from→to avatars, first-name rows with clash fallback

---

## Folder Structure

```
StickerSmash/
├── app/
│   ├── (auth)/           [x] login, register, forgot-password, profile-setup
│   ├── (tabs)/           [x] index, groups, friends, account, add-placeholder
│   ├── group/            [x] [id], create, edit/[id], trip-budget, trip-report   [ ] [id]/analytics, [id]/members
│   ├── expense/          [x] add, [id], edit/[id], scan  [ ] voice, restaurant, [id]/comments
│   ├── friend/           [x] [id]
│   ├── settle/           [x] index (group-scoped + direction toggle)  [ ] [id]
│   ├── personal.tsx      [x] Personal Wallet (hero, donut, budget card, categories, expenses)
│   ├── personal-budget.tsx    [x] Monthly budget setup/edit (total + category inputs)
│   ├── personal-analytics.tsx [x] Smart Analysis (3 tabs, animated charts, insights)
│   ├── recurring.tsx          [x] Manage recurring expenses (toggle, delete, est. monthly)
│   ├── spending-detail.tsx    [x] Spending overview (animated donut + bars, loads from DB)
│   ├── onboarding.tsx    [x] 4-screen dark theme onboarding
│   ├── notifications/    [ ] index
│   ├── settings/         [ ] index, currency, notifications, security
│   ├── profile/          [x] edit
│   ├── _layout.tsx       [x]
│   └── modal.tsx         [x]
├── components/
│   ├── ui/               [x] 12 built (+ AnimatedPressable)  [ ] 6 more needed
│   └── features/         [x] 13 built (+TripBudgetDashboard, CategoryProgressBar, TripModeBadge)  [ ] 6 more needed
├── store/
│   ├── slices/           [x] 8 built (+tripBudgets, +budgets) [ ] 3 more needed
│   └── selectors/        [x] memoized
├── db/
│   ├── schema.ts         [x] 11 tables (+trip_budgets, +personal_budgets, +recurring_templates) [ ] 3 more needed
│   ├── seed.ts           [x] test data seeder
│   └── queries/          [x] 7 modules (+tripBudgets, +personalBudgets, +recurringTemplates) [ ] activity, comments, receipts
├── services/             [x] supabase.ts, authService.ts, storage.ts, recurringExpenses.ts  [ ] ocr.ts, payments.ts, notifications.ts
├── hooks/                [x] 8 hooks (+useTripBudget, +usePersonalBudget) [ ] useReceipt, useAnalytics, useNotifications
├── utils/                [x] 6 utils            [ ] chartHelpers.ts, paymentLinks.ts
├── types/                [x] all core types (+tripBudget.ts, +budget.ts, +recurring.ts) [ ] receipt.ts, analytics.ts, payment.ts
├── constants/            [x] all done (+ CATEGORY_IONICONS)
└── assets/fonts/         [x] Inter, Raleway, Work Sans
```
