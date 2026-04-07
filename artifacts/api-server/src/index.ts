import app from "./app";
import { db, usersTable, voronkaColumnsTable, mastersTable, ordersTable, orderDispatchesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { eq, inArray, and, lte } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";
import { checkOverdueTransactions } from "./lib/orderEligibility.js";
import { performBroadcast } from "./lib/broadcastOrder.js";
import { broadcastCheckin, broadcastCheckinReminder } from "./lib/checkinBroadcast.js";
import { systemSettingsTable } from "@workspace/db";
import { sendMorningBriefing, checkStaleOrders, sendWeeklyReport, checkNewMarkets, runAutonomousCycle, runQuickAutonomousCheck } from "./managerBot.js";
import { runProactiveChecks } from "./lib/dispatcherAI.js";
import { backfillReceiptTransactions } from "./routes/receipts.js";

const port = Number(process.env["PORT"] || "8080");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
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
      ADD COLUMN IF NOT EXISTS passport_reg_photo_url TEXT,
      ADD COLUMN IF NOT EXISTS max_chat_id TEXT
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
      ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS client_submitted_name TEXT,
      ADD COLUMN IF NOT EXISTS prepayment_submitted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS prepayment_screenshot_url TEXT,
      ADD COLUMN IF NOT EXISTS prepayment_seen_at TIMESTAMP
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS master_checkins (
      id SERIAL PRIMARY KEY,
      master_id INTEGER NOT NULL REFERENCES masters(id),
      date DATE NOT NULL,
      is_available BOOLEAN,
      responded_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (master_id, date)
    )
  `);
  await db.execute(sql`
    ALTER TABLE master_checkins
      ADD COLUMN IF NOT EXISTS reason TEXT
  `);
  await db.execute(sql`
    ALTER TABLE masters
      ADD COLUMN IF NOT EXISTS service_prices JSONB
  `);
  await db.execute(sql`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
      ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP
  `);
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS broadcast_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_broadcast_at TIMESTAMP
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lead_events (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      user_alias TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      id SERIAL PRIMARY KEY,
      bot_type VARCHAR(20) NOT NULL,
      user_id BIGINT NOT NULL,
      session_data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (bot_type, user_id)
    )
  `);
  await db.execute(sql`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS source_type TEXT
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

// Auto re-broadcast orders that have been in "dispatching" for 30+ min with zero responses.
async function autoReBroadcastNoResponse() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
  const orders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.status, "waiting_master"),
      eq(ordersTable.dispatchStatus, "dispatching"),
    ));

  for (const order of orders) {
    // Only re-broadcast if last broadcast was > 30 min ago
    const lastBroadcast = (order as any).lastBroadcastAt as Date | null;
    if (lastBroadcast && new Date(lastBroadcast) > cutoff) continue;
    // Check if any master has responded
    const dispatches = await db.select().from(orderDispatchesTable)
      .where(and(eq(orderDispatchesTable.orderId, order.id), eq(orderDispatchesTable.status, "responded")));
    if (dispatches.length > 0) continue; // Already has responses, skip
    try {
      const result = await performBroadcast(order.id);
      if (result.ok && result.sent > 0) {
        await db.execute(sql`UPDATE orders SET broadcast_count = COALESCE(broadcast_count, 0) + 1, last_broadcast_at = NOW() WHERE id = ${order.id}`);
        console.log(`[auto-rebroadcast] Re-sent order #${order.id} to ${result.sent} master(s)`);
      }
    } catch (e) {
      console.error(`[auto-rebroadcast] Error for order #${order.id}:`, e);
    }
  }
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
    initCheckinScheduler().catch(console.error);
    backfillReceiptTransactions()
      .then(n => { if (n > 0) console.log(`[backfill] Created ${n} receipt transactions`); })
      .catch(e => console.error("[backfill] Receipt transactions error:", e));
  })
  .catch(console.error);

// Mark overdue commissions every 6 hours
setInterval(() => checkOverdueTransactions().catch(console.error), 6 * 60 * 60 * 1000);
// Auto-expire dispatches every hour
setInterval(() => autoExpireDispatches().catch(console.error), 60 * 60 * 1000);
// Auto-broadcast scheduled orders 2–4h before scheduledAt
setInterval(() => autoScheduledOrderBroadcast().catch(console.error), 15 * 60 * 1000);
// autoReBroadcastNoResponse removed — per user request
// AI dispatcher: only post-assignment flow (greeting → call check-in → scheduled follow-ups)
setInterval(() => runProactiveChecks().catch(console.error), 30 * 60 * 1000);
// runQuickAutonomousCheck removed — caused spam to masters
// runAutonomousCycle removed — caused spam to masters

// ─── Checkin broadcast scheduler ─────────────────────────────────────────────
// Reads broadcast + reminder times from DB every minute and fires if needed.
// Also fires on startup if today's broadcast hasn't happened yet.

let checkinFiredDate: string | null = null;
let reminderFiredDate: string | null = null;

function getMskTime(): { hhmm: string; today: string } {
  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const hh = nowMsk.getUTCHours().toString().padStart(2, "0");
  const mm = nowMsk.getUTCMinutes().toString().padStart(2, "0");
  return { hhmm: `${hh}:${mm}`, today: nowMsk.toISOString().split("T")[0] };
}

