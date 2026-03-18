import app from "./app";
import { db, usersTable, voronkaColumnsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "./lib/auth.js";
import { checkOverdueTransactions } from "./lib/orderEligibility.js";

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
      ADD COLUMN IF NOT EXISTS contract_address TEXT
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
    { name: "На объекте",      position: 3, receivesOrders: false, color: "orange" },
    { name: "Ожидает оплаты",  position: 4, receivesOrders: false, color: "red"    },
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
}

runMigrations().catch(console.error);
maybeResetAdminPassword().catch(console.error);
seedVoronkaColumns().catch(console.error);
// Mark overdue commissions on startup and then every 6 hours
checkOverdueTransactions().catch(console.error);
setInterval(() => checkOverdueTransactions().catch(console.error), 6 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
