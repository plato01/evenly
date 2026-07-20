-- ============================================================
-- Evenly — Complete Supabase Setup
-- Run this entire file in Supabase SQL Editor (safe to re-run)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,
  avatar_url       TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'other',
  avatar_url  TEXT,
  color       TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID REFERENCES groups(id),
  description         TEXT NOT NULL,
  total_amount        NUMERIC NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  paid_by             UUID NOT NULL REFERENCES users(id),
  split_type          TEXT NOT NULL DEFAULT 'equal',
  category            TEXT NOT NULL DEFAULT 'other',
  date                TEXT NOT NULL,
  notes               TEXT,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval TEXT,
  is_personal         BOOLEAN NOT NULL DEFAULT false,
  tags                TEXT NOT NULL DEFAULT '',
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      NUMERIC NOT NULL,
  percentage  NUMERIC,
  shares      NUMERIC
);

CREATE TABLE IF NOT EXISTS settlements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id   UUID NOT NULL REFERENCES users(id),
  amount       NUMERIC NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  group_id     UUID REFERENCES groups(id),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  settled_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  metadata_json TEXT,
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  key        TEXT NOT NULL,
  label      TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'tag',
  color      TEXT NOT NULL DEFAULT '#C8D6E5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS trip_budgets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID NOT NULL UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
  destination          TEXT,
  start_date           TEXT NOT NULL,
  end_date             TEXT NOT NULL,
  total_budget         NUMERIC NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'USD',
  budget_food          NUMERIC NOT NULL DEFAULT 0,
  budget_transport     NUMERIC NOT NULL DEFAULT 0,
  budget_accommodation NUMERIC NOT NULL DEFAULT 0,
  budget_activities    NUMERIC NOT NULL DEFAULT 0,
  budget_miscellaneous NUMERIC NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_budgets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  month            TEXT NOT NULL,
  total_budget     NUMERIC NOT NULL,
  category_budgets JSONB NOT NULL DEFAULT '[]',
  currency         TEXT NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

CREATE TABLE IF NOT EXISTS recurring_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description       TEXT NOT NULL,
  total_amount      NUMERIC NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  category          TEXT NOT NULL DEFAULT 'other',
  split_type        TEXT NOT NULL DEFAULT 'equal',
  interval          TEXT NOT NULL,
  next_due          TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  group_id          UUID REFERENCES groups(id),
  paid_by           UUID NOT NULL REFERENCES users(id),
  member_ids        TEXT NOT NULL DEFAULT '[]',
  is_personal       BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_generated_at TIMESTAMPTZ
);


-- ─────────────────────────────────────────────────────────────
-- COLUMN MIGRATIONS (safe to run on existing tables)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE expenses     ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE expenses     ADD COLUMN IF NOT EXISTS tags        TEXT    NOT NULL DEFAULT '';
ALTER TABLE trip_budgets ADD COLUMN IF NOT EXISTS budget_miscellaneous NUMERIC NOT NULL DEFAULT 0;


-- ─────────────────────────────────────────────────────────────
-- SECURITY-DEFINER HELPER
-- Reads group_members without triggering RLS — breaks the
-- infinite recursion that happens when policies reference
-- group_members from within group_members policies.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT group_id FROM group_members WHERE user_id = auth.uid();
$$;


-- ─────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_budgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_budgets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- DROP OLD POLICIES (clean slate before recreating)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS users_self                ON users;
DROP POLICY IF EXISTS users_read_group_mates    ON users;
DROP POLICY IF EXISTS groups_member_read        ON groups;
DROP POLICY IF EXISTS groups_creator_write      ON groups;
DROP POLICY IF EXISTS groups_creator_update     ON groups;
DROP POLICY IF EXISTS gm_read                   ON group_members;
DROP POLICY IF EXISTS gm_insert                 ON group_members;
DROP POLICY IF EXISTS gm_delete                 ON group_members;
DROP POLICY IF EXISTS expenses_access           ON expenses;
DROP POLICY IF EXISTS splits_access             ON expense_splits;
DROP POLICY IF EXISTS settlements_access        ON settlements;
DROP POLICY IF EXISTS activity_access           ON activity_log;
DROP POLICY IF EXISTS categories_access         ON custom_categories;
DROP POLICY IF EXISTS trip_budgets_access       ON trip_budgets;
DROP POLICY IF EXISTS comments_access           ON comments;
DROP POLICY IF EXISTS personal_budgets_access   ON personal_budgets;
DROP POLICY IF EXISTS recurring_access          ON recurring_templates;


-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────

-- USERS: own row full access; read others in shared groups
CREATE POLICY users_self ON users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY users_read_group_mates ON users
  FOR SELECT USING (
    id IN (
      SELECT gm.user_id FROM group_members gm
      WHERE gm.group_id IN (SELECT get_my_group_ids())
    )
  );

-- GROUPS
CREATE POLICY groups_member_read ON groups
  FOR SELECT USING (
    id IN (SELECT get_my_group_ids()) OR created_by = auth.uid()
  );
CREATE POLICY groups_creator_write ON groups
  FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY groups_creator_update ON groups
  FOR UPDATE USING (created_by = auth.uid());

-- GROUP_MEMBERS (uses helper — no recursion)
CREATE POLICY gm_read ON group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR group_id IN (SELECT get_my_group_ids())
  );
CREATE POLICY gm_insert ON group_members
  FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY gm_delete ON group_members
  FOR DELETE USING (
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- EXPENSES
CREATE POLICY expenses_access ON expenses
  FOR ALL USING (
    created_by = auth.uid()
    OR paid_by = auth.uid()
    OR group_id IN (SELECT get_my_group_ids())
  );

-- EXPENSE_SPLITS
CREATE POLICY splits_access ON expense_splits
  FOR ALL USING (
    expense_id IN (
      SELECT id FROM expenses WHERE
        created_by = auth.uid()
        OR paid_by = auth.uid()
        OR group_id IN (SELECT get_my_group_ids())
    )
  );

-- SETTLEMENTS
CREATE POLICY settlements_access ON settlements
  FOR ALL USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- ACTIVITY_LOG
CREATE POLICY activity_access ON activity_log
  FOR ALL USING (user_id = auth.uid());

-- CUSTOM_CATEGORIES
CREATE POLICY categories_access ON custom_categories
  FOR ALL USING (user_id = auth.uid());

-- TRIP_BUDGETS
CREATE POLICY trip_budgets_access ON trip_budgets
  FOR ALL USING (group_id IN (SELECT get_my_group_ids()));

-- COMMENTS
CREATE POLICY comments_access ON comments
  FOR ALL USING (
    user_id = auth.uid()
    OR expense_id IN (
      SELECT id FROM expenses WHERE
        created_by = auth.uid()
        OR group_id IN (SELECT get_my_group_ids())
    )
  );

-- PERSONAL_BUDGETS
CREATE POLICY personal_budgets_access ON personal_budgets
  FOR ALL USING (user_id = auth.uid());

-- RECURRING_TEMPLATES
CREATE POLICY recurring_access ON recurring_templates
  FOR ALL USING (created_by = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- RELOAD SCHEMA CACHE
-- ─────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
