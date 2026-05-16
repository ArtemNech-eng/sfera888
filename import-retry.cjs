const fs = require('fs');
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');

const DATABASE_URL = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

// Tables that had errors
const TARGET_TABLES = ['orders', 'masters', 'telegram_messages', 'chat_cases', 'master_messages'];

async function main() {
  const dump = fs.readFileSync('neondb_dump.sql', 'utf8');
  const lines = dump.split('\n');
  
  // Find INSERT lines for target tables
  const inserts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('INSERT INTO')) continue;
    for (const t of TARGET_TABLES) {
      if (line.includes(`"${t}"`)) {
        inserts.push({ line: i, table: t, sql: line });
        break;
      }
    }
  }
  
  console.log(`Found ${inserts.length} INSERTs for target tables`);
  for (const t of TARGET_TABLES) {
    const count = inserts.filter(x => x.table === t).length;
    console.log(`  ${t}: ${count}`);
  }

  const c = new Client({ connectionString: DATABASE_URL, ssl: false });
  await c.connect();
  
  let ok = 0, err = 0, dup = 0;
  
  for (let i = 0; i < inserts.length; i++) {
    const { sql, table } = inserts[i];
    try {
      const r = await c.query(sql);
      ok += r.rowCount;
    } catch (e) {
      if (e.message.includes('duplicate key')) {
        dup++;
      } else {
        err++;
        if (err <= 5) {
          console.log(`ERR [${table}]: ${e.message.substring(0, 150)}`);
        }
      }
    }
    if ((i + 1) % 20 === 0) {
      process.stdout.write(`\r${i + 1}/${inserts.length} ok:${ok} dup:${dup} err:${err}`);
    }
  }
  
  console.log(`\nDONE: ok=${ok} dup=${dup} err=${err}`);
  await c.end();
}

main().catch(e => console.error(e));
