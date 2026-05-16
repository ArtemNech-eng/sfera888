import { pool } from "@workspace/db";
import fs from "fs";

async function importMasters() {
  console.log("[import-masters] Reading file...");
  const sql = fs.readFileSync("../neondb_dump.sql", "utf-8");
  
  // Find all INSERT into masters
  const lines = sql.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    
    // Check if line contains complete INSERT statement
    if (trimmed.toLowerCase().includes('insert into "masters"') && trimmed.endsWith(';')) {
      // Single line INSERT
      const cleanStmt = trimmed
        .replace(/::\w+\[\]/g, '')
        .replace(/::\w+/g, '')
        .replace(/'\[\]'/g, 'ARRAY[]::text[]')
        // Convert only simple string arrays (specializations, tags), not JSON objects (service_prices)
        .replace(/'\[((?:[^\]{}]|"[^"]*")+)\]'/g, (match, content) => {
          // Skip if contains JSON objects (curly braces)
          if (content.includes('{') || content.includes('}')) return match;
          const items = content.replace(/"/g, '').split(',').map((s: string) => `'${s.trim()}'`).join(',');
          return `ARRAY[${items}]`;
        })
        .trim();
      statements.push(cleanStmt);
    } else if (trimmed.toLowerCase().includes('insert into "masters"')) {
      // Multi-line INSERT start
      currentStmt = line;
    } else if (currentStmt) {
      currentStmt += ' ' + line;
      if (trimmed.endsWith(';')) {
        const cleanStmt = currentStmt
          .replace(/::\w+\[\]/g, '')
          .replace(/::\w+/g, '')
          .replace(/'\[\]'/g, 'ARRAY[]::text[]')
          // Convert only simple string arrays (specializations, tags), not JSON objects (service_prices)
          .replace(/'\[((?:[^\]{}]|"[^"]*")+)\]'/g, (match, content) => {
            // Skip if contains JSON objects (curly braces)
            if (content.includes('{') || content.includes('}')) return match;
            const items = content.replace(/"/g, '').split(',').map((s: string) => `'${s.trim()}'`).join(',');
            return `ARRAY[${items}]`;
          })
          .trim();
        statements.push(cleanStmt);
        currentStmt = '';
      }
    }
  }
  
  console.log(`[import-masters] Found ${statements.length} statements`);
  
  const client = await pool.connect();
  try {
    // Disable FK
    await client.query('SET session_replication_role = replica;');
    
    let success = 0;
    let failed = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
        success++;
      } catch (err: any) {
        failed++;
        if (failed <= 10) {
          console.log(`[import-masters] Error #${failed}: ${err.message?.substring(0, 150)}`);
          console.log(`  Statement: ${stmt.substring(0, 100)}...`);
        }
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    console.log(`[import-masters] Done: ${success} succeeded, ${failed} failed`);
    
    // Check count
    const result = await client.query('SELECT COUNT(*) FROM masters');
    console.log(`[import-masters] Total masters in DB: ${result.rows[0].count}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

importMasters();
