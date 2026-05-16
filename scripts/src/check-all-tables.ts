import { pool } from "@workspace/db";

async function checkAll() {
  const client = await pool.connect();
  
  const tables = [
    'users', 'masters', 'orders', 'leads', 'transactions',
    'avito_settings', 'bot_memory', 'browser_agent_scenarios', 'chat_cases',
    'client_support_messages', 'dispatcher_followups', 'fomo_events',
    'master_checkins', 'master_messages', 'master_reviews', 'master_tasks',
    'max_bot_logs', 'operator_push_subscriptions',
    'order_broadcast_waves', 'order_dispatches', 'order_master_history',
    'order_status_logs', 'push_subscriptions', 'receipts',
    'scenario_notifications', 'scenario_runs', 
    'system_tasks', 'task_snoozes', 'telegram_chats',
    'telegram_messages', 'voronka_columns'
  ];
  
  console.log("=== Таблицы и количество записей ===\n");
  
  for (const table of tables) {
    try {
      const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
      const count = parseInt(result.rows[0].count);
      const status = count === 0 ? "❌ ПУСТАЯ" : `✅ ${count} записей`;
      console.log(`${table}: ${status}`);
    } catch (err: any) {
      console.log(`${table}: ⚠️ ОШИБКА - ${err.message?.substring(0, 40)}`);
    }
  }
  
  client.release();
  await pool.end();
}

checkAll();
