const {Pool} = require('../node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const p = new Pool({connectionString: 'postgresql://neondb_owner:npg_Cf0BVM6NRvyo@ep-gentle-tree-ak67wir3.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'});

async function run() {
  // Find all receipts where prepaymentSubmittedAt is set but prepaymentSeenAt is null
  const {rows: pending} = await p.query(
    'SELECT id, order_id, prepayment_amount, prepayment_submitted_at, prepayment_seen_at FROM receipts WHERE prepayment_submitted_at IS NOT NULL AND prepayment_seen_at IS NULL ORDER BY id'
  );
  console.log('Pending receipts (submitted but not seen):', pending.length);
  pending.forEach(r => console.log(`  receipt #${r.id} order #${r.order_id} amount=${r.prepayment_amount} submitted=${r.prepayment_submitted_at}`));
  
  if (pending.length > 0) {
    const ids = pending.map(r => r.id);
    const result = await p.query(
      'UPDATE receipts SET prepayment_seen_at = prepayment_submitted_at WHERE id = ANY($1) RETURNING id, order_id',
      [ids]
    );
    console.log('\nConfirmed:', result.rows.length, 'receipts');
    result.rows.forEach(r => console.log(`  confirmed receipt #${r.id} order #${r.order_id}`));
  } else {
    console.log('No pending receipts to confirm.');
  }
  
  await p.end();
}

run().catch(e => { console.error(e.message); p.end(); });
