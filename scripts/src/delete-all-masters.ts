import { pool } from "@workspace/db";

async function deleteAll() {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM "masters";');
    console.log("[delete] All masters deleted!");
  } finally {
    client.release();
    await pool.end();
  }
}

deleteAll();
