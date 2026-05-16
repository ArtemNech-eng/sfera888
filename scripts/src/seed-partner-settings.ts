// Seed partner settings into system_settings table
// Run: npx tsx scripts/src/seed-partner-settings.ts

import { db, systemSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const settings = [
  { key: "partner_fixed_salary_max",        value: "15000" },
  { key: "partner_fixed_target_leads",       value: "30" },
  { key: "partner_bonus_per_accepted_lead",  value: "250" },
  { key: "partner_monthly_leads_plan",       value: "50" },
  { key: "manual_partner_lead_review",       value: "true" },
  { key: "partner_payout_day_start",         value: "1" },
  { key: "partner_payout_day_end",           value: "5" },
];

async function run() {
  for (const s of settings) {
    await db
      .insert(systemSettingsTable)
      .values({ key: s.key, value: s.value, updatedAt: new Date() })
      .onConflictDoNothing();
    console.log(`  ✓ ${s.key} = ${s.value}`);
  }
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
