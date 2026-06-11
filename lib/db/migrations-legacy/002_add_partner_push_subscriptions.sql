-- Migration: Add partner_push_subscriptions table
-- Applied: 2026-05-28

CREATE TABLE IF NOT EXISTS partner_push_subscriptions (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES traffic_partners(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_push_partner_idx ON partner_push_subscriptions(partner_id);
