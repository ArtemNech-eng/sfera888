// Fix and create remaining tables with USER-DEFINED type issue
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false });
  await client.connect();
  console.log('Connected');
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  const sql = fs.readFileSync(dumpPath, 'utf8');
  
  // First, create enum types from the dump
  const enumRegex = /CREATE TYPE\s+(\w+)\s+AS ENUM\s*\([^)]+\)/gi;
  const enums = sql.match(enumRegex) || [];
  console.log('Found enum types:', enums.length);
  for (const e of enums) {
    try {
      await client.query(e);
      console.log('  Created enum:', e.substring(0, 60));
    } catch (err) {
      console.log('  Skip enum:', err.message.substring(0, 60));
    }
  }
  
  // Now extract CREATE TABLE blocks and fix USER-DEFINED
  const parts = sql.split(/(CREATE TABLE)/);
  const creates = [];
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === 'CREATE TABLE') {
      const rest = parts[i + 1];
      const endIdx = rest.indexOf(');');
      if (endIdx !== -1) {
        creates.push('CREATE TABLE' + rest.substring(0, endIdx + 2));
      }
    }
  }
  
  // Tables that failed
  const failedTables = ['chat_cases', 'leads', 'masters', 'order_dispatches', 'orders', 'system_tasks', 'telegram_chats', 'transactions', 'users'];
  
  let success = 0;
  let errors = 0;
  
  for (const stmt of creates) {
    const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
    if (!match || !failedTables.includes(match[1])) continue;
    
    // Fix USER-DEFINED -> text
    let fixed = stmt.replace(/USER-DEFINED/g, 'text');
    // Fix ARRAY type issues - replace with text[]
    fixed = fixed.replace(/ARRAY/g, 'text[]');
    // Remove DEFAULT casts to custom types like 'new'::lead_status -> 'new'
    fixed = fixed.replace(/'([^']+)'::(\w+)/g, "'$1'");
    
    try {
      await client.query(fixed);
      success++;
      console.log('  Created:', match[1]);
    } catch (e) {
      errors++;
      console.log('  Error:', match[1], '-', e.message.substring(0, 100));
      // Try without defaults
      let noDefaults = fixed.replace(/DEFAULT\s+'[^']*'/g, '');
      noDefaults = noDefaults.replace(/DEFAULT\s+nextval\('[^']+'\s*(?:::regclass)?\)/g, '');
      try {
        await client.query(noDefaults);
        success++;
        errors--;
        console.log('    Retry OK:', match[1]);
      } catch (e2) {
        console.log('    Retry fail:', e2.message.substring(0, 100));
      }
    }
  }
  
  console.log(`\nResults: created=${success}, errors=${errors}`);
  
  // Create sequences for tables that need them
  const seqRegex = /CREATE SEQUENCE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/gi;
  const seqs = [...sql.matchAll(seqRegex)];
  console.log('\nCreating sequences:', seqs.length);
  for (const s of seqs) {
    const seqStmt = `CREATE SEQUENCE IF NOT EXISTS "${s[1]}"`;
    try {
      await client.query(seqStmt);
    } catch (e) {}
  }
  
  // Verify
  const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nTables now: ${res.rows.length}`);
  res.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