async function getCheckinSettings() {
  const keys = ["checkin_broadcast_time", "checkin_reminder_time", "checkin_reminder_enabled",
                "checkin_last_broadcast_date", "checkin_last_reminder_date"];
  const rows = await db.select().from(systemSettingsTable).where(inArray(systemSettingsTable.key, keys));
  const get = (k: string, d: string) => rows.find(r => r.key === k)?.value ?? d;
  return {
    broadcastTime:    get("checkin_broadcast_time",      "07:00"),
    reminderTime:     get("checkin_reminder_time",       "12:00"),
    reminderEnabled:  get("checkin_reminder_enabled",    "false") === "true",
    lastBroadcast:    get("checkin_last_broadcast_date", ""),
    lastReminder:     get("checkin_last_reminder_date",  ""),
  };
}

// Startup: restore in-memory fired-date flags from DB so restarts don't double-fire
async function initCheckinScheduler() {
  try {
    const cfg = await getCheckinSettings();
    const { today, hhmm } = getMskTime();

    if (cfg.lastBroadcast === today) {
      checkinFiredDate = today;
      console.log("[checkin] Broadcast already fired today — skipping startup fire");
    } else if (hhmm >= cfg.broadcastTime) {
      // Missed window due to restart — fire now
      checkinFiredDate = today;
      console.log(`[checkin] Missed broadcast (${cfg.broadcastTime} MSK), firing on startup`);
      broadcastCheckin().catch(console.error);
    }

    if (cfg.lastReminder === today) {
      reminderFiredDate = today;
    } else if (cfg.reminderEnabled && hhmm >= cfg.reminderTime && checkinFiredDate === today) {
      reminderFiredDate = today;
      console.log(`[checkin] Missed reminder (${cfg.reminderTime} MSK), firing on startup`);
      broadcastCheckinReminder().catch(console.error);
    }
  } catch (e) {
    console.error("[checkin] initScheduler error:", e);
  }
}

let morningBriefingFiredDate: string | null = null;
let eveningReportFiredDate: string | null = null;
let fridayWeeklySummaryFiredDate: string | null = null;
let monthlyReportFiredDate: string | null = null;
const autonomousCycleFiredHours = new Set<string>(); // "YYYY-MM-DD HH"

setInterval(async () => {
  try {
    const { hhmm, today } = getMskTime();
    const cfg = await getCheckinSettings();

    if (hhmm === cfg.broadcastTime && checkinFiredDate !== today) {
      checkinFiredDate = today;
      console.log(`[checkin] Firing broadcast at ${hhmm} MSK`);
      broadcastCheckin().catch(console.error);
    }

    if (cfg.reminderEnabled && hhmm === cfg.reminderTime && reminderFiredDate !== today && checkinFiredDate === today) {
      reminderFiredDate = today;
      console.log(`[checkin] Firing reminder at ${hhmm} MSK`);
      broadcastCheckinReminder().catch(console.error);
    }

    // Morning briefing to manager bot at 09:00 MSK
    if (hhmm === "09:00" && morningBriefingFiredDate !== today) {
      morningBriefingFiredDate = today;
      console.log("[managerBot] Firing morning briefing at 09:00 MSK");
      sendMorningBriefing().catch(console.error);

      // Weekly report on Monday
      const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
      if (nowMsk.getUTCDay() === 1) {
        console.log("[managerBot] Monday — firing weekly report");
        sendWeeklyReport().catch(console.error);
      }

      // First autonomous cycle of the day
      setTimeout(() => runAutonomousCycle("утренняя проверка после брифинга").catch(console.error), 2 * 60 * 1000);
    }

    // Evening summary at 19:00 MSK
    if (hhmm === "19:00" && eveningReportFiredDate !== today) {
      eveningReportFiredDate = today;
      console.log("[managerBot] Firing evening autonomous cycle at 19:00 MSK");
      runAutonomousCycle("вечерняя проверка — итоги дня").catch(console.error);
    }

    // Friday weekly full summary at 18:00 MSK (day 5 = Friday)
    const nowMskWeek = new Date(Date.now() + 3 * 60 * 60 * 1000);
    if (hhmm === "18:00" && nowMskWeek.getUTCDay() === 5 && fridayWeeklySummaryFiredDate !== today) {
      fridayWeeklySummaryFiredDate = today;
      console.log("[managerBot] Friday 18:00 — full weekly autonomous cycle");
      runAutonomousCycle("пятничный итог недели — полная аналитика: топ мастеров, топ услуг, города, финансы").catch(console.error);
    }

    // Monthly report on 1st of month at 10:00 MSK
    const nowMskMonth = new Date(Date.now() + 3 * 60 * 60 * 1000);
    if (hhmm === "10:00" && nowMskMonth.getUTCDate() === 1 && monthlyReportFiredDate !== today) {
      monthlyReportFiredDate = today;
      console.log("[managerBot] 1st of month 10:00 — monthly autonomous cycle");
      runAutonomousCycle("ежемесячный отчёт — первое число месяца: итоги месяца, рейтинг мастеров, финансы, планы на месяц").catch(console.error);
    }

    // Autonomous cycle at 12:00 and 15:00 MSK
    const autoHours = ["12:00", "15:00"];
    for (const slot of autoHours) {
      const slotKey = `${today} ${slot}`;
      if (hhmm === slot && !autonomousCycleFiredHours.has(slotKey)) {
        autonomousCycleFiredHours.add(slotKey);
        console.log(`[autonomousAgent] Firing scheduled cycle at ${slot} MSK`);
        runAutonomousCycle(`плановая проверка ${slot} МСК`).catch(console.error);
      }
    }

  } catch (e) {
    console.error("[checkin] scheduler error:", e);
  }
}, 60 * 1000);
console.log("[checkin] Dynamic broadcast scheduler started");

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});
