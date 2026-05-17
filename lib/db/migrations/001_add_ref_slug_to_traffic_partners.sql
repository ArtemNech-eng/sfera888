-- Migration: Add ref_slug column to traffic_partners table
-- Applied: 2026-05-17

ALTER TABLE traffic_partners
ADD COLUMN IF NOT EXISTS ref_slug VARCHAR(100) UNIQUE;

-- Index is automatically created by UNIQUE constraint
