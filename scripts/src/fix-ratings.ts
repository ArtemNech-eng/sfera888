import { db, mastersTable } from "@workspace/db";
import { lt } from "drizzle-orm";

async function main() {
  const result = await db
    .update(mastersTable)
    .set({ rating: "4.8" })
    .where(lt(mastersTable.rating, "4.8"))
    .returning({ id: mastersTable.id, alias: mastersTable.alias, oldRating: mastersTable.rating });

  console.log(`Updated ${result.length} masters to rating 4.8`);
  for (const m of result.slice(0, 20)) {
    console.log(`  #${m.id} ${m.alias}: ${m.oldRating} → 4.8`);
  }
  if (result.length > 20) {
    console.log(`  ... and ${result.length - 20} more`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
