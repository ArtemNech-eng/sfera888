const fs = require('fs');
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');

const DATABASE_URL = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const dump = fs.readFileSync('neondb_dump.sql', 'utf8');
  const lines = dump.split('\n');
  
  // Collect multi-line INSERT statements for orders and masters
  const statements = [];
  let current = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('INSERT INTO "orders"') || line.startsWith('INSERT INTO "masters"')) {
      // Start new statement
      if (current) {
        statements.push(current);
      }
      current = { table: line.startsWith('INSERT INTO "orders"') ? 'orders' : 'masters', sql: line };
    } else if (current) {
      // Check if this is a continuation of the current INSERT
      if (current.sql.endsWith(';')) {
        // Previous statement is complete
        statements.push(current);
        current = null;
        // Check if this line starts a new INSERT
        if (line.startsWith('INSERT INTO "orders"') || line.startsWith('INSERT INTO "masters"')) {
          current = { table: line.startsWith('INSERT INTO "orders"') ? 'orders' : 'masters', sql: line };
        }
      } else {
        // Continuation of multi-line INSERT
        current.sql += '\n' + line;
      }
    }
  }
  if (current) statements.push(current);
  
  const ordersCount = statements.filter(s => s.table === 'orders').length;
  const mastersCount = statements.filter(s => s.table === 'masters').length;
  console.log(`Found: orders=${ordersCount}, masters=${mastersCount}`);

  const c = new Client({ connectionString: DATABASE_URL, ssl: false });
  await c.connect();
  
  let ok = 0, err = 0, dup = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const { sql, table } = statements[i];
    try {
      const r = await c.query(sql);
      ok += r.rowCount;
    } catch (e) {
      if (e.message.includes('duplicate key')) {
        dup++;
      } else {
        err++;
        if (err <= 3) {
          console.log(`ERR [${table}]: ${e.message.substring(0, 150)}`);
        }
      }
    }
    if ((i + 1) % 10 === 0 || i === statements.length - 1) {
      process.stdout.write(`\r${i + 1}/${statements.length} ok:${ok} dup:${dup} err:${err}`);
    }
  }
  
  console.log(`\nDONE: ok=${ok} dup=${dup} err=${err}`);
  await c.end();
}

main().catch(e => console.error(e));
