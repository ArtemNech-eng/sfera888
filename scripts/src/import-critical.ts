import { pool } from "@workspace/db";
import fs from "fs";

const sqlFile = process.argv[2] || "../neondb_dump.sql";

async function importTable(tableName: string, tableKey: string) {
  console.log(`\n[import] Processing ${tableName}...`);
  
  const sql = fs.readFileSync(sqlFile, "utf-8");
  const lines = sql.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    
    // Check for complete single-line INSERT
    const insertKey = `insert into "${tableKey}"`;
    if (trimmed.toLowerCase().includes(insertKey) && trimmed.endsWith(';')) {
      statements.push(trimmed);
    } else if (trimmed.toLowerCase().includes(insertKey)) {
      currentStmt = line;
    } else if (currentStmt) {
      currentStmt += ' ' + line;
      if (trimmed.endsWith(';')) {
        statements.push(currentStmt);
        currentStmt = '';
      }
    }
  }
  
  console.log(`[import] Found ${statements.length} ${tableName} statements`);
  
  const client = await pool.connect();
  let success = 0;
  let failed = 0;
  
  try {
    await client.query('SET session_replication_role = replica;');
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Clean up the statement
      const cleanStmt = stmt
        .replace(/::\w+\[\]/g, '')
        .replace(/::\w+/g, '')
        .replace(/'\[\]'/g, 'ARRAY[]::text[]')
        // Convert only simple string arrays (not JSON)
        .replace(/'\[((?:[^\]{}]|"[^"]*")+)\]'/g, (match, content) => {
          if (content.includes('{') || content.includes('}')) return match;
          const items = content.replace(/"/g, '').split(',').map((s: string) => `'${s.trim()}'`).join(',');
          return `ARRAY[${items}]`;
        })
        .trim();
      
      try {
        await client.query(cleanStmt);
        success++;
      } catch (err: any) {
        failed++;
        if (failed <= 3) {
          console.log(`[import] Error: ${err.message?.substring(0, 100)}`);
        }
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    console.log(`[import] ${tableName}: ${success} succeeded, ${failed} failed`);
    
    // Check count
    const result = await client.query(`SELECT COUNT(*) FROM "${tableKey}"`);
    console.log(`[import] Total ${tableName}: ${result.rows[0].count}`);
    
  } finally {
    client.release();
  }
}

async function importCritical() {
  // Import in order: users → orders → transactions
  await importTable('users', 'users');
  await importTable('orders', 'orders');
  await importTable('transactions', 'transactions');
  await importTable('bot_memory', 'bot_memory');
  await importTable('telegram_chats', 'telegram_chats');
  await importTable('telegram_messages', 'telegram_messages');
  
  await pool.end();
  console.log('\n✅ Import completed!');
}

importCritical();
