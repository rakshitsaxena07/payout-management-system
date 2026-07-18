PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_balances (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id),
  withdrawable_balance    INTEGER NOT NULL DEFAULT 0, 
  last_withdrawal_at      TEXT,                       
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  brand           TEXT NOT NULL,
  earning         INTEGER NOT NULL,             -- paise
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  advance_paid    INTEGER NOT NULL DEFAULT 0,   
  advance_amount  INTEGER NOT NULL DEFAULT 0,   
  reconciled_at   TEXT,                       
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_user_status ON sales(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_advance_pending
  ON sales(status, advance_paid) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS payout_transactions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  sale_id       TEXT REFERENCES sales(id),   
  type          TEXT NOT NULL
                  CHECK (type IN ('ADVANCE','FINAL_ADJUSTMENT','WITHDRAWAL')),
  amount        INTEGER NOT NULL,               
  status        TEXT NOT NULL DEFAULT 'SUCCESS'
                  CHECK (status IN ('INITIATED','SUCCESS','FAILED','CANCELLED','REJECTED')),
  idempotency_key TEXT UNIQUE,                     
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_txn_user ON payout_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_sale ON payout_transactions(sale_id);
