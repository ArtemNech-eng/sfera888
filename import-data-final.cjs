// Final data import - insert data into all tables
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false, statement_timeout: 120000 });
  await client.connect();
  console.log('Connected');
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  
  // Remove comments
  sql = sql.replace(/^--.*$/gm, '');
  
  // Extract only INSERT statements
  const insertRegex = /INSERT INTO[^;]+;/gs;
  const inserts = sql.match(insertRegex) || [];
  console.log('Total INSERT statements:', inserts.length);
  
  await client.query('SET session_replication_role = replica');
  
  let success = 0;
  let errors = 0;
  let duplicates = 0;
  
  for (let i = 0; i < inserts.length; i++) {
    const stmt = inserts[i].trim();
    try {
      await client.query(stmt);
      success++;
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('already exists') || e.message.includes('unique')) {
        duplicates++;
      } else {
        errors++;
        if (errors <= 5) {
          const tbl = stmt.match(/INSERT INTO "?(\w+)"?/i);
          console.log(`  Error in ${tbl?tbl[1]:'?'}: ${e.message.substring(0, 80)}`);
        }
      }
    }
    
    if ((i + 1) % 50 === 0) {
      console.log(`Progress: ${i+1}/${inserts.length} (ok:${success} dup:${duplicates} err:${errors})`);
    }
  }
  
  console.log(`\nFinal: ok:${success} duplicates:${duplicates} errors:${errors}`);
  
  await client.query('SET session_replication_role = DEFAULT');
  
  // Show row counts for key tables
  const tables = ['leads', 'masters', 'orders', 'users', 'transactions', 'telegram_chats', 'system_tasks', 'chat_cases'];
  for (const t of tables) {
    try {
      const r = await client.query(`SELECT count(*) as c FROM "${t}"`);
      console.log(`  ${t}: ${r.rows[0].c} rows`);
    } catch (e) {
      console.log(`  ${t}: ERR`);
    }
  }
  
  await client.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
