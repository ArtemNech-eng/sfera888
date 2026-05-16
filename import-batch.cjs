// Batch import v2 - uses single Client, autocommit, survives kill
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';
const START_FROM = parseInt(process.env.START || '0');

function preprocessSQL(sql) {
  sql = sql.replace(/USER-DEFINED\s+DEFAULT\s+'([^']+)'::(\w+)/g, "text DEFAULT '$1'");
  sql = sql.replace(/USER-DEFINED(?!\s+DEFAULT)/g, "text");
  sql = sql.replace(/"(\w+)"\s+ARRAY\s+DEFAULT/g, '"$1" text[] DEFAULT');
  sql = sql.replace(/"(\w+)"\s+ARRAY(?!\s+DEFAULT)/g, '"$1" text[]');
  return sql;
}

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
      let inStr = false;
      for (let j = 0; j < current.length; j++) {
        if (current[j] === "'" && j + 1 < current.length && current[j+1] === "'") { j++; continue; }
        if (current[j] === "'") inStr = !inStr;
      }
      if (!inStr && current.trimEnd().endsWith(';')) {
        inserts.push(current);
        inInsert = false;
        current = '';
      }
    }
  }
  return inserts;
}

async function createClient() {
  const client = new Client({ connectionString: CONNECTION, ssl: false });
  await client.connect();
  await client.query('SET session_replication_role = replica');
  await client.query('SET statement_timeout = 120000'); // 2min per statement
  return client;
}

async function main() {
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  sql = preprocessSQL(sql);
  
  const inserts = extractInserts(sql);
  console.log(`Total: ${inserts.length}, start: ${START_FROM}`);
  
  let client = await createClient();
  let ok = 0, errs = 0, dups = 0;
  
  for (let i = START_FROM; i < inserts.length; i++) {
    const stmt = inserts[i];
    try {
      await client.query(stmt);
      ok++;
    } catch(e) {
      const msg = e.message || '';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
        dups++;
      } else if (msg.includes('Connection terminated') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
        // Reconnect
        console.log(`  Reconnecting at ${i}...`);
        try { await client.end(); } catch(e2) {}
        client = await createClient();
        // Retry this statement
        try {
          await client.query(stmt);
          ok++;
        } catch(e2) {
          errs++;
        }
      } else {
        errs++;
      }
    }
    
    if ((i + 1) % 200 === 0 || i === inserts.length - 1) {
      console.log(`${i+1}/${inserts.length} ok:${ok} dup:${dups} err:${errs}`);
    }
  }
  
  console.log(`\nDONE: ok=${ok} dup=${dups} err=${errs}`);
  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
