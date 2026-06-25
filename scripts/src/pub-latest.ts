import { pool } from "@workspace/db";
const d = await pool.query(`
  SELECT id, slug, status, is_public,
    array_length(views, 1) AS views_count,
    layout_json IS NOT NULL AS has_layout
  FROM designs WHERE id = (SELECT MAX(id) FROM designs)
`);
const row = d.rows[0];
console.log(JSON.stringify(row, null, 2));
if (row.status === 'completed' || row.has_layout) {
  await pool.query(`UPDATE designs SET status='completed', is_public=true, error_message=NULL WHERE id=$1`, [row.id]);
  console.log('PUBLISHED id=' + row.id);
}
await pool.end();
