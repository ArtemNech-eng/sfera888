// Full database import: DROP tables, CREATE sequences, CREATE tables, INSERT data, CREATE indexes
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ 
    connectionString: CONNECTION, 
    ssl: false, 
    statement_timeout: 300000,
    query_timeout: 300000
  });
  await client.connect();
  console.log('Connected to Railway PostgreSQL');
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  const sql = fs.readFileSync(dumpPath, 'utf8');
  
  // Step 1: Extract all DROP TABLE statements
  const dropRegex = /DROP TABLE IF EXISTS[^;]+;/gi;
  const drops = sql.match(dropRegex) || [];
  console.log(`\n=== Step 1: DROP TABLES (${drops.length}) ===`);
  
  for (const stmt of drops) {
    try {
      await client.query(stmt);
    } catch (e) {
      // ignore drop errors
    }
  }
  console.log('All tables dropped');

  // Step 2: Find all sequences referenced in CREATE TABLE defaults
  const seqRegex = /nextval\('([^']+)'::regclass\)/g;
  const sequences = new Set();
  let match;
  while ((match = seqRegex.exec(sql)) !== null) {
    sequences.add(match[1]);
  }
  console.log(`\n=== Step 2: CREATE SEQUENCES (${sequences.size}) ===`);
  
  for (const seq of sequences) {
    try {
      await client.query(`CREATE SEQUENCE IF NOT EXISTS "${seq}"`);
      console.log(`  Created: ${seq}`);
    } catch (e) {
      console.log(`  Skip: ${seq} - ${e.message.substring(0, 50)}`);
    }
  }

  // Step 3: Extract and execute CREATE TABLE statements
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
  console.log(`\n=== Step 3: CREATE TABLES (${creates.length}) ===`);
  
  let tableSuccess = 0;
  let tableErrors = 0;
  for (const stmt of creates) {
    try {
      await client.query(stmt);
      tableSuccess++;
      const m = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log(`  Created: ${m ? m[1] : '?'}`);
    } catch (e) {
      tableErrors++;
      const m = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log(`  Error: ${m ? m[1] : '?'} - ${e.message.substring(0, 80)}`);
    }
  }
  console.log(`Tables: created=${tableSuccess}, errors=${tableErrors}`);

  // Step 4: INSERT data
  // Disable FK checks for faster import
  await client.query('SET session_replication_role = replica');
  
  const insertRegex = /INSERT INTO[^;]+;/gs;
  const inserts = sql.match(insertRegex) || [];
  console.log(`\n=== Step 4: INSERT DATA (${inserts.length} statements) ===`);
  
  let insertSuccess = 0;
  let insertErrors = 0;
  let insertDuplicates = 0;
  
  for (let i = 0; i < inserts.length; i++) {
    const stmt = inserts[i].trim();
    try {
      await client.query(stmt);
      insertSuccess++;
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('already exists') || e.message.includes('unique')) {
        insertDuplicates++;
      } else {
        insertErrors++;
        if (insertErrors <= 10) {
          const tbl = stmt.match(/INSERT INTO "?(\w+)"?/i);
          console.log(`  Error in ${tbl ? tbl[1] : '?'}: ${e.message.substring(0, 100)}`);
        }
      }
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i+1}/${inserts.length} (ok:${insertSuccess} dup:${insertDuplicates} err:${insertErrors})`);
    }
  }
  console.log(`Inserts: success=${insertSuccess}, duplicates=${insertDuplicates}, errors=${insertErrors}`);

  // Step 5: CREATE INDEXES
  const indexRegex = /CREATE(?:\s+UNIQUE)?\s+INDEX[^;]+;/gi;
  const indexes = sql.match(indexRegex) || [];
  console.log(`\n=== Step 5: CREATE INDEXES (${indexes.length}) ===`);
  
  let idxSuccess = 0;
  for (const stmt of indexes) {
    try {
      await client.query(stmt);
      idxSuccess++;
    } catch (e) {
      // index already exists - fine
    }
  }
  console.log(`Indexes created: ${idxSuccess}/${indexes.length}`);

  // Step 6: Update sequences to match max IDs
  console.log(`\n=== Step 6: UPDATE SEQUENCES ===`);
  await client.query('SET session_replication_role = DEFAULT');
  
  // Get all tables with serial/sequence columns
  const tablesRes = await client.query(`
    SELECT c.relname as table_name, a.attname as column_name, 
           pg_get_serial_sequence(c.relname, a.attname) as seq_name
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND a.attnum > 0 
      AND NOT a.attisdropped
      AND pg_get_serial_sequence(c.relname, a.attname) IS NOT NULL
  `);
  
  for (const row of tablesRes.rows) {
    try {
      await client.query(`SELECT setval('${row.seq_name}', COALESCE((SELECT MAX("${row.column_name}") FROM "${row.table_name}"), 1))`);
      console.log(`  Updated: ${row.seq_name}`);
    } catch (e) {
      // ignore
    }
  }

  // Final verification
  console.log(`\n=== VERIFICATION ===`);
  const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`Total tables: ${res.rows.length}`);
  res.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  // Count rows in key tables
  for (const table of ['orders', 'masters', 'clients', 'users']) {
    try {
      const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      console.log(`  ${table}: ${countRes.rows[0].cnt} rows`);
    } catch (e) {
      // table might not exist
    }
  }

  await client.end();
  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
