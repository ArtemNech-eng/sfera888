-- Migration: Add screenshot_url column to wallet_transactions for payment proofs

ALTER TABLE wallet_transactions
ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
