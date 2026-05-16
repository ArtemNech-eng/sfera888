import { pool } from "@workspace/db";
import fs from "fs";

async function importUsers() {
  console.log('[import-users] Reading file...');
  
  const sql = fs.readFileSync("../neondb_dump.sql", "utf-8");
  const lines = sql.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    
    // Check for INSERT into users
    if (trimmed.toLowerCase().includes('insert into "users"') && trimmed.endsWith(';')) {
      statements.push(trimmed);
    } else if (trimmed.toLowerCase().includes('insert into "users"')) {
      currentStmt = line;
    } else if (currentStmt) {
      currentStmt += ' ' + line;
      if (trimmed.endsWith(';')) {
        statements.push(currentStmt);
        currentStmt = '';
      }
    }
  }
  
  console.log(`[import-users] Found ${statements.length} statements`);
  
  const client = await pool.connect();
  let success = 0;
  let failed = 0;
  
  try {
    await client.query('SET session_replication_role = replica;');
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // For users, don't convert arrays at all — keep JSON as-is
      const cleanStmt = stmt
        .replace(/::\w+\[\]/g, '')
        .replace(/::\w+/g, '')
        .trim();
      
      try {
        await client.query(cleanStmt);
        success++;
      } catch (err: any) {
        failed++;
        console.log(`[import-users] Error: ${err.message?.substring(0, 100)}`);
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    console.log(`[import-users] Done: ${success} succeeded, ${failed} failed`);
    
    const result = await client.query('SELECT COUNT(*) FROM "users"');
    console.log(`[import-users] Total users: ${result.rows[0].count}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

importUsers();
