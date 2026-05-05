const {Pool} = require('../node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const p = new Pool({connectionString: 'postgresql://neondb_owner:npg_Cf0BVM6NRvyo@ep-gentle-tree-ak67wir3.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'});

async function run() {
  // Get all active cases with full info
  const {rows: cases} = await p.query('SELECT id, order_id, master_id, risk_level, hours_without_estimate, hours_without_payment FROM chat_cases WHERE is_archived = false ORDER BY id');
  console.log('Active cases:', JSON.stringify(cases, null, 2));
  
  // Get order 103 specifically
  const {rows: o103} = await p.query('SELECT id, proposed_amount, order_amount, status, prepayment_amount FROM orders WHERE id = 103');
  console.log('\nOrder 103:', JSON.stringify(o103, null, 2));
  
  // Get receipt for order 103
  const {rows: r103} = await p.query('SELECT id, order_id, prepayment_amount, prepayment_submitted_at, prepayment_seen_at FROM receipts WHERE order_id = 103');
  console.log('\nReceipts for order 103:', JSON.stringify(r103, null, 2));
  
  // Get transaction for order 103
  const {rows: t103} = await p.query('SELECT id, order_id, order_amount, commission, payment_status FROM transactions WHERE order_id = 103');
  console.log('\nTransactions for order 103:', JSON.stringify(t103, null, 2));
  
  await p.end();
}

run().catch(e => { console.error(e.message); p.end(); });
