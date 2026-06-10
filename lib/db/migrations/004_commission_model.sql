-- Commission model migration: service fees, ruble balance, remove deposit dependency

-- 1. Add ruble balance fields to master_wallet
ALTER TABLE master_wallet
ADD COLUMN IF NOT EXISTS balance numeric(10, 2) NOT NULL DEFAULT '0',
ADD COLUMN IF NOT EXISTS credit_limit numeric(10, 2) NOT NULL DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_service_fees_spent numeric(10, 2) NOT NULL DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_topups numeric(10, 2) NOT NULL DEFAULT '0';

-- 2. Add service_fee to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS service_fee numeric(10, 2) NOT NULL DEFAULT '0';

-- 3. Create service_fee_transactions table
CREATE TABLE IF NOT EXISTS service_fee_transactions (
  id SERIAL PRIMARY KEY,
  master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL DEFAULT '0',
  type TEXT NOT NULL CHECK (type IN ('deduct', 'refund', 'test_waived')),
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_fee_transactions_master_id ON service_fee_transactions(master_id);
CREATE INDEX IF NOT EXISTS idx_service_fee_transactions_order_id ON service_fee_transactions(order_id);
