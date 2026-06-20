-- Migration 0014: speed up master-related order aggregates
-- Used by /api/voronka/masters (single big GROUP BY master_id with FILTER).
-- Without this index the GROUP BY does a sequential scan of orders.
CREATE INDEX IF NOT EXISTS idx_orders_master_status
  ON orders (master_id, status, deleted_at)
  WHERE master_id IS NOT NULL;

-- Also speeds up cancel-window queries (FILTER WHERE updated_at >= ...)
CREATE INDEX IF NOT EXISTS idx_orders_master_cancel_recent
  ON orders (master_id, updated_at)
  WHERE master_id IS NOT NULL AND cancel_type IS NOT NULL;
