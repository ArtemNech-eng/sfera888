import { pool } from "@workspace/db";

const tables = [
  'avito_settings', 'bot_memory', 'bot_sessions', 'browser_agent_scenarios', 'chat_cases',
  'client_support_messages', 'dispatcher_followups', 'fomo_events',
  'master_checkins', 'master_messages', 'master_reviews', 'master_tasks',
  'master_wallet', 'max_bot_logs', 'operator_push_subscriptions',
  'order_broadcast_waves', 'order_dispatches', 'order_master_history',
  'order_status_logs', 'orders', 'push_subscriptions', 'receipts',
  'scenario_notifications', 'scenario_runs', 'service_token_prices',
  'sessions', 'settings', 'system_tasks', 'task_snoozes', 'telegram_chats',
  'telegram_messages', 'token_packages', 'token_price_history',
  'transactions', 'users', 'voronka_columns', 'wallet_transactions'
];

async function truncateAll() {
  console.log("[truncate] Connecting to database...");
  const client = await pool.connect();
  
  try {
    console.log("[truncate] Disabling foreign key checks...");
    await client.query('SET session_replication_role = replica;');
    
    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE;`);
        console.log(`[truncate] Cleared: ${table}`);
      } catch (err: any) {
        console.log(`[truncate] Skipped ${table}: ${err.message?.substring(0, 50)}`);
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    console.log("[truncate] All tables cleared!");
  } finally {
    client.release();
    await pool.end();
  }
}

truncateAll();
