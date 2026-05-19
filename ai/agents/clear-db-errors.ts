/**
 * clear-db-errors.ts — Mark all errors as inactive in PostgreSQL
 *
 * Run: npx ts-node agents/clear-db-errors.ts
 */

import * as db from "./db";

async function main(): Promise<void> {
  await db.clearAllErrors();
  await db.closePool();
  console.log("✅ All database errors marked inactive.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
