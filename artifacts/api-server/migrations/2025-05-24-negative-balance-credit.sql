-- Migration: Adjust tokensBalance for masters who received credit tokens
-- Before this migration, issuing credit increased BOTH tokensBalance and creditTokensIssued.
-- After the code change, issuing credit only increases creditTokensIssued.
-- This migration decreases tokensBalance by creditTokensIssued for all masters with credit.

UPDATE master_wallet
SET tokens_balance = tokens_balance::numeric - credit_tokens_issued::numeric,
    updated_at = NOW()
WHERE credit_tokens_issued::numeric > 0;
