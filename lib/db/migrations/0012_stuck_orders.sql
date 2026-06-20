-- Migration 0012: stuck-orders flow
-- Adds two columns to orders for tracking master action flow:
--   - client_call_reported_at: timestamp when master reported on client call
--     (introduces the "1-day call report" stuck category R0)
--   - banner_snoozed_until:    timestamp until which PWA banner is suppressed
--     for this order (master clicked "remind me later")

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_call_reported_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS banner_snoozed_until    TIMESTAMP NULL;

-- Partial index: speeds up "find orders missing call-report 24h+" queries
-- Filtered on the typical query shape so the index stays tiny.
CREATE INDEX IF NOT EXISTS idx_orders_call_report_pending
  ON orders (assigned_at)
  WHERE client_call_reported_at IS NULL
    AND status IN ('master_assigned', 'in_progress', 'on_site')
    AND deleted_at IS NULL;

-- Partial index: most orders never get snoozed, so index only the rare ones.
CREATE INDEX IF NOT EXISTS idx_orders_banner_snoozed
  ON orders (banner_snoozed_until)
  WHERE banner_snoozed_until IS NOT NULL;
