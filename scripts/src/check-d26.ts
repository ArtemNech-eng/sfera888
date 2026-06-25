import { pool } from "@workspace/db";
const r = await pool.query(
  "SELECT id,slug,status,progress,current_step,error_message FROM designs WHERE id=27"
);
console.log(JSON.stringify(r.rows[0], null, 2));
await pool.end();
