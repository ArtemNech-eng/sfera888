import { pool } from "@workspace/db";
import fs from "fs";

const sqlFile = process.argv[2] || "../neondb_dump.sql";

async function importData() {
  console.log(`[import-data] Reading ${sqlFile}...`);
  const sql = fs.readFileSync(sqlFile, "utf-8");
  
  // Extract only INSERT statements and skip problematic ones
  const lines = sql.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) continue;
    
    // Skip COPY (Neon format)
    if (trimmed.startsWith('COPY') || trimmed.startsWith('\\.')) continue;
    
    // Skip ALTER TABLE with USER type
    if (trimmed.includes('USER') && trimmed.includes('TYPE')) continue;
    
    // Skip CREATE TYPE ARRAY
    if (trimmed.startsWith('CREATE TYPE') && trimmed.includes('ARRAY')) continue;
    
    // Collect INSERT statements
    if (trimmed.startsWith('INSERT')) {
      currentStmt = line;
    } else if (currentStmt) {
      currentStmt += ' ' + line;
    }
    
    // End of statement
    if (currentStmt && trimmed.endsWith(';')) {
      // Clean up the statement
      const cleanStmt = currentStmt
        .replace(/::\w+\[\]/g, '') // Remove ::TYPE[]
        .replace(/::\w+/g, '')     // Remove ::TYPE
        .replace(/'\[\]'/g, "'{}'") // Convert empty JSON array to PG empty array
        .replace(/'\[([^\]]+)\]'/g, (match, content) => {
          // Convert JSON array ["a","b"] to PG array {a,b}
          const items = content.replace(/"/g, '').replace(/,/g, ', ');
          return `"{${items}}"`;
        })
        .trim();
      
      if (cleanStmt.startsWith('INSERT')) {
        statements.push(cleanStmt);
      }
      currentStmt = '';
    }
  }
  
  console.log(`[import-data] Found ${statements.length} INSERT statements`);
  console.log("[import-data] Connecting to database...");
  const client = await pool.connect();
  
  let success = 0;
  let failed = 0;
  
  try {
    // Disable foreign key checks
    await client.query('SET session_replication_role = replica;');
    await client.query('ALTER TABLE IF EXISTS masters DROP CONSTRAINT IF EXISTS masters_user_id_fkey;');
    await client.query('ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_master_id_fkey;');
    await client.query('ALTER TABLE IF EXISTS orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;');
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
        success++;
        if (i % 1000 === 0) console.log(`[import-data] Progress: ${i}/${statements.length}`);
      } catch (err: any) {
        failed++;
        // Skip duplicate key errors silently
        if (failed <= 3 && !err.message?.includes('duplicate key')) {
          console.log(`[import-data] Error: ${err.message?.substring(0, 100)}`);
        }
      }
    }
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');
    
    console.log(`[import-data] Done: ${success} succeeded, ${failed} failed`);
  } finally {
    client.release();
    await pool.end();
  }
}

importData();
