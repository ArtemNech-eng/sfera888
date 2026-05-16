import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

async function fixAdminLogin() {
  const password = "admin2026";
  
  // Generate bcrypt hash (same as backend)
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  console.log(`[fix-admin] Generated hash: ${hashedPassword}`);
  
  const client = await pool.connect();
  try {
    // Check current admin
    const checkResult = await client.query(
      `SELECT id, login, password_hash FROM users WHERE login = 'admin'`
    );
    
    if (checkResult.rowCount === 0) {
      console.log("[fix-admin] No admin found, creating new...");
      await client.query(
        `INSERT INTO users (login, password_hash, name, role, permissions) 
         VALUES ('admin', $1, 'Administrator', 'admin', '[]'::jsonb)`,
        [hashedPassword]
      );
      console.log("[fix-admin] Admin created!");
    } else {
      const currentHash = checkResult.rows[0].password_hash;
      console.log(`[fix-admin] Current hash: ${currentHash}`);
      
      // Verify if current hash works
      const isValid = await bcrypt.compare(password, currentHash);
      console.log(`[fix-admin] Current hash valid: ${isValid}`);
      
      if (!isValid) {
        console.log("[fix-admin] Updating password hash...");
        await client.query(
          `UPDATE users SET password_hash = $1 WHERE login = 'admin'`,
          [hashedPassword]
        );
        console.log("[fix-admin] Password updated!");
        
        // Verify new hash
        const verifyResult = await client.query(
          `SELECT password_hash FROM users WHERE login = 'admin'`
        );
        const newValid = await bcrypt.compare(password, verifyResult.rows[0].password_hash);
        console.log(`[fix-admin] New hash valid: ${newValid}`);
      }
    }
    
    console.log("[fix-admin] Done! Try login with: admin / admin2026");
  } finally {
    client.release();
    await pool.end();
  }
}

fixAdminLogin();
