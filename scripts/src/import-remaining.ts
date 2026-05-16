import { pool } from "@workspace/db";
import fs from "fs";

const sqlFile = "../neondb_dump.sql";

const tablesToImport = [
  'avito_settings', 'browser_agent_scenarios', 'chat_cases',
  'client_support_messages', 'dispatcher_followups', 'fomo_events',
  'master_checkins', 'master_messages', 'master_reviews', 'master_tasks',
  'max_bot_logs', 'operator_push_subscriptions',
  'order_broadcast_waves', 'order_dispatches', 'order_master_history',
  'order_status_logs', 'push_subscriptions', 'receipts',
  'scenario_notifications', 'scenario_runs',
  'system_tasks', 'task_snoozes', 'telegram_chats',
  'telegram_messages', 'voronka_columns'
];

async function importTable(tableName: string) {
  console.log(`\n[import] Processing ${tableName}...`);
  
  const sql = fs.readFileSync(sqlFile, "utf-8");
  const lines = sql.split('\n');
  const statements: string[] = [];
  let currentStmt = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    
    const insertKey = `insert into "${tableName}"`;
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
  
  if (statements.length === 0) {
    console.log(`[import] ${tableName}: no data in dump`);
    return;
  }
  
  console.log(`[import] Found ${statements.length} statements for ${tableName}`);
  
  const client = await pool.connect();
  let success = 0;
  let failed = 0;
  
  try {
    await client.query('SET session_replication_role = replica;');
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const cleanStmt = stmt
        .replace(/::\w+\[\]/g, '')
        .replace(/::\w+/g, '')
        .replace(/'\[\]'/g, 'ARRAY[]::text[]')
        // Convert only simple string arrays (not JSON objects)
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
        if (failed <= 2) {
          console.log(`[import] Error: ${err.message?.substring(0, 80)}`);
        }
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    console.log(`[import] ${tableName}: ${success} succeeded, ${failed} failed`);
    
    const result = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
    console.log(`[import] Total ${tableName}: ${result.rows[0].count}`);
    
  } finally {
    client.release();
  }
}

async function importAll() {
  for (const table of tablesToImport) {
    await importTable(table);
  }
  await pool.end();
  console.log('\n✅ All remaining tables imported!');
}

importAll();
