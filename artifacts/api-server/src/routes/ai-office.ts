import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// GET /api/ai-office/stats — stats for all AI agents
router.get("/stats", async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Manager bot: sessions today + leads created via bot
    const [managerSessions, managerLeads, managerMessages] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM bot_sessions
        WHERE bot_type = 'manager' AND updated_at >= ${todayISO}
      `),
      db.execute(sql`
        SELECT COUNT(*) as count FROM leads
        WHERE created_at >= ${todayISO} AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT SUM(jsonb_array_length(session_data->'messages')) as count
        FROM bot_sessions
        WHERE bot_type = 'manager' AND updated_at >= ${todayISO}
      `),
    ]);

    // Dispatcher bot: dispatches sent today + masters responded
    const [dispatchSent, dispatchResponded, ordersAssigned] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) as count FROM order_dispatches
        WHERE created_at >= ${todayISO}
      `),
      db.execute(sql`
        SELECT COUNT(*) as count FROM order_dispatches
        WHERE created_at >= ${todayISO} AND status IN ('responded','assigned')
      `),
      db.execute(sql`
        SELECT COUNT(*) as count FROM orders
        WHERE assigned_at >= ${todayISO} AND master_id IS NOT NULL AND deleted_at IS NULL
      `),
    ]);

    // Recent manager bot activity (last 5 user messages from sessions)
    const recentManagerActivity = await db.execute(sql`
      SELECT session_data->'messages' as messages, updated_at
      FROM bot_sessions
      WHERE bot_type = 'manager'
      ORDER BY updated_at DESC
      LIMIT 3
    `);

    // Recent dispatcher activity (last 5 dispatches)
    const recentDispatcher = await db.execute(sql`
      SELECT od.created_at, o.service_type, o.city, m.alias as master_alias, od.status
      FROM order_dispatches od
      JOIN orders o ON o.id = od.order_id
      JOIN masters m ON m.id = od.master_id
      ORDER BY od.created_at DESC
      LIMIT 5
    `);

    // Browser agent recent logs
    const recentBrowserLogs = await db.execute(sql`
      SELECT action_type, description, created_at
      FROM browser_agent_logs
      ORDER BY created_at DESC
      LIMIT 10
    `).catch(() => ({ rows: [] }));

    res.json({
      manager: {
        online: !!process.env.MANAGER_BOT_TOKEN,
        todayStats: {
          sessions: Number((managerSessions.rows[0] as any)?.count ?? 0),
          leads: Number((managerLeads.rows[0] as any)?.count ?? 0),
          messages: Number((managerMessages.rows[0] as any)?.count ?? 0),
        },
        recentActivity: recentManagerActivity.rows.map((r: any) => {
          const msgs = Array.isArray(r.messages) ? r.messages : [];
          const lastUser = [...msgs].reverse().find((m: any) => m.role === "user");
          return {
            ts: r.updated_at,
            text: lastUser?.content?.slice(0, 80) ?? "разговор",
          };
        }).filter((r: any) => r.text),
      },
      dispatcher: {
        online: !!process.env.MAX_BOT_TOKEN,
        todayStats: {
          sent: Number((dispatchSent.rows[0] as any)?.count ?? 0),
          responded: Number((dispatchResponded.rows[0] as any)?.count ?? 0),
          assigned: Number((ordersAssigned.rows[0] as any)?.count ?? 0),
        },
        recentActivity: (recentDispatcher.rows as any[]).map(r => ({
          ts: r.created_at,
          text: `${r.service_type}, ${r.city} → ${r.master_alias} (${r.status})`,
        })),
      },
      browser: {
        recentLogs: (recentBrowserLogs.rows as any[]).map(r => ({
          ts: r.created_at,
          type: r.action_type,
          text: r.description,
        })),
      },
    });
  } catch (e) {
    console.error("[ai-office] stats error:", e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
