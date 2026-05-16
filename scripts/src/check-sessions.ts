import { pool } from "@workspace/db";

async function checkSessions() {
  const client = await pool.connect();
  try {
    // Check if sessions table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sessions'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log("❌ sessions table does not exist!");
      
      // Create sessions table
      await client.query(`
        CREATE TABLE "sessions" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
        )
      `);
      console.log("✅ sessions table created!");
    } else {
      const result = await client.query('SELECT COUNT(*) FROM sessions');
      console.log(`✅ sessions table exists, rows: ${result.rows[0].count}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkSessions();
