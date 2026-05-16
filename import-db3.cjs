// Import remaining - start from statement 6500
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';
const START_FROM = 6500;

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false, statement_timeout: 120000 });
  await client.connect();
  console.log('Connected, starting from', START_FROM);
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  sql = sql.replace(/^--.*$/gm, '');
  
  const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 5);
  console.log('Total statements:', statements.length, 'processing from', START_FROM);
  
  await client.query('SET session_replication_role = replica');
  
  let success = 0;
  let errors = 0;
  
  // Process one by one from START_FROM to avoid batch timeout issues
  for (let i = START_FROM; i < statements.length; i++) {
    const s = statements[i].trim();
    if (!s || s.length < 5) continue;
    
    try {
      await client.query(s);
      success++;
    } catch (e) {
      errors++;
    }
    
    if ((i - START_FROM + 1) % 100 === 0) {
      console.log(`Progress: ${i+1}/${statements.length} (ok:${success} err:${errors})`);
    }
  }
  
  console.log(`\nFinal: ok:${success} err:${errors}`);
  
  await client.query('SET session_replication_role = DEFAULT');
  
  // Verify
  const verifyRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nFinal tables: ${verifyRes.rows.length}`);
  verifyRes.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  await client.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
