export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT,
    avatar_url  TEXT,
    default_currency TEXT NOT NULL DEFAULT 'USD',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'other',
    avatar_url  TEXT,
    color       TEXT,
    created_by  TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    joined_at   TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id),
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id                  TEXT PRIMARY KEY,
    group_id            TEXT,
    description         TEXT NOT NULL,
    total_amount        REAL NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'USD',
    paid_by             TEXT NOT NULL,
    split_type          TEXT NOT NULL DEFAULT 'equal',
    category            TEXT NOT NULL DEFAULT 'other',
    date                TEXT NOT NULL,
    notes               TEXT,
    is_recurring        INTEGER NOT NULL DEFAULT 0,
    recurrence_interval TEXT,
    is_personal         INTEGER NOT NULL DEFAULT 0,
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    deleted_at          TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id),
    FOREIGN KEY (paid_by)    REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id          TEXT PRIMARY KEY,
    expense_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      REAL NOT NULL,
    percentage  REAL,
    shares      REAL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id            TEXT PRIMARY KEY,
    from_user_id  TEXT NOT NULL,
    to_user_id    TEXT NOT NULL,
    amount        REAL NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'USD',
    group_id      TEXT,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    settled_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id)   REFERENCES users(id),
    FOREIGN KEY (group_id)     REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    metadata_json TEXT,
    read          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS custom_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    key         TEXT NOT NULL,
    label       TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'tag',
    color       TEXT NOT NULL DEFAULT '#C8D6E5',
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, key)
  );

  CREATE TABLE IF NOT EXISTS trip_budgets (
    id                    TEXT PRIMARY KEY,
    group_id              TEXT NOT NULL UNIQUE,
    destination           TEXT,
    start_date            TEXT NOT NULL,
    end_date              TEXT NOT NULL,
    total_budget          REAL NOT NULL,
    currency              TEXT NOT NULL DEFAULT 'USD',
    budget_food           REAL NOT NULL DEFAULT 0,
    budget_transport      REAL NOT NULL DEFAULT 0,
    budget_accommodation  REAL NOT NULL DEFAULT 0,
    budget_activities     REAL NOT NULL DEFAULT 0,
    budget_miscellaneous  REAL NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    expense_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS personal_budgets (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    month               TEXT NOT NULL,
    total_budget        REAL NOT NULL,
    category_budgets    TEXT NOT NULL DEFAULT '[]',
    currency            TEXT NOT NULL DEFAULT 'USD',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, month)
  );

  CREATE TABLE IF NOT EXISTS recurring_templates (
    id                  TEXT PRIMARY KEY,
    description         TEXT NOT NULL,
    total_amount        REAL NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'USD',
    category            TEXT NOT NULL DEFAULT 'other',
    split_type          TEXT NOT NULL DEFAULT 'equal',
    interval            TEXT NOT NULL,
    next_due            TEXT NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    group_id            TEXT,
    paid_by             TEXT NOT NULL,
    member_ids          TEXT NOT NULL DEFAULT '[]',
    is_personal         INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    last_generated_at   TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id),
    FOREIGN KEY (paid_by)    REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
`;
