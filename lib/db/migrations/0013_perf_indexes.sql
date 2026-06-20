-- Migration 0013: performance indexes
-- Add indexes to speed up frequently-used aggregate queries.

-- /api/masters runs SELECT master_id, COUNT(*) FROM transactions
-- WHERE payment_status = 'paid' GROUP BY master_id on every page load.
-- Without this index it does a full table scan — 5-10s for ~50k transactions.
-- This composite index serves the WHERE + GROUP BY in one shot.
CREATE INDEX IF NOT EXISTS idx_transactions_paid_master
  ON transactions (payment_status, master_id)
  WHERE payment_status = 'paid';

-- Same pattern for pending/overdue transactions (used in /finance and
-- master-chat pendingTransactions query).
CREATE INDEX IF NOT EXISTS idx_transactions_unpaid_master
  ON transactions (payment_status, master_id)
  WHERE payment_status IN ('pending', 'overdue');
