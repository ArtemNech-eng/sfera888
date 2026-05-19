/**
 * db.ts — PostgreSQL helper for AI Log Agent
 * Falls back to file-only if DATABASE_URL is not set.
 */

import { Pool, PoolClient } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

export interface LogErrorRecord {
  errorId: string;
  firstSeen: string;
  lastSeen: string;
  level: string;
  source: string;
  message: string;
  count: number;
  severity: string;
  sampleLine?: number;
}

export async function ensureTable(): Promise<void> {
  const p = getPool();
  if (!p) return;

  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_error_logs (
        id SERIAL PRIMARY KEY,
        error_id VARCHAR(16) NOT NULL UNIQUE,
        first_seen TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL,
        level VARCHAR(20) NOT NULL,
        source VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        severity VARCHAR(20) NOT NULL,
        sample_line INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_error_logs_active ON ai_error_logs(is_active);
      CREATE INDEX IF NOT EXISTS idx_ai_error_logs_severity ON ai_error_logs(severity);
    `);
    console.log("[DB] Table ai_error_logs ensured.");
  } finally {
    client.release();
  }
}

export async function upsertError(err: LogErrorRecord): Promise<void> {
  const p = getPool();
  if (!p) return;

  await p.query(
    `
    INSERT INTO ai_error_logs (
      error_id, first_seen, last_seen, level, source, message, count, severity, sample_line, is_active, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
    ON CONFLICT (error_id) DO UPDATE SET
      last_seen = EXCLUDED.last_seen,
      count = ai_error_logs.count + EXCLUDED.count,
      is_active = true,
      updated_at = NOW()
    `,
    [err.errorId, err.firstSeen, err.lastSeen, err.level, err.source, err.message, err.count, err.severity, err.sampleLine ?? null]
  );
}

export async function clearAllErrors(): Promise<void> {
  const p = getPool();
  if (!p) return;

  await p.query(`UPDATE ai_error_logs SET is_active = false, updated_at = NOW()`);
  console.log("[DB] All errors marked inactive.");
}

export async function getActiveErrors(): Promise<any[]> {
  const p = getPool();
  if (!p) return [];

  const result = await p.query(
    `SELECT * FROM ai_error_logs WHERE is_active = true ORDER BY 
      CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        ELSE 5 
      END,
      last_seen DESC`
  );
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
