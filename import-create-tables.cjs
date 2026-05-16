// Extract and execute only CREATE TABLE statements
const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const fs = require('fs');
const path = require('path');

const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: false });
  await client.connect();
  console.log('Connected');
  
  const dumpPath = path.join(__dirname, 'neondb_dump.sql');
  const sql = fs.readFileSync(dumpPath, 'utf8');
  
  // Extract CREATE TABLE statements (they span multiple lines until closing );)
  const createTableRegex = /CREATE TABLE[^;]*?(?:\([^)]*(?:\([^)]*\)[^)]*)*\))[^;]*;/gs;
  const createStatements = sql.match(createTableRegex) || [];
  console.log('Found CREATE TABLE statements:', createStatements.length);
  
  // Also try a simpler approach - find CREATE TABLE ... ); blocks
  // Split by CREATE TABLE and reconstruct
  const parts = sql.split(/(CREATE TABLE)/);
  const creates = [];
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === 'CREATE TABLE') {
      const rest = parts[i + 1];
      // Find the closing );
      const endIdx = rest.indexOf(');');
      if (endIdx !== -1) {
        creates.push('CREATE TABLE' + rest.substring(0, endIdx + 2));
      }
    }
  }
  console.log('Extracted CREATE TABLE blocks:', creates.length);
  
  let success = 0;
  let errors = 0;
  
  for (const stmt of creates) {
    try {
      await client.query(stmt);
      success++;
      // Extract table name for logging
      const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log('  Created:', match ? match[1] : '?');
    } catch (e) {
      errors++;
      const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?\"?(\w+)\"?/i);
      console.log('  Skip (exists?):', match ? match[1] : '?', '-', e.message.substring(0, 60));
    }
  }
  
  console.log(`\nResults: created=${success}, skipped=${errors}`);
  
  // Verify
  const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log(`\nTables now: ${res.rows.length}`);
  res.rows.forEach(r => console.log(`  ${r.tablename}`));
  
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
