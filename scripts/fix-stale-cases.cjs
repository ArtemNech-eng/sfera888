const {Pool} = require('../node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const p = new Pool({connectionString: 'postgresql://neondb_owner:npg_Cf0BVM6NRvyo@ep-gentle-tree-ak67wir3.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'});

async function run() {
  // Get ALL active cases
  const {rows: cases} = await p.query('SELECT id, order_id, master_id, risk_level, hours_without_estimate, hours_without_payment FROM chat_cases WHERE is_archived = false ORDER BY id');
  console.log('Active cases:', cases.length);
  
  const orderIds = cases.map(c => c.order_id).filter(Boolean);
  if (orderIds.length === 0) { console.log('No cases'); await p.end(); return; }
  
  // Get orders
  const {rows: orders} = await p.query('SELECT id, proposed_amount, order_amount, status FROM orders WHERE id = ANY($1)', [orderIds]);
  const orderMap = {};
  orders.forEach(o => { orderMap[o.id] = o; });
  
  // Get receipts with prepaymentAmount > 0
  const {rows: receipts} = await p.query('SELECT DISTINCT order_id FROM receipts WHERE order_id = ANY($1) AND prepayment_amount > 0', [orderIds]);
  const receiptSet = new Set(receipts.map(r => r.order_id));
  
  // Get transactions with orderAmount > 0
  const {rows: txs} = await p.query('SELECT DISTINCT order_id FROM transactions WHERE order_id = ANY($1) AND order_amount > 0', [orderIds]);
  const txSet = new Set(txs.map(t => t.order_id));
  
  // Find stale cases: where estimate exists, or order is paid, or order is completed/cancelled
  const stale = [];
  for (const c of cases) {
    if (!c.order_id) continue;
    const o = orderMap[c.order_id];
    const hasEst = (o && Number(o.proposed_amount) > 0) || receiptSet.has(c.order_id) || txSet.has(c.order_id);
    const hasPaid = o && Number(o.order_amount) > 0;
    const isDone = o && ['completed','cancelled','done'].includes(o.status);
    if (hasEst || hasPaid || isDone) {
      stale.push({
        caseId: c.id, 
        orderId: c.order_id, 
        risk: c.risk_level, 
        reason: hasPaid ? 'paid' : isDone ? 'done' : 'has_est',
        proposed: o ? o.proposed_amount : null,
        orderAmt: o ? o.order_amount : null, 
        status: o ? o.status : null
      });
    }
  }
  
  console.log('Stale cases to archive:', stale.length);
  stale.forEach(s => console.log('  case', s.caseId, 'order', s.orderId, s.reason, 'proposed=' + s.proposed, 'orderAmt=' + s.orderAmt, 'status=' + s.status));
  
  // Archive them
  if (stale.length > 0) {
    const staleIds = stale.map(s => s.caseId);
    const result = await p.query(
      'UPDATE chat_cases SET is_resolved = true, is_archived = true, updated_at = NOW() WHERE id = ANY($1) RETURNING id, order_id',
      [staleIds]
    );
    console.log('\nArchived:', result.rows.length, 'cases');
    result.rows.forEach(r => console.log('  archived case', r.id, 'order', r.order_id));
  } else {
    console.log('No stale cases found to archive.');
  }
  
  await p.end();
}

run().catch(e => { console.error(e.message); p.end(); });
