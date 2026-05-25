/**
 * Safe, non-interactive database migration script.
 * Runs as part of build:prod to ensure production DB schema is in sync
 * before Replit's drizzle-kit check runs.
 * All statements are idempotent (IF NOT EXISTS / IF EXISTS).
 */
import { pool } from "@workspace/db";

const queries: string[] = [
  // ── sessions table (required for auth) ─────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "sessions" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
  )`,

  // ── Ensure orders and masters tables have PRIMARY KEY (required for FK references) ─────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'p') THEN ALTER TABLE orders ADD PRIMARY KEY (id); END IF; END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'masters'::regclass AND contype = 'p') THEN ALTER TABLE masters ADD PRIMARY KEY (id); END IF; END IF; END $$;`,

  // ── transaction_payments ───────────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN CREATE TABLE IF NOT EXISTS transaction_payments (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    note TEXT,
    paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  ); END IF; END $$;`,

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
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN CREATE TABLE IF NOT EXISTS master_reviews (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    client_name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  ); END IF; END $$;`,

  // ── master_tasks ───────────────────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN CREATE TABLE IF NOT EXISTS master_tasks (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  ); END IF; END $$;`,

  // ── dispatcher_followups ───────────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN CREATE TABLE IF NOT EXISTS dispatcher_followups (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    answer TEXT,
    asked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMP
  ); END IF; END $$;`,

  // ── client_support_messages ────────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN CREATE TABLE IF NOT EXISTS client_support_messages (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    from_client BOOLEAN NOT NULL DEFAULT TRUE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  ); END IF; END $$;`,

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
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    master_id INTEGER NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  ); END IF; END $$;`,

  // ── masters: additional columns ────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN ALTER TABLE masters
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
    ADD COLUMN IF NOT EXISTS total_leads_received INTEGER NOT NULL DEFAULT 0; END IF; END $$;`,

  // ── orders: additional columns ─────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN ALTER TABLE orders
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
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm'; END IF; END $$;`,

  // ── order_master_history ──────────────────────────────────────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'masters') THEN CREATE TABLE IF NOT EXISTS order_master_history (
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
  ); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_master_history') THEN CREATE INDEX IF NOT EXISTS idx_order_master_history_master_id ON order_master_history(master_id); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_master_history') THEN CREATE INDEX IF NOT EXISTS idx_order_master_history_order_id ON order_master_history(order_id); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN DELETE FROM master_messages WHERE master_id NOT IN (SELECT id FROM masters); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_messages_master_id_fkey') THEN ALTER TABLE master_messages ADD CONSTRAINT master_messages_master_id_fkey FOREIGN KEY (master_id) REFERENCES masters(id) ON DELETE CASCADE; END IF; END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN CREATE INDEX IF NOT EXISTS master_messages_master_id_idx ON master_messages(master_id); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN CREATE INDEX IF NOT EXISTS master_messages_created_at_idx ON master_messages(created_at); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN CREATE INDEX IF NOT EXISTS master_messages_from_master_read_idx ON master_messages(from_master, is_read); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') THEN CREATE INDEX IF NOT EXISTS master_messages_telegram_chat_id_idx ON master_messages(telegram_chat_id); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_messages') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN ALTER TABLE master_messages ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'lead_id') THEN ALTER TABLE orders ADD COLUMN IF NOT EXISTS lead_id INTEGER; END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'id') THEN RAISE NOTICE 'Table leads not ready, skipping FK'; ELSE IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_lead_id_fkey') THEN ALTER TABLE orders ADD CONSTRAINT orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE; END IF; END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN CREATE INDEX IF NOT EXISTS idx_leads_status_updated_at ON leads(status_updated_at); END IF; END $$;`,
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_at') THEN CREATE INDEX IF NOT EXISTS idx_orders_assigned_at ON orders(assigned_at); END IF; END $$;`,

  // ── wallet_transactions: screenshot_url for payment proofs ──────────────────
  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wallet_transactions') THEN ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS screenshot_url TEXT; END IF; END $$;`,

  // ── client_push_subscriptions ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS client_push_subscriptions (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS client_push_phone_idx ON client_push_subscriptions(phone);`,
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
