const { spawn } = require('child_process');

const connStr = 'postgresql://postgres:vWeVmsCZFukvyvrdIcWBhRuFxYcdtJyr@yamanote.proxy.rlwy.net:24755/railway';

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const args = [connStr, '-c', sql, '-t', '-A'];
    const child = spawn('psql', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err || `exit ${code}`));
      resolve(out.trim());
    });
  });
}

async function main() {
  console.log('=== Orders #4 and #6 ===');
  const r1 = await runQuery(`SELECT id, status, payment_model, created_at FROM orders WHERE id IN (4, 6)`);
  console.log(r1);

  console.log('\n=== payment_model distribution ===');
  const r2 = await runQuery(`SELECT COALESCE(NULLIF(payment_model, ''), 'EMPTY_STRING') as val, COUNT(*) as cnt FROM orders GROUP BY payment_model ORDER BY cnt DESC`);
  console.log(r2);

  console.log('\n=== Broken payment_model count ===');
  const r3 = await runQuery(`SELECT COUNT(*) FROM orders WHERE payment_model IS NULL OR payment_model = ''`);
  console.log(r3);
}

main().catch(e => { console.error(e.message); process.exit(1); });
