/**
 * check-db-errors.ts — Read errors from PostgreSQL
 *
 * Run: npx ts-node agents/check-db-errors.ts
 */

import * as db from "./db";

async function main(): Promise<void> {
  await db.ensureTable();
  const errors = await db.getActiveErrors();

  if (errors.length === 0) {
    console.log("✅ No active errors in database.");
    await db.closePool();
    return;
  }

  console.log(`\n📊 Total active errors: ${errors.length}\n`);

  for (const err of errors) {
    const sev = err.severity.toUpperCase();
    console.log(`[${sev}] ${err.source} | count: ${err.count}`);
    console.log(`   First: ${err.first_seen}`);
    console.log(`   Last:  ${err.last_seen}`);
    console.log(`   ${err.message.slice(0, 200)}`);
    console.log("");
  }

  await db.closePool();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
