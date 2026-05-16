import { pool } from "@workspace/db";
import fs from "fs";

const sqlFile = process.argv[2] || "../neondb_dump.sql";

async function importDb() {
  console.log(`[import-db] Reading ${sqlFile}...`);
  const sql = fs.readFileSync(sqlFile, "utf-8");
  
  // Split by semicolon but keep statements intact
  const statements = sql.split(/;\s*\n/).filter(s => s.trim());
  
  console.log(`[import-db] Found ${statements.length} statements`);
  console.log("[import-db] Connecting to database...");
  const client = await pool.connect();
  
  let success = 0;
  let failed = 0;
  
  try {
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt.startsWith("--") || stmt.startsWith("/*")) continue;
      
      try {
        await client.query(stmt);
        success++;
        if (i % 100 === 0) console.log(`[import-db] Progress: ${i}/${statements.length}`);
      } catch (err: any) {
        failed++;
        // Only log non-trivial errors
        if (!err.message?.includes("already exists") && !err.message?.includes("does not exist")) {
          console.log(`[import-db] Warning at ${i}: ${err.message?.substring(0, 100)}`);
        }
      }
    }
    
    console.log(`[import-db] Done: ${success} succeeded, ${failed} failed (ignored)`);
  } finally {
    client.release();
    await pool.end();
  }
}

importDb();
