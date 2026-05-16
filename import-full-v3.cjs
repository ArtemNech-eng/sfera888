// Full database import v3: robust with reconnection and batching
const { Pool } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

const pool = new Pool({ 
  connectionString: CONNECTION, 
  ssl: false,
  max: 1,
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 30000
});

function preprocessSQL(sql) {
  sql = sql.replace(/USER-DEFINED\s+DEFAULT\s+'([^']+)'::(\w+)/g, "text DEFAULT '$1'");
  sql = sql.replace(/USER-DEFINED(?!\s+DEFAULT)/g, "text");
  sql = sql.replace(/"(\w+)"\s+ARRAY\s+DEFAULT/g, '"$1" text[] DEFAULT');
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
      if (line.trim() === ');') {
        creates.push(current.trim());
        inCreate = false;
        current = '';
      }
    }
  }
  return creates;
}

// Better INSERT extraction that handles multi-line values with semicolons inside strings
function extractInserts(sql) {
  const inserts = [];
  const lines = sql.split('\n');
  let current = '';
  let inInsert = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inInsert && line.startsWith('INSERT INTO')) {
      inInsert = true;
      current = line;
    } else if (inInsert) {
      current += '\n' + line;
    }
    
    if (inInsert) {
      // Check if this line ends the statement
      // A valid end is ); at the end of line (possibly with trailing whitespace)
      // But we need to make sure we're not inside a string
      if (isStatementComplete(current)) {
        inserts.push(current);
        inInsert = false;
        current = '';
      }
    }
  }
  return inserts;
}

function isStatementComplete(sql) {
  // Count unescaped single quotes - if even, we're not inside a string
  let inString = false;
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (i + 1 < sql.length && sql[i + 1] === "'") {
        i += 2; // escaped quote
        continue;
      }
      inString = !inString;
    }
    i++;
  }
  // Statement is complete if not inside a string and ends with ;
  return !inString && sql.trimEnd().endsWith(';');
}

async function query(sql) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Connecting to Railway PostgreSQL...');
  await query('SELECT 1');
  console.log('Connected!');
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  sql = preprocessSQL(sql);
  console.log('SQL preprocessed');
  
  // Step 1: DROP tables
  const dropRegex = /DROP TABLE IF EXISTS[^;]+;/gi;
  const drops = sql.match(dropRegex) || [];
  console.log(`\n=== Step 1: DROP TABLES (${drops.length}) ===`);
  for (const stmt of drops) {
    try { await query(stmt); } catch(e) {}
  }
  console.log('Done');

  // Step 2: Create sequences
  const seqRegex = /nextval\('([^']+)'::regclass\)/g;
  const sequences = new Set();
  let match;
  while ((match = seqRegex.exec(sql)) !== null) {
    sequences.add(match[1]);
  }
  console.log(`\n=== Step 2: CREATE SEQUENCES (${sequences.size}) ===`);
  for (const seq of sequences) {
    try { await query(`CREATE SEQUENCE IF NOT EXISTS "${seq}"`); } catch(e) {}
  }
  console.log('Done');

  // Step 3: Create tables
  const creates = extractCreateTables(sql);
  console.log(`\n=== Step 3: CREATE TABLES (${creates.length}) ===`);
  let tableOk = 0, tableErr = 0;
  for (const stmt of creates) {
    try {
      await query(stmt);
      tableOk++;
      const m = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log(`  OK: ${m ? m[1] : '?'}`);
    } catch (e) {
      tableErr++;
      const m = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log(`  ERR: ${m ? m[1] : '?'} - ${e.message.substring(0, 100)}`);
    }
  }
  console.log(`Tables: ok=${tableOk}, err=${tableErr}`);

  // Step 4: INSERT data
  await query('SET session_replication_role = replica');
  
  console.log(`\n=== Step 4: EXTRACTING INSERTS ===`);
  const inserts = extractInserts(sql);
  console.log(`Found ${inserts.length} INSERT statements`);
  
  let ok = 0, errs = 0, dups = 0;
  const errorTables = {};
  
  for (let i = 0; i < inserts.length; i++) {
    const stmt = inserts[i].trim();
    try {
      await query(stmt);
      ok++;
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('already exists') || e.message.includes('unique')) {
        dups++;
      } else {
        errs++;
        const tbl = stmt.match(/INSERT INTO "?(\w+)"?/i);
        const name = tbl ? tbl[1] : '?';
        if (!errorTables[name]) {
          errorTables[name] = 0;
          if (Object.keys(errorTables).length <= 10) {
            console.log(`  ERR ${name}: ${e.message.substring(0, 100)}`);
          }
        }
        errorTables[name]++;
      }
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`  ${i+1}/${inserts.length} ok:${ok} dup:${dups} err:${errs}`);
    }
  }
  console.log(`\nInserts: ok=${ok}, dup=${dups}, err=${errs}`);
  if (Object.keys(errorTables).length > 0) {
    console.log('Errors by table:', JSON.stringify(errorTables));
  }

  // Step 5: Indexes
  const indexRegex = /CREATE(?:\s+UNIQUE)?\s+INDEX[^;]+;/gi;
  const indexes = sql.match(indexRegex) || [];
  console.log(`\n=== Step 5: INDEXES (${indexes.length}) ===`);
  let idxOk = 0;
  for (const stmt of indexes) {
    try { await query(stmt); idxOk++; } catch(e) {}
  }
  console.log(`Created: ${idxOk}/${indexes.length}`);

  // Step 6: Update sequences
  console.log(`\n=== Step 6: UPDATE SEQUENCES ===`);
  await query('SET session_replication_role = DEFAULT');
  try {
    const seqRes = await query(`
      SELECT c.relname as table_name, a.attname as column_name, 
             pg_get_serial_sequence(c.relname, a.attname) as seq_name
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_get_serial_sequence(c.relname, a.attname) IS NOT NULL
    `);
    for (const row of seqRes.rows) {
      try {
        await query(`SELECT setval('${row.seq_name}', COALESCE((SELECT MAX("${row.column_name}") FROM "${row.table_name}"), 1))`);
      } catch(e) {}
    }
    console.log(`Updated ${seqRes.rows.length} sequences`);
  } catch(e) {
    console.log('Sequence update error:', e.message.substring(0, 80));
  }

  // Verification
  console.log(`\n=== VERIFICATION ===`);
  const res = await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`Total tables: ${res.rows.length}`);
  res.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  for (const table of ['orders', 'masters', 'leads', 'users', 'telegram_chats', 'bot_sessions']) {
    try {
      const c = await query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      console.log(`  ${table}: ${c.rows[0].cnt} rows`);
    } catch(e) {
      console.log(`  ${table}: ERROR`);
    }
  }

  await pool.end();
  console.log('\n=== IMPORT COMPLETE ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
