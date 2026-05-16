import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

async function resetPassword() {
  const newPassword = process.argv[2] || "admin2026";
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  console.log(`[reset] Setting admin password to: ${newPassword}`);
  
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE users SET password_hash = $1 WHERE login = 'admin' OR role = 'admin' RETURNING id, login`,
      [hashedPassword]
    );
    
    if (result.rowCount === 0) {
      console.log("[reset] No admin user found, creating...");
      await client.query(
        `INSERT INTO users (login, password_hash, name, role) VALUES ('admin', $1, 'Admin', 'admin')`,
        [hashedPassword]
      );
    } else {
      console.log(`[reset] Password updated for: ${result.rows[0].login}`);
    }
    
    console.log("[reset] Done!");
  } finally {
    client.release();
    await pool.end();
  }
}

resetPassword();
