import app from "./app";
import { db, usersTable, voronkaColumnsTable, mastersTable, ordersTable, orderDispatchesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { eq, inArray, and, lte } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";
import { checkOverdueTransactions } from "./lib/orderEligibility.js";
import { performBroadcast } from "./lib/broadcastOrder.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run safe additive migrations on startup (IF NOT EXISTS — idempotent).
async function runMigrations() {
  await db.execute(sql`
    ALTER TABLE masters
      ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS contract_sign_ip TEXT,
      ADD COLUMN IF NOT EXISTS passport_photo_url TEXT,
      ADD COLUMN IF NOT EXISTS passport_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS passport_verify_note TEXT,
      ADD COLUMN IF NOT EXISTS contract_full_name TEXT,
      ADD COLUMN IF NOT EXISTS contract_passport_number TEXT,
      ADD COLUMN IF NOT EXISTS contract_passport_date TEXT,
      ADD COLUMN IF NOT EXISTS contract_passport_issuer TEXT,
      ADD COLUMN IF NOT EXISTS contract_address TEXT,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS passport_reg_photo_url TEXT
  `);
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS operator_note TEXT,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cancel_type TEXT
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_status_logs (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      old_status TEXT,
      new_status TEXT NOT NULL,
      user_id INTEGER,
      user_alias TEXT,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      token VARCHAR(64) NOT NULL UNIQUE,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      master_id INTEGER NOT NULL REFERENCES masters(id),
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      service_type TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT,
      prepayment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      line_items JSONB NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    ALTER TABLE receipts
      ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'
  `);
  console.log("[startup] Migrations applied");
}

// If ADMIN_PASSWORD env var is set, reset the admin user's password on startup.
async function maybeResetAdminPassword() {
  const newPassword = process.env["ADMIN_PASSWORD"];
  if (!newPassword) return;

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.login, "admin"));
  if (!admin) {
    const passwordHash = await hashPassword(newPassword);
    await db.insert(usersTable).values({
      login: "admin",
      passwordHash,
      name: "Администратор",
      role: "admin",
    });
    console.log("[startup] Admin user created with ADMIN_PASSWORD");
  } else {
    const passwordHash = await hashPassword(newPassword);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, admin.id));
    console.log("[startup] Admin password reset via ADMIN_PASSWORD env var");
  }
}

// Seed default voronka columns if they don't exist yet.
// Safe to run on every startup — checks before inserting.
async function seedVoronkaColumns() {
  const DEFAULT_COLUMNS = [
    { name: "Новые",           position: 1, receivesOrders: false, color: "blue"   },
    { name: "Свободен",        position: 2, receivesOrders: true,  color: "green"  },
    { name: "Занят",           position: 3, receivesOrders: false, color: "yellow" },
    { name: "На объекте",      position: 4, receivesOrders: true,  color: "orange" },
    { name: "Ожидает оплаты",  position: 5, receivesOrders: false, color: "red"    },
    { name: "Отстраненные",    position: 6, receivesOrders: false, color: "grey"   },
  ];

  const existing = await db.select().from(voronkaColumnsTable);
  const existingNames = existing.map(c => c.name);

  // Rename "Свободные" → "Свободен" if present (typo fix from initial setup)
  const svobodnyeCol = existing.find(c => c.name === "Свободные");
  if (svobodnyeCol) {
    await db.update(voronkaColumnsTable)
      .set({ name: "Свободен", receivesOrders: true, position: 2 })
      .where(eq(voronkaColumnsTable.id, svobodnyeCol.id));
    console.log("[startup] Renamed 'Свободные' → 'Свободен'");
    existingNames[existingNames.indexOf("Свободные")] = "Свободен";
  }

  for (const col of DEFAULT_COLUMNS) {
    if (!existingNames.includes(col.name)) {
      await db.insert(voronkaColumnsTable).values(col);
      console.log(`[startup] Created voronka column: '${col.name}'`);
    }
  }

  // After ensuring "Занят" exists, fix positions and receivesOrders of subsequent columns
  const afterInsert = await db.select().from(voronkaColumnsTable);
  const naObyekteCol = afterInsert.find(c => c.name === "На объекте");
  const ozhidaetCol = afterInsert.find(c => c.name === "Ожидает оплаты");
  const zanyatCol = afterInsert.find(c => c.name === "Занят");
  if (zanyatCol) {
    if (naObyekteCol && naObyekteCol.position !== 4) {
      await db.update(voronkaColumnsTable).set({ position: 4 }).where(eq(voronkaColumnsTable.id, naObyekteCol.id));
      console.log("[startup] Updated 'На объекте' position → 4");
    }
    if (ozhidaetCol && ozhidaetCol.position !== 5) {
      await db.update(voronkaColumnsTable).set({ position: 5 }).where(eq(voronkaColumnsTable.id, ozhidaetCol.id));
      console.log("[startup] Updated 'Ожидает оплаты' position → 5");
    }
    // "Занят" = manual offline (left the line), must NOT receive dispatches
    if (zanyatCol.receivesOrders) {
      await db.update(voronkaColumnsTable).set({ receivesOrders: false }).where(eq(voronkaColumnsTable.id, zanyatCol.id));
      console.log("[startup] Updated 'Занят' receivesOrders → false");
    }
    // "На объекте" = working, CAN receive dispatches (limit enforced by eligibility check)
    if (naObyekteCol && !naObyekteCol.receivesOrders) {
      await db.update(voronkaColumnsTable).set({ receivesOrders: true }).where(eq(voronkaColumnsTable.id, naObyekteCol.id));
      console.log("[startup] Updated 'На объекте' receivesOrders → true");
    }
  }
}

// One-time migration: active masters who existed before the admin-confirmation requirement
// should be granted passportVerified=true so they are not blocked retroactively.
async function grantPassportVerifiedToActiveMasters() {
  const updated = await db.update(mastersTable)
    .set({ passportVerified: true })
    .where(
      sql`status = 'active' AND (passport_verified IS FALSE OR passport_verified IS NULL)`
    );
  const count = (updated as any).rowCount ?? 0;
  if (count > 0) {
    console.log(`[startup] Granted passportVerified=true to ${count} existing active master(s)`);
  }
}

// Auto-expire dispatch records that have been in "sent" status for more than 24 hours.
// These masters didn't respond — mark them "rejected" so they're excluded from future re-broadcasts.
async function autoExpireDispatches() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.update(orderDispatchesTable)
    .set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.status, "sent"), lte(orderDispatchesTable.createdAt, cutoff)))
    .returning({ id: orderDispatchesTable.id });
  if (result.length > 0) {
    console.log(`[auto-expire] Expired ${result.length} dispatch record(s) older than 24h`);
  }
}

// Auto-broadcast scheduled orders: if an order has scheduledAt within the next 4 hours
// and has never been dispatched, trigger broadcast automatically.
async function autoScheduledOrderBroadcast() {
  const now = new Date();
  const in4h = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const orders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.status, "waiting_master"),
      eq(ordersTable.dispatchStatus, "none"),
    ));

  const tooBroadcast = orders.filter(o =>
    o.scheduledAt && new Date(o.scheduledAt) >= in2h && new Date(o.scheduledAt) <= in4h
  );

  for (const order of tooBroadcast) {
    try {
      const result = await performBroadcast(order.id);
      if (result.ok) {
        console.log(`[auto-broadcast] Sent to ${result.sent} master(s) for scheduled order #${order.id}`);
      } else {
        console.log(`[auto-broadcast] Skipped order #${order.id}: ${result.error}`);
      }
    } catch (e) {
      console.error(`[auto-broadcast] Error for order #${order.id}:`, e);
    }
  }
}

