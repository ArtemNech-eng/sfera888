const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false });
  await client.connect();
  console.log('Connected to Railway PostgreSQL');
  
  // Step 1: Drop all existing tables and sequences
  console.log('\n--- Cleaning database ---');
  await client.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
      END LOOP;
      FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS "' || r.sequence_name || '" CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('All tables and sequences dropped');
  
  // Step 2: Read dump and fix it
  console.log('\n--- Preparing dump ---');
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  let sql = fs.readFileSync(dumpPath, 'utf8');
  
  // Remove comment-only lines
  sql = sql.replace(/^--.*$/gm, '');
  
  // Extract all sequence references and create them first
  const seqMatches = sql.match(/nextval\('([^']+)'::regclass\)/g) || [];
  const sequences = [...new Set(seqMatches.map(m => m.match(/nextval\('([^']+)'/)[1]))];
  
  console.log(`Found ${sequences.length} sequences to create`);
  
  // Create sequences first
  for (const seq of sequences) {
    try {
      await client.query(`CREATE SEQUENCE IF NOT EXISTS "${seq}"`);
    } catch (e) {
      // ignore if exists
    }
  }
  console.log('Sequences created');
  
  // Step 3: Disable FK checks and execute statements
  await client.query('SET session_replication_role = replica');
  
  // Split by statements
  const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 5);
  console.log(`Total statements: ${statements.length}`);
  
  let success = 0;
  let errors = 0;
  const errorSamples = [];
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt || stmt.length < 5) continue;
    
    try {
      await client.query(stmt);
      success++;
      if (success % 500 === 0) {
        console.log(`Progress: ${success}/${statements.length}...`);
      }
    } catch (err) {
      errors++;
      if (errorSamples.length < 10) {
        errorSamples.push({ i: i+1, msg: err.message, stmt: stmt.substring(0, 100) });
      }
    }
  }
  
  // Re-enable FK checks
  await client.query('SET session_replication_role = DEFAULT');
  
  // Fix sequences to match max IDs
  console.log('\n--- Fixing sequences ---');
  const tablesRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  for (const row of tablesRes.rows) {
    try {
      // Try to set sequence to max id
      const maxRes = await client.query(`SELECT MAX(id) as max_id FROM "${row.tablename}"`);
      if (maxRes.rows[0].max_id) {
        const seqName = `${row.tablename}_id_seq`;
        await client.query(`SELECT setval('${seqName}', ${maxRes.rows[0].max_id})`).catch(() => {});
      }
    } catch (e) {
      // table might not have id column
    }
  }
  
  // Verify
  const verifyRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nTables in Railway DB: ${verifyRes.rows.length}`);
  verifyRes.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  await client.end();
  
  console.log(`\n--- RESULT ---`);
  console.log(`Success: ${success}, Errors: ${errors}`);
  if (errorSamples.length > 0) {
    console.log('\nSample errors:');
    errorSamples.forEach(e => console.log(`  #${e.i}: ${e.msg}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
