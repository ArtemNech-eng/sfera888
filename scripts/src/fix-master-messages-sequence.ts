import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function fixSequence() {
  const result = await db.execute(sql`
    SELECT setval(
      'master_messages_id_seq',
      COALESCE((SELECT MAX(id) FROM master_messages), 0) + 1,
      false
    )
  `);
  console.log("[fix] master_messages_id_seq updated:", result.rows[0]);
}

fixSequence()
  .then(() => { console.log("Done"); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
