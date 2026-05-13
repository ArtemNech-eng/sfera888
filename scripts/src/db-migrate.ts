/**
 * Safe, non-interactive database migration script.
 * Runs as part of build:prod to ensure production DB schema is in sync
 * before Replit's drizzle-kit check runs.
 * All statements are idempotent (IF NOT EXISTS / IF EXISTS).
 */
import { pool } from "@workspace/db";

const queries: string[] = [
  // ── transaction_payments ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS transaction_payments (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    note TEXT,
    paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── max_bot_logs ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS max_bot_logs (
    id SERIAL PRIMARY KEY,
    master_id INTEGER,
    max_user_id VARCHAR(50),
    event VARCHAR(100) NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── master_reviews ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS master_reviews (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    client_name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── master_tasks ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS master_tasks (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── dispatcher_followups ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS dispatcher_followups (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    answer TEXT,
    asked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMP
  )`,

  // ── client_support_messages ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_support_messages (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    from_client BOOLEAN NOT NULL DEFAULT TRUE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── general_support_messages ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS general_support_messages (
    id SERIAL PRIMARY KEY,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    from_client BOOLEAN NOT NULL DEFAULT TRUE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── push_subscriptions ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // ── masters: additional columns ────────────────────────────────────────────
  `ALTER TABLE masters
    ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS voronka_column_id INTEGER,
    ADD COLUMN IF NOT EXISTS pwa_login TEXT,
    ADD COLUMN IF NOT EXISTS pwa_password_hash TEXT,
    ADD COLUMN IF NOT EXISTS working_hours JSONB,
    ADD COLUMN IF NOT EXISTS preferred_districts TEXT[],
    ADD COLUMN IF NOT EXISTS min_area INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS telegram_id TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS total_leads_received INTEGER NOT NULL DEFAULT 0`,

  // ── orders: additional columns ─────────────────────────────────────────────
  `ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS avito_lead_id TEXT,
    ADD COLUMN IF NOT EXISTS avito_chat_id TEXT,
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS client_phone TEXT,
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS area NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS rooms_count INTEGER,
    ADD COLUMN IF NOT EXISTS prepayment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prepayment_deducted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS client_rating INTEGER,
    ADD COLUMN IF NOT EXISTS client_review TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS master_comment TEXT,
    ADD COLUMN IF NOT EXISTS photos TEXT[],
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm'`,

  // ── order_master_history ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS order_master_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    assigned_at TIMESTAMP,
    removed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    cancel_reason TEXT,
    order_amount NUMERIC(12,2),
    service_type TEXT,
    city TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_master_history_master_id ON order_master_history(master_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_master_history_order_id ON order_master_history(order_id)`,
  `DELETE FROM master_messages WHERE master_id NOT IN (SELECT id FROM masters)`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_messages_master_id_fkey') THEN ALTER TABLE master_messages ADD CONSTRAINT master_messages_master_id_fkey FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE; END IF; END $$;`,
  `CREATE INDEX IF NOT EXISTS master_messages_master_id_idx ON master_messages(master_id)`,
  `CREATE INDEX IF NOT EXISTS master_messages_created_at_idx ON master_messages(created_at)`,
  `CREATE INDEX IF NOT EXISTS master_messages_from_master_read_idx ON master_messages(from_master, is_read)`,
  `CREATE INDEX IF NOT EXISTS master_messages_telegram_chat_id_idx ON master_messages(telegram_chat_id)`,
  `ALTER TABLE master_messages ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_lead_id_fkey') THEN ALTER TABLE orders ADD CONSTRAINT orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END $$;`,
`CREATE INDEX IF NOT EXISTS idx_leads_status_updated_at ON leads(status_updated_at)`,
`CREATE INDEX IF NOT EXISTS idx_orders_assigned_at ON orders(assigned_at)`,
];

async function run() {
  console.log("[db-migrate] Applying schema changes...");
  const client = await pool.connect();
  try {
    for (const q of queries) {
      await client.query(q);
    }
    console.log("[db-migrate] Done — all schema changes applied.");
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}

run().catch(e => {
  console.error("[db-migrate] Error:", e.message);
  process.exit(1);
});
