import { pool } from "@workspace/db";

async function checkData() {
  const client = await pool.connect();
  try {
    const tables = ['users', 'masters', 'orders', 'leads', 'transactions', 'settings', 'sessions'];
    
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`${table}: ${result.rows[0].count} rows`);
      } catch (err: any) {
        console.log(`${table}: ERROR - ${err.message?.substring(0, 50)}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkData();
