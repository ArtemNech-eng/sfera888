// Check import progress and database state
const fs = require('fs');
const { Pool } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');

const LOG_PATH = 'C:\\Users\\Admin\\AppData\\Local\\Temp\\cline\\background-1778846458831-5splar8.log';
const CONNECTION = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  // Check log
  console.log('=== LOG STATUS ===');
  try {
    const log = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = log.split('\n');
    console.log('Log lines:', lines.length);
    console.log(lines.slice(-10).join('\n'));
  } catch(e) {
    console.log('Log not found');
  }

  // Check database
  console.log('\n=== DATABASE STATUS ===');
  const pool = new Pool({ connectionString: CONNECTION, ssl: false, max: 1 });
  try {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log(`Tables: ${tables.rows.length}`);
    
    for (const table of ['orders', 'masters', 'leads', 'users', 'telegram_chats', 'bot_sessions', 'chat_cases', 'cities']) {
      try {
        const c = await pool.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
        console.log(`  ${table}: ${c.rows[0].cnt} rows`);
      } catch(e) {
        console.log(`  ${table}: ${e.message.substring(0, 50)}`);
      }
    }
  } catch(e) {
    console.log('DB Error:', e.message);
  }
  await pool.end();
}

main();
