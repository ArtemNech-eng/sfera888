// Import remaining tables - skip already imported ones
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false });
  await client.connect();
  console.log('Connected');
  
  // Check what tables already exist
  const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  const existingTables = existing.rows.map(r => r.tablename);
  console.log('Existing tables:', existingTables.length, existingTables.join(', '));
  
  // Read dump
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  sql = sql.replace(/^--.*$/gm, '');
  
  // Split by statements
  const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 5);
  console.log('Total statements:', statements.length);
  
  // Filter: skip CREATE TABLE/INSERT for already-imported tables
  const skipTables = new Set(existingTables);
  
  // Find where we need to start - skip statements for tables that already have data
  // Strategy: execute all CREATE TABLE (will fail silently for existing), then all INSERT/ALTER/CREATE INDEX
  
  await client.query('SET session_replication_role = replica');
  
  // Batch execute - send 10 statements at a time
  let success = 0;
  let errors = 0;
  let skipped = 0;
  
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    const batchSql = batch.map(s => s.trim()).filter(s => s.length > 5).join(';\n');
    
    if (!batchSql) continue;
    
    try {
      await client.query(batchSql);
      success += batch.length;
    } catch (err) {
      // If batch fails, try one by one
      for (const stmt of batch) {
        const s = stmt.trim();
        if (!s || s.length < 5) continue;
        try {
          await client.query(s);
          success++;
        } catch (e) {
          errors++;
        }
      }
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= statements.length) {
      console.log(`Progress: ${Math.min(i + BATCH_SIZE, statements.length)}/${statements.length} (ok:${success} err:${errors})`);
    }
  }
  
  await client.query('SET session_replication_role = DEFAULT');
  
  // Fix sequences
  console.log('\n--- Fixing sequences ---');
  const tablesRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  for (const row of tablesRes.rows) {
    try {
      const maxRes = await client.query(`SELECT MAX(id) as max_id FROM "${row.tablename}"`);
      if (maxRes.rows[0].max_id) {
        const seqName = `${row.tablename}_id_seq`;
        await client.query(`SELECT setval('${seqName}', ${maxRes.rows[0].max_id})`).catch(() => {});
      }
    } catch (e) {}
  }
  
  // Verify
  const verifyRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nFinal tables: ${verifyRes.rows.length}`);
  verifyRes.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  await client.end();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
