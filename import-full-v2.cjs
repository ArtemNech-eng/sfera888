// Full database import v2: fixes USER-DEFINED and ARRAY types
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

function preprocessSQL(sql) {
  // Fix USER-DEFINED types - replace with text
  // Pattern: "column" USER-DEFINED DEFAULT 'value'::enum_name NOT NULL
  sql = sql.replace(/USER-DEFINED\s+DEFAULT\s+'([^']+)'::(\w+)/g, "text DEFAULT '$1'");
  // Pattern: "column" USER-DEFINED NOT NULL (without default)
  sql = sql.replace(/USER-DEFINED(?!\s+DEFAULT)/g, "text");
  
  // Fix ARRAY type - replace with text[]
  // Pattern: "column" ARRAY DEFAULT '{}'::text[] NOT NULL
  sql = sql.replace(/"(\w+)"\s+ARRAY\s+DEFAULT/g, '"$1" text[] DEFAULT');
  // Pattern: "column" ARRAY NOT NULL (without default)  
  sql = sql.replace(/"(\w+)"\s+ARRAY(?!\s+DEFAULT)/g, '"$1" text[]');
  
  return sql;
}

function extractCreateTables(sql) {
  const creates = [];
  const lines = sql.split('\n');
  let inCreate = false;
  let current = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('CREATE TABLE')) {
      inCreate = true;
      current = line + '\n';
    } else if (inCreate) {
      current += line + '\n';
      // End of CREATE TABLE is ); on its own line
      if (line.trim() === ');') {
        creates.push(current.trim());
        inCreate = false;
        current = '';
      }
    }
  }
  return creates;
}

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
  let sql = fs.readFileSync(dumpPath, 'utf8');
  
  // Preprocess to fix type issues
  sql = preprocessSQL(sql);
  console.log('SQL preprocessed (fixed USER-DEFINED and ARRAY types)');
  
  // Step 1: DROP all existing tables
  const dropRegex = /DROP TABLE IF EXISTS[^;]+;/gi;
  const drops = sql.match(dropRegex) || [];
  console.log(`\n=== Step 1: DROP TABLES (${drops.length}) ===`);
  
  for (const stmt of drops) {
    try {
      await client.query(stmt);
    } catch (e) {
      // ignore
    }
  }
  console.log('All tables dropped');

  // Step 2: Create sequences
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
    } catch (e) {
      console.log(`  Skip: ${seq} - ${e.message.substring(0, 50)}`);
    }
  }
  console.log('Sequences created');

  // Step 3: Create tables with proper parsing
  const creates = extractCreateTables(sql);
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
      console.log(`  Error: ${m ? m[1] : '?'} - ${e.message.substring(0, 120)}`);
    }
  }
  console.log(`Tables: created=${tableSuccess}, errors=${tableErrors}`);

  // Step 4: INSERT data
  await client.query('SET session_replication_role = replica');
  
  const insertRegex = /INSERT INTO[^;]+;/gs;
  const inserts = sql.match(insertRegex) || [];
  console.log(`\n=== Step 4: INSERT DATA (${inserts.length} statements) ===`);
  
  let insertSuccess = 0;
  let insertErrors = 0;
  let insertDuplicates = 0;
  const errorTables = {};
  
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
        const tbl = stmt.match(/INSERT INTO "?(\w+)"?/i);
        const tableName = tbl ? tbl[1] : '?';
        if (!errorTables[tableName]) {
          errorTables[tableName] = 0;
          console.log(`  Error in ${tableName}: ${e.message.substring(0, 120)}`);
        }
        errorTables[tableName]++;
      }
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i+1}/${inserts.length} (ok:${insertSuccess} dup:${insertDuplicates} err:${insertErrors})`);
    }
  }
  console.log(`\nInserts: success=${insertSuccess}, duplicates=${insertDuplicates}, errors=${insertErrors}`);
  if (Object.keys(errorTables).length > 0) {
    console.log('Error tables:', errorTables);
  }

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
      // index already exists
    }
  }
  console.log(`Indexes created: ${idxSuccess}/${indexes.length}`);

  // Step 6: Update sequences
  console.log(`\n=== Step 6: UPDATE SEQUENCES ===`);
  await client.query('SET session_replication_role = DEFAULT');
  
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
    } catch (e) {
      // ignore
    }
  }
  console.log(`Updated ${tablesRes.rows.length} sequences`);

  // Final verification
  console.log(`\n=== VERIFICATION ===`);
  const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`Total tables: ${res.rows.length}`);
  res.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  for (const table of ['orders', 'masters', 'clients', 'leads', 'users', 'telegram_chats']) {
    try {
      const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      console.log(`  ${table}: ${countRes.rows[0].cnt} rows`);
    } catch (e) {
      console.log(`  ${table}: NOT FOUND`);
    }
  }

  await client.end();
  console.log('\n=== IMPORT COMPLETE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