/**
 * One-time (and periodic) fix: ensure masters with active orders are in "На объекте",
 * and masters with no active orders are in "Свободен". Skips masters in non-receiving
 * columns (e.g. "Занят", "Отстраненные") — those are manually set by operators.
 */
async function recalculateMasterVoronkaColumns() {
  const cols = await db.select().from(voronkaColumnsTable);
  const freeCol = cols.find(c => c.name === "Свободен" && c.receivesOrders) ?? cols.find(c => c.receivesOrders);
  const onSiteCol = cols.find(c => c.name === "На объекте")
    ?? cols.find(c => c.receivesOrders && c.name !== "Свободен");
  if (!freeCol || !onSiteCol) return;

  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

  const activeCountByMaster = new Map<number, number>();
  for (const o of activeOrders) {
    if (o.masterId) activeCountByMaster.set(o.masterId, (activeCountByMaster.get(o.masterId) ?? 0) + 1);
  }

  const masters = await db.select().from(mastersTable).where(eq(mastersTable.status, "active"));
  let fixed = 0;
  for (const m of masters) {
    const currentCol = cols.find(c => c.id === m.voronkaColumnId);
    const activeCount = activeCountByMaster.get(m.id) ?? 0;

    let correctColId: number | null = null;
    if (activeCount >= 1) {
      // Master has active orders → must be "На объекте" regardless of current column
      correctColId = onSiteCol.id;
    } else if (currentCol?.receivesOrders) {
      // Master is free and currently in a receiving column → ensure "Свободен"
      correctColId = freeCol.id;
    }
    // Masters in non-receiving columns (Занят, Отстраненные) with no active orders → leave them alone

    if (correctColId !== null && m.voronkaColumnId !== correctColId) {
      await db.update(mastersTable).set({ voronkaColumnId: correctColId }).where(eq(mastersTable.id, m.id));
      fixed++;
    }
  }
  if (fixed > 0) console.log(`[voronka-fix] Corrected ${fixed} master(s) to proper column`);
}

// Run migrations first, then all other startup tasks that depend on the schema
runMigrations()
  .then(() => {
    maybeResetAdminPassword().catch(console.error);
    seedVoronkaColumns().catch(console.error);
    grantPassportVerifiedToActiveMasters().catch(console.error);
    recalculateMasterVoronkaColumns().catch(console.error);
    checkOverdueTransactions().catch(console.error);
    autoExpireDispatches().catch(console.error);
  })
  .catch(console.error);

// Mark overdue commissions every 6 hours
setInterval(() => checkOverdueTransactions().catch(console.error), 6 * 60 * 60 * 1000);
// Auto-expire dispatches every hour
setInterval(() => autoExpireDispatches().catch(console.error), 60 * 60 * 1000);
// Auto-broadcast scheduled orders 2–4h before scheduledAt
setInterval(() => autoScheduledOrderBroadcast().catch(console.error), 15 * 60 * 1000);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
