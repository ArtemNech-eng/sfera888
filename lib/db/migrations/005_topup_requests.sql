-- Migration: balance_topup_requests table
-- For admin-approved balance top-ups in commission model

CREATE TABLE IF NOT EXISTS balance_topup_requests (
  id SERIAL PRIMARY KEY,
  master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP,
  approved_by_user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_balance_topup_requests_master_id ON balance_topup_requests(master_id);
CREATE INDEX IF NOT EXISTS idx_balance_topup_requests_status ON balance_topup_requests(status);
CREATE INDEX IF NOT EXISTS idx_balance_topup_requests_created_at ON balance_topup_requests(created_at);
