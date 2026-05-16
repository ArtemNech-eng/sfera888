const { Client } = require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');

const DATABASE_URL = 'postgresql://postgres:GckyjRLJFqmmiJYFfbSEKbolRFajllOM@switchback.proxy.rlwy.net:15948/railway';

async function main() {
  const c = new Client({ connectionString: DATABASE_URL, ssl: false });
  await c.connect();

  // Find all ARRAY columns across all tables
  const res = await c.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema='public' AND data_type='ARRAY'
    ORDER BY table_name, column_name
  `);
  
  console.log('Array columns found:', res.rows.length);
  for (const row of res.rows) {
    console.log(`  ${row.table_name}.${row.column_name}`);
  }

  // For each array column, drop default, change to jsonb, set new default
  for (const { table_name, column_name } of res.rows) {
    try {
      await c.query(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" DROP DEFAULT`);
      await c.query(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" TYPE jsonb USING "${column_name}"::text::jsonb`);
      await c.query(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" SET DEFAULT '[]'::jsonb`);
      console.log(`OK: ${table_name}.${column_name} -> jsonb`);
    } catch (e) {
      console.log(`ERR: ${table_name}.${column_name}: ${e.message.substring(0, 100)}`);
    }
  }

  await c.end();
  console.log('Done');
}

main().catch(e => console.error(e));
