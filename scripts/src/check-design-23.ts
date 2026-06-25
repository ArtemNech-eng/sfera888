import { pool } from "@workspace/db";

const r = await pool.query(`
  SELECT id, slug, status, is_public,
    layout_json IS NOT NULL AS has_layout,
    top_down_plan_url,
    jsonb_array_length(views) AS views_count,
    jsonb_array_length(detail_crops) AS crops_count,
    error_message
  FROM designs WHERE id = 23
`);

console.log(JSON.stringify(r.rows[0], null, 2));
await pool.end();
process.exit(0);
