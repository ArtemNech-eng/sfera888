import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth.js";

const DEFAULT_ADMIN_LOGIN = "admin";
const DEFAULT_ADMIN_NAME = "Администратор";
const DEFAULT_ADMIN_ROLE = "admin" as const;

export async function bootstrapFirstAdmin() {
  const username = process.env["ADMIN_USERNAME"]?.trim() || DEFAULT_ADMIN_LOGIN;
  const password = process.env["ADMIN_PASSWORD"]?.trim() || "admin2026";
  const name = process.env["ADMIN_NAME"]?.trim() || DEFAULT_ADMIN_NAME;

  if (!username || !password) {
    console.warn("[startup] ADMIN_USERNAME/ADMIN_PASSWORD are missing; admin bootstrap skipped");
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.login, username));
  const passwordHash = await hashPassword(password);

  if (existing.length === 0) {
    await db.insert(usersTable).values({
      login: username,
      passwordHash,
      name,
      role: DEFAULT_ADMIN_ROLE,
      permissions: ["dashboard", "leads", "orders", "masters", "tasks", "finance", "analytics", "trash"],
    });
    console.log(`[startup] Admin user created: ${username}`);
    return;
  }

  const admin = existing[0];
  if (admin.role !== DEFAULT_ADMIN_ROLE) {
    await db.update(usersTable).set({
      passwordHash,
      role: DEFAULT_ADMIN_ROLE,
      name,
    }).where(eq(usersTable.id, admin.id));
    console.log(`[startup] Existing user promoted to admin: ${username}`);
    return;
  }

  await db.update(usersTable).set({ passwordHash, name }).where(eq(usersTable.id, admin.id));
  console.log(`[startup] Admin password refreshed: ${username}`);
}
