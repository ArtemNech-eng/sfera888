import { Router } from "express";
import { db } from "@workspace/db";
import { sql, and, eq, isNull, inArray, lt } from "drizzle-orm";
import { mastersTable, ordersTable, masterMessagesTable, orderDispatchesTable } from "@workspace/db";
import { sendMaxMessage } from "../maxBot.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Rate limiter — pause between bulk Max messages to avoid API limits */
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const MSG_DELAY_MS = 400; // 400 ms between each message in bulk sends

/** How long before we re-notify the same master/order/tier */
const DEDUP_HOURS = 12;

/** Returns true if this tier message was already sent within DEDUP_HOURS */
async function wasNotified(
  scenarioId: string, orderId: number, masterId: number, tier: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUP_HOURS * 3600_000).toISOString();
  const rows = await db.execute(sql`
    SELECT 1 FROM scenario_notifications
    WHERE scenario_id = ${scenarioId}
      AND order_id = ${orderId}
      AND master_id = ${masterId}
      AND tier = ${tier}
      AND sent_at > ${cutoff}
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

/** Records that a notification was sent */
async function recordNotification(
  scenarioId: string, orderId: number, masterId: number, tier: string
): Promise<void> {
  await db.execute(sql`
    INSERT INTO scenario_notifications (scenario_id, order_id, master_id, tier)
    VALUES (${scenarioId}, ${orderId}, ${masterId}, ${tier})
  `);
}

function getMskNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

// Telegram-бот удалён — админу шлём только в Max.
async function sendAdminTelegram(_text: string): Promise<void> {
  // no-op
}

async function sendAdminMax(text: string): Promise<void> {
  const userId = process.env["ADMIN_MAX_USER_ID"];
  if (!userId) return;
  try {
    await sendMaxMessage(userId, text);
  } catch (e) {
    console.error("[sendAdminMax]", e);
  }
}

// Send a message to a master via Max AND save it to master_messages so it
// appears in the CRM "master-chat" dialogs section.
async function sendAndSaveMasterMessage(
  masterId: number,
  maxChatId: string | number,
  text: string,
  senderName = "system"
): Promise<void> {
  await sendMaxMessage(maxChatId, text);
  try {
    await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: String(maxChatId),
      text,
      fromMaster: false,
      senderName,
      isRead: true,
    });
  } catch (e) {
    console.error("[sendAndSaveMasterMessage] DB save failed:", e);
  }
}

async function saveScenarioRun(
  scenario: string,
  runType: "manual" | "auto",
  status: "success" | "error",
  summary: unknown,
  errorText: string | null,
  durationMs: number
) {
  await db.execute(sql`
    INSERT INTO scenario_runs (scenario, run_type, status, summary, error_text, duration_ms, created_at)
    VALUES (${scenario}, ${runType}, ${status}, ${JSON.stringify(summary ?? null)}::jsonb, ${errorText}, ${durationMs}, NOW())
  `);
}

async function getScenarioSettings(): Promise<Record<string, boolean>> {
  const rows = await db.execute(sql`SELECT scenario, auto_enabled FROM scenario_settings`);
  const map: Record<string, boolean> = {};
  for (const r of rows.rows as any[]) map[r.scenario] = !!r.auto_enabled;
  return map;
}

async function notifyAdminError(scenario: string, error: string) {
  const admins = await db.execute(sql`
    SELECT max_chat_id FROM masters WHERE max_chat_id IS NOT NULL
    AND deleted_at IS NULL LIMIT 1
  `);
  const adminRow = (admins.rows[0] as any);
  if (adminRow?.max_chat_id) {
    await sendMaxMessage(adminRow.max_chat_id, `⚠️ Сценарий [${scenario}] завершился с ошибкой:\n${error}`);
  }
}

// ─── Scenario 1: Broadcast Open Orders — Send to all at once ──────────────────

// Alert admin if no response after this many minutes
const ADMIN_ALERT_MINUTES = 75;

function computeConversion(m: any): number {
  const received = Number(m.total_leads_received ?? 0);
  if (received === 0) return 0;
  return Number(m.accepted_orders ?? 0) / received;
}

// Assignment score used when masters respond: 50% conversion + 50% rating
// Higher score → master gets priority when multiple masters respond simultaneously
function computeBroadcastScore(m: any): number {
  const conv = computeConversion(m);
  const rating = Math.min(Number(m.rating ?? 3) / 5, 1);
  return 0.5 * conv + 0.5 * rating;
}

function normalizeRu(s: string) {
  return s.toLowerCase().replace(/ё/g, "е");
}

function masterMatchesOrder(m: any, order: any): boolean {
  if (m.city !== order.city) return false;
  if (Number(m.active_orders ?? 0) >= 3) return false;
  if (Number(m.rating ?? 0) < 3.0) return false;
  const stNorm = normalizeRu(order.service_type as string);
  const orderTerms = stNorm.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
  const WILDCARD = ["комплексный ремонт", "комплексная отделка"];
  const specs: string[] = Array.isArray(m.specializations) && m.specializations.length > 0
    ? m.specializations
    : (m.specialization ? [m.specialization] : []);
  if (specs.length === 0) return true;
  const specsNorm = specs.map((s: string) => normalizeRu(s.trim()));
  if (specsNorm.some((sp: string) => WILDCARD.includes(sp))) return true;
  return orderTerms.some((term: string) =>
    specsNorm.some((sp: string) => sp === term || term.includes(sp) || sp.includes(term))
  );
}

/** Returns set of master IDs already notified about this order */
async function getAlreadyNotifiedForOrder(orderId: number): Promise<Set<number>> {
  const rows = await db.execute(sql`
    SELECT DISTINCT master_id FROM scenario_notifications
    WHERE scenario_id = 'broadcast-orders' AND order_id = ${orderId}
  `);
  return new Set((rows.rows as any[]).map(r => Number(r.master_id)));
}

function buildBroadcastMessage(order: any, wave: number = 1): string {
  const areaStr = order.area ? `${Number(order.area).toFixed(0)} м²` : "—";
  const scheduledText = order.scheduled_at
    ? new Date(order.scheduled_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : "по договорённости";
  const location = order.district ? `${order.city}, ${order.district}` : order.city;
  if (wave === 1) {
    return (
      `🔔 Новый заказ!\n\n` +
      `📍 ${location}\n` +
      `🔨 ${order.service_type}\n` +
      `📐 ${areaStr}\n` +
      `📅 ${scheduledText}\n\n` +
      `Откликнитесь в приложении 👍`
    );
  }
  // Wave 2/3: reminder — master not yet assigned, still open for responses
  const waveLabel = wave === 2 ? "напоминание" : "последний шанс";
  return (
    `📋 ${waveLabel === "последний шанс" ? "⏳ Последний шанс" : "Напоминание"} — заказ ещё открыт!\n\n` +
    `📍 ${location}\n` +
    `🔨 ${order.service_type}\n` +
    `📐 ${areaStr}\n` +
    `📅 ${scheduledText}\n` +
    `👤 Мастер ещё не назначен\n\n` +
    `Откликнитесь в приложении 👍`
  );
}

/** Interval between broadcast waves (minutes) */
const WAVE_INTERVAL_MIN = 120; // 2 hours between waves

async function upsertBroadcastRecord(orderId: number, count: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO order_broadcast_waves (order_id, current_wave, wave_1_sent_at, wave_1_count)
    VALUES (${orderId}, 1, NOW(), ${count})
    ON CONFLICT (order_id) DO UPDATE
    SET wave_1_count = order_broadcast_waves.wave_1_count + ${count}, updated_at = NOW()
  `);
}

/** Update order's lastBroadcastAt and broadcastCount so work-board moves it to "Ждут мастера" */
async function updateOrderBroadcastState(orderId: number): Promise<void> {
  await db.execute(sql`
    UPDATE orders
    SET last_broadcast_at = NOW(),
        broadcast_count = COALESCE(broadcast_count, 0) + 1,
        updated_at = NOW()
    WHERE id = ${orderId}
  `);
}

/** Get master IDs that already responded to this order (should not be re-notified) */
async function getRespondedMasterIds(orderId: number): Promise<Set<number>> {
  const rows = await db.execute(sql`
    SELECT DISTINCT master_id FROM order_dispatches
    WHERE order_id = ${orderId} AND status IN ('responded', 'assigned')
  `);
  return new Set((rows.rows as any[]).map(r => Number(r.master_id)));
}

async function runBroadcastOrders() {
  const now = new Date();
  const { performBroadcast } = await import("../lib/broadcastOrder.js");

  // 1. Load open orders with their broadcast state (all waves)
  const ordersResult = await db.execute(sql`
    SELECT o.id, o.lead_id, o.city, o.district, o.service_type, o.area, o.scheduled_at, o.created_at,
           w.wave_1_sent_at, w.wave_1_count,
           w.wave_2_sent_at, w.wave_2_count,
           w.wave_3_sent_at, w.wave_3_count,
           w.admin_alerted_at
    FROM orders o
    LEFT JOIN order_broadcast_waves w ON w.order_id = o.id
    WHERE o.status = 'waiting_master' AND o.deleted_at IS NULL
    ORDER BY o.created_at ASC
  `);

  if ((ordersResult.rows as any[]).length === 0) {
    return { totalOrders: 0, totalSent: 0, newOrders: 0, wave2Sent: 0, wave3Sent: 0, adminAlerts: 0 };
  }

  // Load all active masters for admin alert stats
  const mastersResult = await db.execute(sql`
    SELECT m.id, m.alias, m.city,
           COALESCE(active.cnt, 0) AS active_orders
    FROM masters m
    LEFT JOIN (
      SELECT master_id, COUNT(*) AS cnt
      FROM orders
      WHERE status IN ('master_assigned', 'in_progress') AND deleted_at IS NULL
      GROUP BY master_id
    ) active ON active.master_id = m.id
    WHERE m.status = 'active' AND m.deleted_at IS NULL
  `);
  const allMasters = mastersResult.rows as any[];

  let totalSent = 0;
  let newOrders = 0;
  let wave2Sent = 0;
  let wave3Sent = 0;
  let adminAlerts = 0;

  for (const order of ordersResult.rows as any[]) {
    const wave1Time = order.wave_1_sent_at ? new Date(order.wave_1_sent_at) : null;
    const wave2Time = order.wave_2_sent_at ? new Date(order.wave_2_sent_at) : null;
    const wave3Time = order.wave_3_sent_at ? new Date(order.wave_3_sent_at) : null;
    const elapsedMin1 = wave1Time ? (now.getTime() - wave1Time.getTime()) / 60000 : -1;
    const elapsedMin2 = wave2Time ? (now.getTime() - wave2Time.getTime()) / 60000 : -1;
    const elapsedMin3 = wave3Time ? (now.getTime() - wave3Time.getTime()) / 60000 : -1;

    // ── Wave 1: New order — use performBroadcast (PWA push + Max with "Откликнуться" button) ──
    if (!wave1Time) {
      try {
        const result = await performBroadcast(order.id);
        if (result.ok && result.sent > 0) {
          await upsertBroadcastRecord(order.id, result.sent);
          await updateOrderBroadcastState(order.id);
          // Record notifications for dedup in future waves
          const notified = await getAlreadyNotifiedForOrder(order.id);
          // performBroadcast already created order_dispatches — also record in scenario_notifications
          const dispatches = await db.execute(sql`
            SELECT master_id FROM order_dispatches WHERE order_id = ${order.id} AND status = 'sent'
          `);
          for (const d of dispatches.rows as any[]) {
            if (!notified.has(Number(d.master_id))) {
              await recordNotification("broadcast-orders", order.id, Number(d.master_id), "wave-1");
            }
          }
          totalSent += result.sent;
          newOrders++;
          console.log(`[broadcast-orders] Wave 1: order #${order.id} → ${result.sent} masters`);
        } else {
          console.log(`[broadcast-orders] Wave 1: order #${order.id} skipped: ${result.error ?? "no masters"}`);
        }
      } catch (e: any) {
        console.error(`[broadcast-orders] Wave 1 error for order #${order.id}:`, e?.message ?? e);
      }

    // ── Wave 2: Re-broadcast 2h after wave 1 — force re-send via performBroadcast ───
    } else if (wave1Time && !wave2Time && elapsedMin1 >= WAVE_INTERVAL_MIN) {
      try {
        // Force re-broadcast: deletes old "sent" dispatches, sends fresh notifications
        // Masters who already responded (status='responded') are NOT re-notified
        const result = await performBroadcast(order.id, true);
        if (result.ok && result.sent > 0) {
          await db.execute(sql`
            UPDATE order_broadcast_waves
            SET current_wave = 2, wave_2_sent_at = NOW(), wave_2_count = ${result.sent}, updated_at = NOW()
            WHERE order_id = ${order.id}
          `);
          await updateOrderBroadcastState(order.id);
          // Record notifications for dedup
          const dispatches = await db.execute(sql`
            SELECT master_id FROM order_dispatches WHERE order_id = ${order.id} AND status = 'sent'
          `);
          for (const d of dispatches.rows as any[]) {
            await recordNotification("broadcast-orders", order.id, Number(d.master_id), "wave-2");
          }
          totalSent += result.sent;
          wave2Sent++;
          console.log(`[broadcast-orders] Wave 2: order #${order.id} → ${result.sent} masters`);
        } else {
          // Even if 0 new masters, mark wave 2 as sent so we can proceed to wave 3
          await db.execute(sql`
            UPDATE order_broadcast_waves
            SET current_wave = 2, wave_2_sent_at = NOW(), wave_2_count = 0, updated_at = NOW()
            WHERE order_id = ${order.id}
          `);
          console.log(`[broadcast-orders] Wave 2: order #${order.id} no new masters: ${result.error ?? "all notified"}`);
        }
      } catch (e: any) {
        console.error(`[broadcast-orders] Wave 2 error for order #${order.id}:`, e?.message ?? e);
      }

    // ── Wave 3: Final re-broadcast 2h after wave 2 ─────────────────────────────
    } else if (wave2Time && !wave3Time && elapsedMin2 >= WAVE_INTERVAL_MIN) {
      try {
        const result = await performBroadcast(order.id, true);
        if (result.ok && result.sent > 0) {
          await db.execute(sql`
            UPDATE order_broadcast_waves
            SET current_wave = 3, wave_3_sent_at = NOW(), wave_3_count = ${result.sent}, updated_at = NOW()
            WHERE order_id = ${order.id}
          `);
          await updateOrderBroadcastState(order.id);
          const dispatches = await db.execute(sql`
            SELECT master_id FROM order_dispatches WHERE order_id = ${order.id} AND status = 'sent'
          `);
          for (const d of dispatches.rows as any[]) {
            await recordNotification("broadcast-orders", order.id, Number(d.master_id), "wave-3");
          }
          totalSent += result.sent;
          wave3Sent++;
          console.log(`[broadcast-orders] Wave 3: order #${order.id} → ${result.sent} masters`);
        } else {
          await db.execute(sql`
            UPDATE order_broadcast_waves
            SET current_wave = 3, wave_3_sent_at = NOW(), wave_3_count = 0, updated_at = NOW()
            WHERE order_id = ${order.id}
          `);
          console.log(`[broadcast-orders] Wave 3: order #${order.id} no new masters: ${result.error ?? "all notified"}`);
        }
      } catch (e: any) {
        console.error(`[broadcast-orders] Wave 3 error for order #${order.id}:`, e?.message ?? e);
      }

    // ── Admin alert: 2h after wave 3, still no master ──────────────────────
    } else if (wave3Time && !order.admin_alerted_at && elapsedMin3 >= WAVE_INTERVAL_MIN) {
      const cityMasters = allMasters.filter(m => m.city === order.city).length;
      const freeMasters = allMasters.filter(m =>
        m.city === order.city && Number(m.active_orders ?? 0) < 3
      ).length;
      const w1Count = Number(order.wave_1_count ?? 0);
      const w2Count = Number(order.wave_2_count ?? 0);
      const w3Count = Number(order.wave_3_count ?? 0);
      const location = order.district ? `${order.city}, ${order.district}` : order.city;
      const areaStr = order.area ? `${Number(order.area).toFixed(0)} м²` : "—";
      const scheduledText = order.scheduled_at
        ? new Date(order.scheduled_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
        : "по договорённости";

      await sendAdminMax(
        `⚠️ ЗАКАЗ БЕЗ МАСТЕРА\n\n` +
        `Заявка: #${order.lead_id ?? order.id}\nВид работ: ${order.service_type}\nГород: ${location}\nПлощадь: ${areaStr}\nКогда нужно: ${scheduledText}\n\n` +
        `3 рассылки: ${w1Count} + ${w2Count} + ${w3Count} уведомлений — никто не откликнулся.\n\n` +
        `Мастеров в городе: ${cityMasters}\nСвободных: ${freeMasters}\n\n` +
        `Решение в ИИ Офис → Открытые заказы`
      );
      await db.execute(sql`
        UPDATE order_broadcast_waves SET admin_alerted_at = NOW(), updated_at = NOW()
        WHERE order_id = ${order.id}
      `);
      adminAlerts++;
    }
    // else: waiting for next wave interval — nothing to do
  }

  return { totalOrders: (ordersResult.rows as any[]).length, totalSent, newOrders, wave2Sent, wave3Sent, adminAlerts };
}

// ─── Scenario 2: Payment Reminders ────────────────────────────────────────────

async function runPaymentReminders(runType: "manual" | "auto" = "auto") {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const commissionSettings = await getCommissionSettings();

  const rows = await db.execute(sql`
    SELECT r.order_id, o.lead_id, r.created_at AS receipt_created_at,
           r.service_type, r.district, r.city, r.client_name, r.client_phone,
           r.total_amount,
           m.id AS master_id, m.alias AS master_alias, m.max_chat_id
    FROM receipts r
    JOIN orders o ON o.id = r.order_id
    JOIN masters m ON m.id = r.master_id
    WHERE r.prepayment_submitted_at IS NULL
      AND r.created_at < ${h24ago}
      AND o.status NOT IN ('completed', 'cancelled', 'cancellation_requested', 'waiting_master')
      AND o.deleted_at IS NULL
    ORDER BY r.created_at ASC
  `);

  const warning: any[] = [];
  const critical: any[] = [];
  const superCritical: any[] = [];
  let adminNotified = 0;
  let totalAmount = 0;

  for (const r of rows.rows as any[]) {
    const hoursElapsed = Math.floor((now.getTime() - new Date(r.receipt_created_at).getTime()) / 3600_000);
    const tier = hoursElapsed >= 72 ? "super" : hoursElapsed >= 48 ? "critical" : "warning";
    const displayId = r.lead_id ?? r.order_id;
    const entry = {
      orderId: r.order_id,
      masterId: r.master_id,
      masterAlias: r.master_alias ?? "—",
      maxChatId: r.max_chat_id ?? null,
      clientName: r.client_name ?? "Клиент",
      clientPhone: r.client_phone ?? null,
      city: r.city ?? "",
      district: r.district ?? "",
      serviceType: r.service_type ?? "",
      receiptSentAt: r.receipt_created_at,
      hoursWithoutPayment: hoursElapsed,
      totalAmount: Number(r.total_amount ?? 0),
      commission: calculateCommission(Number(r.total_amount ?? 0), commissionSettings),
      risk: tier,
    };
    totalAmount += entry.totalAmount;

    if (tier === "super") {
      superCritical.push(entry);
      if (runType === "auto") {
        // ── Escalation alert to admin at 72h+ ────────────────────────────────
        const alreadyAlerted = await wasNotified("payment-reminders", r.order_id, r.master_id, "super");
        if (!alreadyAlerted) {
          if (r.max_chat_id) {
            await sendAndSaveMasterMessage(
              r.master_id, r.max_chat_id,
              `${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hoursElapsed} часов.\n\n` +
              `Уточните у клиента, когда он планирует внести предоплату, и сообщите нам.`,
              "💰 Напомнить об оплате"
            );
            await sleep(MSG_DELAY_MS);
          }
          await sendAdminMax(
            `⚠️ ПРЕДОПЛАТА НЕ ОПЛАЧЕНА 72+ ЧАСОВ\n\n` +
            `Заявка: #${displayId}\n` +
            `Вид работ: ${r.service_type}\n` +
            `Город: ${r.city}${r.district ? ", " + r.district : ""}\n` +
            `Мастер: ${r.master_alias}\n` +
            `Клиент: ${r.client_name}\n` +
            `Часов без оплаты: ${hoursElapsed}\n\n` +
            `Решение принимается в ИИ Офис → Напомнить об оплате`
          );
          await recordNotification("payment-reminders", r.order_id, r.master_id, "super");
          adminNotified++;
          await sleep(MSG_DELAY_MS);
        }
      }
    } else {
      if (tier === "critical") critical.push(entry);
      else warning.push(entry);

      // ── Auto-send tiered message to master in auto mode ───────────────────
      if (runType === "auto" && r.max_chat_id) {
        const alreadySent = await wasNotified("payment-reminders", r.order_id, r.master_id, tier);
        if (!alreadySent) {
          const location = r.district || r.city;
          let message: string;
          if (tier === "critical") {
            message =
              `⚠️ ${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hoursElapsed} часов.\n\n` +
              `Пожалуйста ещё раз напомните клиенту про бронь.\n\n` +
              `Если клиент не планирует оплачивать — сообщите нам, мы решим что делать с этим заказом.`;
          } else {
            message =
              `👋 ${r.master_alias}, добрый день!\n\n` +
              `По заявке #${displayId} (${r.service_type}, ${location}) клиент пока не оплатил предоплату.\n\n` +
              `Напомните клиенту про бронь — одно сообщение часто решает вопрос 👍\n\n` +
              `Если клиент отказался — сообщите нам, и мы подготовим новый заказ для вас.`;
          }
          await sendAndSaveMasterMessage(r.master_id, r.max_chat_id, message, "💰 Напомнить об оплате");
          await recordNotification("payment-reminders", r.order_id, r.master_id, tier);
          await sleep(MSG_DELAY_MS);
        }
      }
    }
  }

  return { warning, critical, superCritical, adminNotified, totalAmount };
}

// ─── Scenario 3: Order Diagnostics ────────────────────────────────────────────

async function runOrderDiagnostics(runType: "manual" | "auto" = "auto") {
  const now = new Date();

  const rows = await db.execute(sql`
    SELECT o.id, o.city, o.district, o.service_type,
           o.status, o.updated_at, o.order_amount, o.master_id,
           COALESCE(o.assigned_at, o.created_at) AS ref_time,
           m.alias AS master_alias, m.max_chat_id,
           r.id AS receipt_id, r.created_at AS receipt_created_at,
           r.prepayment_submitted_at, r.total_amount AS receipt_amount
    FROM orders o
    LEFT JOIN masters m ON m.id = o.master_id
    LEFT JOIN LATERAL (
      SELECT id, created_at, prepayment_submitted_at, total_amount
      FROM receipts
      WHERE order_id = o.id
      ORDER BY prepayment_submitted_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) r ON TRUE
    WHERE o.status IN ('master_assigned', 'in_progress')
      AND o.deleted_at IS NULL
    ORDER BY COALESCE(o.assigned_at, o.created_at) ASC NULLS LAST
  `);

  // Criterion 5: low conversion masters (min 3 orders)
  const convRows = await db.execute(sql`
    SELECT master_id,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) AS total
    FROM orders
    WHERE master_id IS NOT NULL AND deleted_at IS NULL
      AND status IN ('completed', 'cancelled', 'cancellation_requested', 'master_assigned', 'in_progress')
    GROUP BY master_id
    HAVING COUNT(*) >= 3
  `);
  const masterConv: Record<number, number> = {};
  for (const r of convRows.rows as any[]) {
    masterConv[Number(r.master_id)] = Math.round(Number(r.completed) * 100 / Number(r.total));
  }

  const critical: any[] = [];
  const warning: any[] = [];
  const ok: any[] = [];

  for (const o of rows.rows as any[]) {
    const refTime = new Date(o.ref_time ?? o.updated_at);
    const daysSinceRef = (now.getTime() - refTime.getTime()) / 86_400_000;
    const hoursSinceRef = daysSinceRef * 24;
    const daysSinceUpdated = (now.getTime() - new Date(o.updated_at).getTime()) / 86_400_000;
    const hasReceipt = !!o.receipt_id;
    const prepaidOk = !!o.prepayment_submitted_at;
    const amount = Number(o.order_amount ?? o.receipt_amount ?? 0);
    const conv = o.master_id ? masterConv[Number(o.master_id)] : undefined;

    let risk = "ok";
    const reasons: { text: string; recommendation: string }[] = [];

    // Criterion 1: master_assigned, no receipt yet (= no real response from master)
    // Skip if master already submitted a receipt — they clearly responded and are working
    if (o.status === "master_assigned" && !hasReceipt) {
      const days = Math.floor(daysSinceRef);
      if (daysSinceRef >= 2) {
        risk = "critical";
        reasons.push({ text: `Мастер назначен ${days} дн. назад — не отправил смету`, recommendation: "Срочно: напишите мастеру или переназначьте" });
      } else if (daysSinceRef >= 1) {
        if (risk !== "critical") risk = "warning";
        reasons.push({ text: `Мастер назначен ${days} дн. назад — не отправил смету`, recommendation: "Напишите мастеру или переназначьте заказ" });
      }
    }

    // Criterion 2: in_progress but no receipt
    if (o.status === "in_progress" && !hasReceipt) {
      const hours = Math.floor(hoursSinceRef);
      if (hoursSinceRef >= 48) {
        risk = "critical";
        reasons.push({ text: `Мастер откликнулся ${hours}ч назад — смета не отправлена. Возможно работает мимо системы`, recommendation: "Срочно: свяжитесь с мастером и клиентом" });
      } else if (hoursSinceRef >= 24) {
        if (risk !== "critical") risk = "warning";
        reasons.push({ text: `Мастер откликнулся ${hours}ч назад — смета не отправлена`, recommendation: "Напомните мастеру отправить смету" });
      }
    }

    // Criterion 3: receipt sent but no prepayment
    if (hasReceipt && !prepaidOk && o.receipt_created_at) {
      const hoursNoPay = (now.getTime() - new Date(o.receipt_created_at).getTime()) / 3_600_000;
      const h = Math.floor(hoursNoPay);
      if (hoursNoPay >= 72) {
        risk = "critical";
        reasons.push({ text: `Предоплата не оплачена > 72ч`, recommendation: "Позвоните клиенту или верните заказ в пул" });
      } else if (hoursNoPay >= 24) {
        if (risk !== "critical") risk = "warning";
        reasons.push({ text: `Предоплата не оплачена ${h}ч`, recommendation: "Попросите мастера напомнить клиенту" });
      }
    }

    // Criterion 4: stalled in_progress
    if (o.status === "in_progress") {
      const days = Math.floor(daysSinceUpdated);
      if (daysSinceUpdated >= 14) {
        risk = "critical";
        reasons.push({ text: `В работе ${days} дней без обновлений`, recommendation: "Срочно: свяжитесь с мастером. Возможно заказ заброшен" });
      } else if (daysSinceUpdated >= 7) {
        if (risk !== "critical") risk = "warning";
        reasons.push({ text: `В работе ${days} дней без обновлений`, recommendation: "Уточните у мастера статус работ" });
      }
    }

    // Criterion 5: low conversion master
    if (conv !== undefined && conv < 30) {
      if (risk !== "critical") risk = "warning";
      reasons.push({ text: `Мастер ${o.master_alias}: конверсия ${conv}% (< 30%)`, recommendation: "Проверьте качество работы мастера" });
    }

    const entry = {
      orderId: o.id,
      masterAlias: o.master_alias ?? "—",
      maxChatId: o.max_chat_id ?? null,
      city: o.city ?? "",
      district: o.district ?? "",
      serviceType: o.service_type ?? "",
      status: o.status,
      daysSinceAssigned: Math.floor(daysSinceRef),
      daysSinceUpdated: Math.floor(daysSinceUpdated),
      hasReceipt,
      prepaidOk,
      amount,
      risk,
      reasons,
    };

    if (risk === "critical") critical.push(entry);
    else if (risk === "warning") warning.push(entry);
    else ok.push(entry);
  }

  return {
    critical, warning, ok,
    totalAmount: {
      critical: critical.reduce((s, e) => s + e.amount, 0),
      warning: warning.reduce((s, e) => s + e.amount, 0),
    },
  };
}

// ─── Scenario 4: Price Analysis ───────────────────────────────────────────────

async function runPriceAnalysis() {
  const rows = await db.execute(sql`
    SELECT o.service_type, o.area, o.city, o.order_amount,
           m.alias AS master_alias, m.id AS master_id
    FROM orders o
    JOIN masters m ON m.id = o.master_id
    WHERE o.status IN ('completed', 'in_progress')
      AND o.order_amount IS NOT NULL
      AND o.area IS NOT NULL AND CAST(o.area AS NUMERIC) > 0
      AND o.deleted_at IS NULL
  `);

  const byService: Record<string, number[]> = {};
  const byMaster: Record<string, { alias: string; services: Record<string, number[]> }> = {};
  const byCity: Record<string, Record<string, number[]>> = {};

  for (const o of rows.rows as any[]) {
    const area = Number(o.area);
    const amount = Number(o.order_amount);
    if (!area || !amount || area <= 0 || amount <= 0) continue;
    const ppm2 = amount / area;
    if (!isFinite(ppm2) || ppm2 <= 0 || ppm2 > 100_000) continue;

    const svc = o.service_type as string;
    if (!byService[svc]) byService[svc] = [];
    byService[svc].push(ppm2);

    const mk = String(o.master_id);
    if (!byMaster[mk]) byMaster[mk] = { alias: o.master_alias, services: {} };
    if (!byMaster[mk].services[svc]) byMaster[mk].services[svc] = [];
    byMaster[mk].services[svc].push(ppm2);

    const city = o.city as string;
    if (!byCity[city]) byCity[city] = {};
    if (!byCity[city][svc]) byCity[city][svc] = [];
    byCity[city][svc].push(ppm2);
  }

  function calcStats(prices: number[]) {
    if (prices.length === 0) return null;
    const sorted = [...prices].sort((a, b) => a - b);
    const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    return {
      min: Math.round(sorted[0]),
      max: Math.round(sorted[sorted.length - 1]),
      avg: Math.round(avg),
      median: Math.round(median),
      count: sorted.length,
    };
  }

  const services = Object.entries(byService)
    .map(([service, prices]) => ({ service, ...calcStats(prices)! }))
    .filter(s => s.count >= 2)
    .sort((a, b) => b.count - a.count);

  const anomalies: { master: string; service: string; avgPrice: number; marketAvg: number; deviation: number; type: "over" | "under" }[] = [];
  for (const { alias, services: svcMap } of Object.values(byMaster)) {
    for (const [svc, prices] of Object.entries(svcMap)) {
      const market = byService[svc];
      if (!market || market.length < 3) continue;
      const marketAvg = market.reduce((s, p) => s + p, 0) / market.length;
      const masterAvg = prices.reduce((s, p) => s + p, 0) / prices.length;
      const dev = (masterAvg - marketAvg) / marketAvg;
      if (Math.abs(dev) >= 0.3) {
        anomalies.push({
          master: alias,
          service: svc,
          avgPrice: Math.round(masterAvg),
          marketAvg: Math.round(marketAvg),
          deviation: Math.round(dev * 100),
          type: dev > 0 ? "over" : "under",
        });
      }
    }
  }

  const allServices = Object.keys(byService).filter(s => (byService[s]?.length ?? 0) >= 2);
  const cityComparison = Object.entries(byCity).map(([city, svcMap]) => {
    const entry: Record<string, any> = { city };
    for (const svc of allServices) {
      const prices = svcMap[svc];
      if (prices && prices.length > 0) {
        entry[svc] = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      }
    }
    return entry;
  });

  return { services, anomalies, cityComparison };
}

// ─── Scenario 5: Orders Without Receipts ──────────────────────────────────────

interface OrderWithoutReceipt {
  orderId: number;
  masterAlias: string;
  maxChatId: string | null;
  city: string;
  district: string;
  serviceType: string;
  assignedAt: string;
  hoursWithoutReceipt: number;
  risk: "critical" | "warning";
  masterPhone: string | null;
}

async function runOrdersWithoutReceipts(runType: "manual" | "auto" = "auto"): Promise<{
  critical: OrderWithoutReceipt[];
  warning: OrderWithoutReceipt[];
  adminNotified: number;
}> {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();

  const rows = await db.execute(sql`
    SELECT o.id, o.lead_id, o.city, o.district, o.service_type,
           COALESCE(o.assigned_at, o.created_at) AS ref_time,
           m.id AS master_id, m.alias AS master_alias, m.max_chat_id, m.phone AS master_phone,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(o.assigned_at, o.created_at))) / 3600 AS hours_without_receipt
    FROM orders o
    JOIN masters m ON m.id = o.master_id
    LEFT JOIN receipts r ON r.order_id = o.id
    WHERE o.status IN ('master_assigned', 'in_progress')
      AND o.deleted_at IS NULL
      AND COALESCE(o.assigned_at, o.created_at) < ${h24ago}
      AND r.id IS NULL
    ORDER BY COALESCE(o.assigned_at, o.created_at) ASC
  `);

  const critical: OrderWithoutReceipt[] = [];
  const warning: OrderWithoutReceipt[] = [];
  let adminNotified = 0;

  for (const r of rows.rows as any[]) {
    const hours = Math.floor(Number(r.hours_without_receipt));
    const tier = hours >= 72 ? "critical-72" : hours >= 48 ? "critical" : "warning";
    const displayId = r.lead_id ?? r.id;
    const entry: OrderWithoutReceipt = {
      orderId: r.id,
      masterAlias: r.master_alias ?? "—",
      maxChatId: r.max_chat_id ?? null,
      city: r.city ?? "",
      district: r.district ?? "",
      serviceType: r.service_type ?? "",
      assignedAt: r.ref_time,
      hoursWithoutReceipt: hours,
      risk: hours >= 48 ? "critical" : "warning",
      masterPhone: r.master_phone ?? null,
    };

    if (hours >= 48) critical.push(entry);
    else warning.push(entry);

    if (runType === "auto") {
      const location = r.district || r.city;

      if (hours >= 96) {
        // ── Critical Max alert at 96h+ — admin decides manually ───────────────
        const alreadyAlerted96 = await wasNotified("orders-without-receipts", r.id, r.master_id, "alert-96");
        if (!alreadyAlerted96) {
          if (r.max_chat_id) {
            await sendAndSaveMasterMessage(
              r.master_id, r.max_chat_id,
              `⚠️ ${r.master_alias}, по заявке #${displayId} (${r.service_type}, ${location}) смета не отправлена уже ${hours} часов.\n\n` +
              `Если вы не можете взять этот заказ — пожалуйста сообщите нам.\n\nВопрос передан руководителю.`,
              "📄 Заказы без сметы"
            );
            await sleep(MSG_DELAY_MS);
          }
          await sendAdminMax(
            `🚨 ЗАКАЗ БЕЗ СМЕТЫ 96+ ЧАСОВ\n\n` +
            `Заявка: #${displayId}\nВид работ: ${r.service_type}\nГород: ${r.city}, ${r.district ?? "—"}\nМастер: ${r.master_alias}\nЧасов без сметы: ${hours}\n\n` +
            `Требуется ручное решение: ИИ Офис → Заказы без сметы`
          );
          await recordNotification("orders-without-receipts", r.id, r.master_id, "alert-96");
          adminNotified++;
          await sleep(MSG_DELAY_MS);
        }
      } else if (hours >= 72) {
        // ── Max alert at 72h+ + escalating message to master ─────────────────
        const alreadySentAlert = await wasNotified("orders-without-receipts", r.id, r.master_id, "critical-72");
        if (!alreadySentAlert) {
          if (r.max_chat_id) {
            await sendAndSaveMasterMessage(
              r.master_id, r.max_chat_id,
              `⚠️ ${r.master_alias}, по заявке #${displayId} (${r.service_type}, ${location}) смета не отправлена уже ${hours} часов.\n\nОтправьте смету или сообщите нам что не можете взять заказ.\n\nВопрос по заказу передан руководителю.`,
              "📄 Заказы без сметы"
            );
            await sleep(MSG_DELAY_MS);
          }
          await sendAdminMax(
            `⚠️ ЗАКАЗ БЕЗ СМЕТЫ 72+ ЧАСОВ\n\n` +
            `Заявка: #${displayId}\nВид работ: ${r.service_type}\nГород: ${r.city}, ${r.district ?? "—"}\nМастер: ${r.master_alias}\nЧасов без сметы: ${hours}\n\n` +
            `Решение принимается в ИИ Офис → Заказы без сметы`
          );
          await recordNotification("orders-without-receipts", r.id, r.master_id, "critical-72");
          adminNotified++;
          await sleep(MSG_DELAY_MS);
        }
      } else {
        // Send tiered message to master (warning/critical) with dedup
        const alreadySent = await wasNotified("orders-without-receipts", r.id, r.master_id, tier);
        if (!alreadySent && r.max_chat_id) {
          let message: string;
          if (tier === "critical") {
            message =
              `⚠️ ${r.master_alias}, по заявке #${displayId} (${r.service_type}, ${location}) смета не отправлена уже ${hours} часов.\n\n` +
              `Без сметы через приложение заказ не считается активным.\n\n` +
              `Если вы уже договорились с клиентом — отправьте смету через приложение, чтобы клиент оплатил предоплату.\n\n` +
              `Если не можете взять этот заказ — напишите нам, мы решим вопрос.\n\nОжидаем ответ в течение 3 часов.`;
          } else {
            message =
              `👋 ${r.master_alias}, добрый день!\n\n` +
              `По заявке #${displayId} (${r.service_type}, ${location}) вы ещё не отправили смету клиенту.\n\n` +
              `Напоминаю: смета составляется в приложении и отправляется клиенту ссылкой. Это занимает 2 минуты.\n\n` +
              `Без сметы клиент не сможет оплатить предоплату, а вы не получите новые заказы.\n\nОтправьте смету сегодня 👍`;
          }
          await sendAndSaveMasterMessage(r.master_id, r.max_chat_id, message, "📄 Заказы без сметы");
          await recordNotification("orders-without-receipts", r.id, r.master_id, tier);
          await sleep(MSG_DELAY_MS);
        }
      }
    }
  }

  return { critical, warning, adminNotified };
}

// ─── Public runner (used by cron in index.ts) ──────────────────────────────────

export async function runTemplateScenario(
  scenarioId: string,
  runType: "manual" | "auto" = "manual"
): Promise<any> {
  const start = Date.now();
  try {
    let result: any;
    if (scenarioId === "broadcast-orders") result = await runBroadcastOrders();
    else if (scenarioId === "payment-reminders") result = await runPaymentReminders(runType);
    else if (scenarioId === "order-diagnostics") result = await runOrderDiagnostics(runType);
    else if (scenarioId === "price-analysis") result = await runPriceAnalysis();
    else if (scenarioId === "orders-without-receipts") result = await runOrdersWithoutReceipts(runType);
    else throw new Error(`Unknown scenario: ${scenarioId}`);
    await saveScenarioRun(scenarioId, runType, "success", result, null, Date.now() - start);
    return result;
  } catch (e) {
    await saveScenarioRun(scenarioId, runType, "error", null, String(e), Date.now() - start);
    notifyAdminError(scenarioId, String(e)).catch(() => {});
    throw e;
  }
}

// ─── Scenario metadata ────────────────────────────────────────────────────────

const SCENARIO_META = [
  {
    id: "broadcast-orders",
    title: "📋 Разослать открытые заказы",
    description: "Находит заказы со статусом «ищем мастера», подбирает подходящих мастеров по городу и специализации и отправляет им уведомление в Max.",
    autoInterval: "каждые 15 мин",
  },
  {
    id: "payment-reminders",
    title: "💰 Напомнить об оплате",
    description: "Находит сметы без предоплаты более 24ч. Отправляет напоминания мастерам в Max (3 шаблона по срокам). При 72ч+ уведомляет администратора в Max. Решения принимает только администратор.",
    autoInterval: "каждые 6 часов",
  },
  {
    id: "order-diagnostics",
    title: "🔍 Диагностика заказов",
    description: "Анализирует активные заказы на риски: нет отклика от мастера, предоплата задерживается, заказ завис. Присваивает уровни 🔴 Критично / 🟡 Внимание / 🟢 Норма.",
    autoInterval: "ежедневно в 9:00",
  },
  {
    id: "price-analysis",
    title: "📊 Анализ рыночных цен",
    description: "Собирает данные смет и заказов, считает среднюю/медианную цену за м² по видам работ и городам, выявляет аномалии у мастеров.",
    autoInterval: "еженедельно пн 8:00",
  },
  {
    id: "orders-without-receipts",
    title: "📄 Заказы без сметы",
    description: "Находит заказы где мастер назначен, но смета не создана более 24 часов. Отправляет напоминания мастерам в Max. При 72ч+ уведомляет администратора в Telegram.",
    autoInterval: "каждые 6 часов",
  },
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/ai-office/template-scenarios — list all with last run + settings
router.get("/template-scenarios", async (_req, res) => {
  try {
    const settings = await getScenarioSettings();

    const lastRuns = await db.execute(sql`
      SELECT DISTINCT ON (scenario) scenario, status, summary, error_text, duration_ms, created_at, run_type
      FROM scenario_runs
      ORDER BY scenario, created_at DESC
    `);
    const lastRunMap: Record<string, any> = {};
    for (const r of lastRuns.rows as any[]) lastRunMap[r.scenario] = r;

    const result = SCENARIO_META.map(s => ({
      ...s,
      autoEnabled: settings[s.id] ?? false,
      lastRun: lastRunMap[s.id] ?? null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/:id/run — manual run
router.post("/template-scenarios/:id/run", async (req, res) => {
  const { id } = req.params;
  if (!SCENARIO_META.find(s => s.id === id)) return res.status(404).json({ error: "Not found" });
  try {
    const result = await runTemplateScenario(id, "manual");
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/:id/logs — run history
router.get("/template-scenarios/:id/logs", async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await db.execute(sql`
      SELECT id, run_type, status, summary, error_text, duration_ms, created_at
      FROM scenario_runs
      WHERE scenario = ${id}
      ORDER BY created_at DESC
      LIMIT 30
    `);
    res.json(logs.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PUT /api/ai-office/template-scenarios/:id/toggle — toggle auto
router.put("/template-scenarios/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body as { enabled: boolean };
  if (!SCENARIO_META.find(s => s.id === id)) return res.status(404).json({ error: "Not found" });
  try {
    await db.execute(sql`
      INSERT INTO scenario_settings (scenario, auto_enabled, updated_at)
      VALUES (${id}, ${enabled}, NOW())
      ON CONFLICT (scenario) DO UPDATE SET auto_enabled = EXCLUDED.auto_enabled, updated_at = NOW()
    `);
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Broadcast-orders: live panel data ────────────────────────────────────────

// GET /api/ai-office/template-scenarios/broadcast-orders/live
router.get("/template-scenarios/broadcast-orders/live", async (_req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // All open orders with wave state
    const openRows = await db.execute(sql`
      SELECT o.id, o.city, o.district, o.service_type, o.area, o.scheduled_at, o.created_at,
             w.current_wave, w.wave_1_sent_at, w.wave_2_sent_at,
             w.wave_3_sent_at, w.wave_4_sent_at, w.admin_alerted_at,
             w.wave_1_count, w.wave_2_count, w.wave_3_count, w.wave_4_count,
             (
               SELECT COUNT(*) FROM scenario_notifications sn
               WHERE sn.scenario_id = 'broadcast-orders' AND sn.order_id = o.id
             ) AS total_notified,
             (
               SELECT COUNT(*) FROM order_dispatches od
               WHERE od.order_id = o.id AND od.status IN ('responded', 'assigned')
             ) AS total_responded
      FROM orders o
      LEFT JOIN order_broadcast_waves w ON w.order_id = o.id
      WHERE o.status = 'waiting_master' AND o.deleted_at IS NULL
      ORDER BY o.created_at ASC
    `);

    // Assigned today count
    const assignedToday = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM orders
      WHERE status IN ('master_assigned', 'in_progress', 'completed')
        AND assigned_at >= ${todayStart.toISOString()}
        AND deleted_at IS NULL
    `);

    const orders = (openRows.rows as any[]).map(r => {
      const wave1Time = r.wave_1_sent_at ? new Date(r.wave_1_sent_at) : null;
      const elapsedMin = wave1Time ? Math.floor((now.getTime() - wave1Time.getTime()) / 60000) : 0;
      const totalNotified = Number(r.total_notified ?? 0);
      const totalResponded = Number(r.total_responded ?? 0);

      let currentWave = r.current_wave ?? null;
      let isStuck = false;
      if (wave1Time && elapsedMin >= 75 && r.admin_alerted_at) isStuck = true;

      return {
        orderId: r.id,
        city: r.city,
        district: r.district ?? "—",
        serviceType: r.service_type,
        area: r.area ? Number(r.area).toFixed(0) : "—",
        scheduledAt: r.scheduled_at ?? null,
        createdAt: r.created_at,
        currentWave,
        wave1SentAt: r.wave_1_sent_at ?? null,
        wave2SentAt: r.wave_2_sent_at ?? null,
        wave3SentAt: r.wave_3_sent_at ?? null,
        wave4SentAt: r.wave_4_sent_at ?? null,
        adminAlerted: !!r.admin_alerted_at,
        wave1Count: r.wave_1_count ?? 0,
        wave2Count: r.wave_2_count ?? 0,
        wave3Count: r.wave_3_count ?? 0,
        wave4Count: r.wave_4_count ?? 0,
        totalNotified,
        totalResponded,
        elapsedMin,
        isStuck,
      };
    });

    const openCount = orders.length;
    const assignedTodayCount = Number((assignedToday.rows[0] as any)?.cnt ?? 0);
    const awaitingCount = orders.filter(o => o.currentWave && !o.isStuck).length;
    const stuckCount = orders.filter(o => o.elapsedMin >= 60 && !o.adminAlerted).length;

    res.json({
      orders,
      stats: {
        openCount,
        assignedTodayCount,
        awaitingCount,
        stuckCount,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/broadcast-orders/:orderId/details — timeline
router.get("/template-scenarios/broadcast-orders/:orderId/details", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    const waveRow = await db.execute(sql`
      SELECT * FROM order_broadcast_waves WHERE order_id = ${orderId}
    `);

    const notifications = await db.execute(sql`
      SELECT sn.master_id, sn.tier, sn.sent_at, m.alias AS master_alias
      FROM scenario_notifications sn
      JOIN masters m ON m.id = sn.master_id
      WHERE sn.scenario_id = 'broadcast-orders' AND sn.order_id = ${orderId}
      ORDER BY sn.sent_at ASC
    `);

    const dispatches = await db.execute(sql`
      SELECT od.master_id, od.status, od.created_at, od.responded_at, m.alias AS master_alias
      FROM order_dispatches od
      JOIN masters m ON m.id = od.master_id
      WHERE od.order_id = ${orderId}
      ORDER BY od.created_at ASC
    `);

    res.json({
      wave: waveRow.rows[0] ?? null,
      notifications: notifications.rows,
      dispatches: dispatches.rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/broadcast-orders/:orderId/resend — force resend all waves
router.post("/template-scenarios/broadcast-orders/:orderId/resend", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    // Clear all wave data and dedup records
    await db.execute(sql`DELETE FROM order_broadcast_waves WHERE order_id = ${orderId}`);
    await db.execute(sql`
      DELETE FROM scenario_notifications
      WHERE scenario_id = 'broadcast-orders' AND order_id = ${orderId}
    `);

    res.json({ ok: true, message: "Волны сброшены. Заказ будет разослан заново на следующем запуске." });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/broadcast-orders/:orderId/cancel — cancel order
router.post("/template-scenarios/broadcast-orders/:orderId/cancel", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    await db.execute(sql`
      UPDATE orders
      SET status = 'cancelled', cancel_reason = 'Отменён вручную из ИИ Офиса', updated_at = NOW()
      WHERE id = ${orderId} AND status = 'waiting_master'
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Payment-reminders actions ────────────────────────────────────────────────

// POST /api/ai-office/template-scenarios/payment-reminders/send-all
// Sends tiered Max messages to ALL masters with pending payments (admin decision)
router.post("/template-scenarios/payment-reminders/send-all", async (req, res) => {
  try {
    const now = new Date();
    const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const rows = await db.execute(sql`
      SELECT r.order_id, o.lead_id, r.created_at AS receipt_created_at,
             r.service_type, r.district, r.city,
             EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 AS hours,
             m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      JOIN masters m ON m.id = r.master_id
      WHERE r.prepayment_submitted_at IS NULL
        AND r.created_at < ${h24ago}
        AND o.status NOT IN ('completed', 'cancelled', 'cancellation_requested', 'waiting_master')
        AND o.deleted_at IS NULL
    `);

    let sent = 0;
    let skipped = 0;
    for (const r of rows.rows as any[]) {
      if (!r.max_chat_id || !r.master_id) continue;
      const hours = Math.floor(Number(r.hours));
      const tier = hours >= 72 ? "super" : hours >= 48 ? "critical" : "warning";
      const alreadySent = await wasNotified("payment-reminders", r.order_id, r.master_id, tier);
      if (alreadySent) { skipped++; continue; }
      const location = r.district || r.city;
      const displayId = r.lead_id ?? r.order_id;
      let msg: string;
      if (hours >= 72) {
        msg = `${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hours} часов.\n\nУточните у клиента, когда он планирует внести предоплату, и сообщите нам.`;
      } else if (hours >= 48) {
        msg = `⚠️ ${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hours} часов.\n\nПожалуйста ещё раз напомните клиенту про бронь.\n\nЕсли клиент не планирует оплачивать — сообщите нам, мы решим что делать с этим заказом.`;
      } else {
        msg = `👋 ${r.master_alias}, добрый день!\n\nПо заявке #${displayId} (${r.service_type}, ${location}) клиент пока не оплатил предоплату.\n\nНапомните клиенту про бронь — одно сообщение часто решает вопрос 👍\n\nЕсли клиент отказался — сообщите нам, и мы подготовим новый заказ для вас.`;
      }
      await sendAndSaveMasterMessage(r.master_id, r.max_chat_id, msg, "💰 Напомнить об оплате").catch(() => {});
      await recordNotification("payment-reminders", r.order_id, r.master_id, tier);
      sent++;
      await sleep(MSG_DELAY_MS);
    }
    res.json({ ok: true, sent, skipped });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/payment-reminders/live
router.get("/template-scenarios/payment-reminders/live", async (_req, res) => {
  try {
    const now = new Date();
    const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const commissionSettings = await getCommissionSettings();
    const rows = await db.execute(sql`
      SELECT r.order_id, o.lead_id, r.created_at AS receipt_created_at,
             r.service_type, r.district, r.city, r.client_name, r.client_phone,
             r.total_amount,
             m.alias AS master_alias, m.max_chat_id
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      JOIN masters m ON m.id = r.master_id
      WHERE r.prepayment_submitted_at IS NULL
        AND r.created_at < ${h24ago}
        AND o.status NOT IN ('completed', 'cancelled', 'cancellation_requested', 'waiting_master')
        AND o.deleted_at IS NULL
      ORDER BY r.created_at ASC
    `);

    const items = (rows.rows as any[]).map(r => {
      const h = Math.floor((now.getTime() - new Date(r.receipt_created_at).getTime()) / 3600_000);
      return {
        orderId: r.order_id,
        leadId: r.lead_id ?? null,
        masterAlias: r.master_alias ?? "—",
        maxChatId: r.max_chat_id ?? null,
        clientName: r.client_name ?? "Клиент",
        clientPhone: r.client_phone ?? null,
        city: r.city ?? "",
        district: r.district ?? "",
        serviceType: r.service_type ?? "",
        receiptSentAt: r.receipt_created_at,
        hoursWithoutPayment: h,
        totalAmount: Number(r.total_amount ?? 0),
        commission: calculateCommission(Number(r.total_amount ?? 0), commissionSettings),
        risk: h >= 72 ? "super" : h >= 48 ? "critical" : "warning",
      };
    });

    const warning = items.filter(i => i.risk === "warning");
    const critical = items.filter(i => i.risk === "critical");
    const superCritical = items.filter(i => i.risk === "super");
    const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);
    res.json({ warning, critical, superCritical, totalAmount });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/payment-reminders/:orderId/message-master
router.post("/template-scenarios/payment-reminders/:orderId/message-master", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT r.order_id, o.lead_id, r.service_type, r.district, r.city,
             EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 AS hours,
             m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM receipts r
      JOIN orders o ON o.id = r.order_id
      JOIN masters m ON m.id = r.master_id
      WHERE r.order_id = ${orderId} AND r.prepayment_submitted_at IS NULL
    `);
    const r = rows.rows[0] as any;
    if (!r) return res.status(404).json({ error: "Заказ или смета не найдены" });
    if (!r.max_chat_id) return res.status(400).json({ error: "У мастера нет Max-чата" });

    const hours = Math.floor(Number(r.hours));
    const location = r.district || r.city;
    const displayId = r.lead_id ?? r.order_id;
    let message: string;

    if (hours >= 72) {
      message =
        `${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hours} часов.\n\n` +
        `Уточните у клиента, когда он планирует внести предоплату, и сообщите нам.`;
    } else if (hours >= 48) {
      message =
        `⚠️ ${r.master_alias}, по заявке #${displayId} предоплата не поступила уже ${hours} часов.\n\n` +
        `Пожалуйста ещё раз напомните клиенту про бронь.\n\n` +
        `Если клиент не планирует оплачивать — сообщите нам, мы решим что делать с этим заказом.`;
    } else {
      message =
        `👋 ${r.master_alias}, добрый день!\n\n` +
        `По заявке #${displayId} (${r.service_type}, ${location}) клиент пока не оплатил предоплату.\n\n` +
        `Напомните клиенту про бронь — одно сообщение часто решает вопрос 👍\n\n` +
        `Если клиент отказался — сообщите нам, и мы подготовим новый заказ для вас.`;
    }

    await sendAndSaveMasterMessage(r.master_id, r.max_chat_id, message, "💰 Напомнить об оплате");
    res.json({ ok: true, hours, template: hours >= 72 ? "72h" : hours >= 48 ? "48h" : "24h" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/payment-reminders/:orderId/return-to-pool
router.post("/template-scenarios/payment-reminders/:orderId/return-to-pool", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.service_type, m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    const displayId = o.lead_id ?? o.id;

    await db.execute(sql`
      UPDATE orders
      SET status = 'waiting_master', master_id = NULL, assigned_at = NULL, updated_at = NOW()
      WHERE id = ${orderId} AND status NOT IN ('completed', 'cancelled')
    `);

    if (o.max_chat_id && o.master_id) {
      await sendAndSaveMasterMessage(
        o.master_id, o.max_chat_id,
        `Заявка #${displayId} возвращена в пул — клиент не оплатил предоплату.\n\n` +
        `Из 10 клиентов 8 оплачивают без проблем — те кто не платит, обычно проблемные.\n\n` +
        `Готовим для вас новый заказ 👍`,
        "💰 Напомнить об оплате"
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/payment-reminders/:orderId/cancel
router.post("/template-scenarios/payment-reminders/:orderId/cancel", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    const displayId = o.lead_id ?? o.id;

    await db.execute(sql`
      UPDATE orders SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${orderId} AND status NOT IN ('completed', 'cancelled')
    `);

    if (o.max_chat_id && o.master_id) {
      await sendAndSaveMasterMessage(
        o.master_id, o.max_chat_id,
        `Заявка #${displayId} отменена.\nПричина: клиент не оплатил предоплату.`,
        "💰 Напомнить об оплате"
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Orders-without-receipts actions ─────────────────────────────────────────

// POST /api/ai-office/template-scenarios/orders-without-receipts/:orderId/message-master
router.post("/template-scenarios/orders-without-receipts/:orderId/message-master", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.service_type, o.district, o.city,
             COALESCE(o.assigned_at, o.created_at) AS ref_time,
             EXTRACT(EPOCH FROM (NOW() - COALESCE(o.assigned_at, o.created_at))) / 3600 AS hours,
             m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    if (!o.max_chat_id) return res.status(400).json({ error: "У мастера нет Max-чата" });

    const hours = Math.floor(Number(o.hours));
    const location = o.district || o.city;
    const displayId = o.lead_id ?? o.id;
    let message: string;

    if (hours >= 72) {
      message =
        `⚠️ ${o.master_alias}, ` +
        `по заявке #${displayId} (${o.service_type}, ${location}) ` +
        `смета не отправлена уже ${hours} часов.\n\n` +
        `Отправьте смету или сообщите нам что не можете взять заказ.\n\n` +
        `Вопрос по заказу передан руководителю.`;
    } else if (hours >= 48) {
      message =
        `⚠️ ${o.master_alias}, ` +
        `по заявке #${displayId} (${o.service_type}, ${location}) ` +
        `смета не отправлена уже ${hours} часов.\n\n` +
        `Без сметы через приложение заказ не считается активным.\n\n` +
        `Если вы уже договорились с клиентом — отправьте смету через приложение, чтобы клиент оплатил предоплату.\n\n` +
        `Если не можете взять этот заказ — напишите нам, мы решим вопрос.\n\n` +
        `Ожидаем ответ в течение 3 часов.`;
    } else {
      message =
        `👋 ${o.master_alias}, добрый день!\n\n` +
        `По заявке #${displayId} (${o.service_type}, ${location}) ` +
        `вы ещё не отправили смету клиенту.\n\n` +
        `Напоминаю: смета составляется в приложении и отправляется клиенту ссылкой. Это занимает 2 минуты.\n\n` +
        `Без сметы клиент не сможет оплатить предоплату, а вы не получите новые заказы.\n\n` +
        `Отправьте смету сегодня 👍`;
    }

    await sendAndSaveMasterMessage(o.master_id, o.max_chat_id, message, "📄 Заказы без сметы");
    res.json({ ok: true, hours, template: hours >= 72 ? "72h" : hours >= 48 ? "48h" : "24h" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/orders-without-receipts/:orderId/reassign
router.post("/template-scenarios/orders-without-receipts/:orderId/reassign", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.service_type, m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    const displayId = o.lead_id ?? o.id;

    await db.execute(sql`
      UPDATE orders
      SET status = 'waiting_master', master_id = NULL, assigned_at = NULL, updated_at = NOW()
      WHERE id = ${orderId} AND status NOT IN ('completed', 'cancelled')
    `);

    // Block the reassigned master from getting this order again
    if (o.master_id) {
      const chatIdForBlock = o.max_chat_id ?? `pwa_${o.master_id}`;
      await db.insert(orderDispatchesTable)
        .values({
          orderId,
          masterId: o.master_id,
          telegramChatId: chatIdForBlock,
          status: "rejected",
          rejectionReason: "Мастер переназначен оператором (нет сметы)",
        })
        .onConflictDoNothing();
    }

    if (o.max_chat_id && o.master_id) {
      await sendAndSaveMasterMessage(
        o.master_id, o.max_chat_id,
        `Заявка #${displayId} переназначена другому мастеру.\n` +
        `Причина: смета не была отправлена в срок.\n` +
        `Это повлияло на вашу конверсию.`,
        "📄 Заказы без сметы"
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/orders-without-receipts/:orderId/cancel
router.post("/template-scenarios/orders-without-receipts/:orderId/cancel", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.service_type, m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    const displayId = o.lead_id ?? o.id;

    await db.execute(sql`
      UPDATE orders SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${orderId} AND status NOT IN ('completed', 'cancelled')
    `);

    if (o.max_chat_id && o.master_id) {
      await sendAndSaveMasterMessage(
        o.master_id, o.max_chat_id,
        `Заявка #${displayId} отменена.`,
        "📄 Заказы без сметы"
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/orders-without-receipts/send-all
// Sends tiered Max messages to ALL masters without receipts (admin decision)
router.post("/template-scenarios/orders-without-receipts/send-all", async (req, res) => {
  try {
    const h24ago = new Date(Date.now() - 24 * 3600_000).toISOString();
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.city, o.district, o.service_type,
             COALESCE(o.assigned_at, o.created_at) AS ref_time,
             m.id AS master_id, m.alias AS master_alias, m.max_chat_id,
             EXTRACT(EPOCH FROM (NOW() - COALESCE(o.assigned_at, o.created_at))) / 3600 AS hours_without_receipt
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.status IN ('master_assigned', 'in_progress')
        AND o.deleted_at IS NULL
        AND COALESCE(o.assigned_at, o.created_at) < ${h24ago}
        AND r.id IS NULL
    `);

    let sent = 0;
    let skipped = 0;
    for (const r of rows.rows as any[]) {
      if (!r.max_chat_id || !r.master_id) continue;
      const hours = Math.floor(Number(r.hours_without_receipt));
      const tier = hours >= 72 ? "critical-72" : hours >= 48 ? "critical" : "warning";
      const alreadySent = await wasNotified("orders-without-receipts", r.id, r.master_id, tier);
      if (alreadySent) { skipped++; continue; }
      const location = r.district || r.city;
      const displayId = r.lead_id ?? r.id;
      let msg: string;
      if (hours >= 72) {
        msg = `⚠️ ${r.master_alias}, по заявке #${displayId} (${r.service_type}, ${location}) смета не отправлена уже ${hours} часов.\n\nОтправьте смету или сообщите нам что не можете взять заказ.\n\nВопрос по заказу передан руководителю.`;
      } else if (hours >= 48) {
        msg = `⚠️ ${r.master_alias}, по заявке #${displayId} (${r.service_type}, ${location}) смета не отправлена уже ${hours} часов.\n\nБез сметы через приложение заказ не считается активным.\n\nЕсли вы уже договорились с клиентом — отправьте смету через приложение, чтобы клиент оплатил предоплату.\n\nЕсли не можете взять этот заказ — напишите нам, мы решим вопрос.\n\nОжидаем ответ в течение 3 часов.`;
      } else {
        msg = `👋 ${r.master_alias}, добрый день!\n\nПо заявке #${displayId} (${r.service_type}, ${location}) вы ещё не отправили смету клиенту.\n\nНапоминаю: смета составляется в приложении и отправляется клиенту ссылкой. Это занимает 2 минуты.\n\nБез сметы клиент не сможет оплатить предоплату, а вы не получите новые заказы.\n\nОтправьте смету сегодня 👍`;
      }
      await sendAndSaveMasterMessage(r.master_id, r.max_chat_id, msg, "📄 Заказы без сметы").catch(() => {});
      await recordNotification("orders-without-receipts", r.id, r.master_id, tier);
      sent++;
      await sleep(MSG_DELAY_MS);
    }
    res.json({ ok: true, sent, skipped });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/orders-without-receipts/live — current live list
router.get("/template-scenarios/orders-without-receipts/live", async (_req, res) => {
  try {
    const h24ago = new Date(Date.now() - 24 * 3600_000).toISOString();
    const rows = await db.execute(sql`
      SELECT o.id, o.city, o.district, o.service_type,
             COALESCE(o.assigned_at, o.created_at) AS ref_time,
             m.alias AS master_alias, m.max_chat_id, m.phone AS master_phone,
             EXTRACT(EPOCH FROM (NOW() - COALESCE(o.assigned_at, o.created_at))) / 3600 AS hours_without_receipt
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.status IN ('master_assigned', 'in_progress')
        AND o.deleted_at IS NULL
        AND COALESCE(o.assigned_at, o.created_at) < ${h24ago}
        AND r.id IS NULL
      ORDER BY COALESCE(o.assigned_at, o.created_at) ASC
    `);

    const items = (rows.rows as any[]).map(r => ({
      orderId: r.id,
      masterAlias: r.master_alias ?? "—",
      maxChatId: r.max_chat_id ?? null,
      city: r.city ?? "",
      district: r.district ?? "",
      serviceType: r.service_type ?? "",
      assignedAt: r.ref_time,
      hoursWithoutReceipt: Math.floor(Number(r.hours_without_receipt)),
      risk: Number(r.hours_without_receipt) >= 48 ? "critical" : "warning",
      masterPhone: r.master_phone ?? null,
    }));

    res.json({ critical: items.filter(i => i.risk === "critical"), warning: items.filter(i => i.risk === "warning") });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/order-diagnostics/live
router.get("/template-scenarios/order-diagnostics/live", async (_req, res) => {
  try {
    const data = await runOrderDiagnostics("manual");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/order-diagnostics/:orderId/message-master
router.post("/template-scenarios/order-diagnostics/:orderId/message-master", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.lead_id, o.service_type, o.district, o.city, o.status,
             COALESCE(o.assigned_at, o.created_at) AS ref_time,
             EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 86400 AS days_no_update,
             r.id AS receipt_id, r.created_at AS receipt_created_at,
             r.prepayment_submitted_at,
             m.id AS master_id, m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      LEFT JOIN LATERAL (
        SELECT id, created_at, prepayment_submitted_at
        FROM receipts
        WHERE order_id = o.id
        ORDER BY prepayment_submitted_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) r ON TRUE
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Заказ не найден" });
    if (!o.max_chat_id) return res.status(400).json({ error: "У мастера нет Max-чата" });

    const location = o.district || o.city;
    const hasReceipt = !!o.receipt_id;
    const prepaidOk = !!o.prepayment_submitted_at;
    const refTime = new Date(o.ref_time);
    const hoursRef = (Date.now() - refTime.getTime()) / 3_600_000;
    const daysUpdated = Math.floor(Number(o.days_no_update));
    const displayId = o.lead_id ?? o.id;

    let msg: string;
    if (o.status === "master_assigned") {
      msg = `${o.master_alias}, вы назначены на заявку #${displayId} (${o.service_type}, ${location}).\n\nПожалуйста подтвердите что готовы взяться за заказ и свяжитесь с клиентом.`;
    } else if (o.status === "in_progress" && !hasReceipt) {
      msg = `${o.master_alias}, по заявке #${displayId} (${o.service_type}, ${location}) смета ещё не отправлена клиенту.\n\nПожалуйста отправьте смету через приложение — без неё клиент не сможет внести предоплату.`;
    } else if (hasReceipt && !prepaidOk) {
      const h = Math.floor(hoursRef);
      msg = `${o.master_alias}, по заявке #${displayId} (${o.service_type}, ${location}) предоплата не поступила уже ${h} часов.\n\nУточните у клиента, когда он планирует внести предоплату, и сообщите нам.`;
    } else {
      msg = `${o.master_alias}, по заявке #${displayId} (${o.service_type}, ${location}) нет обновлений уже ${daysUpdated} дн.\n\nПодскажите, что со статусом работ?`;
    }

    await sendAndSaveMasterMessage(o.master_id, o.max_chat_id, msg, "🔍 Диагностика заказов");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Existing stats endpoint ──────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [managerSessions, managerLeads, managerMessages] = await Promise.all([
      db.execute(sql`SELECT COUNT(DISTINCT user_id) as count FROM bot_sessions WHERE bot_type = 'manager' AND updated_at >= ${todayISO}`),
      db.execute(sql`SELECT COUNT(*) as count FROM leads WHERE created_at >= ${todayISO} AND deleted_at IS NULL`),
      db.execute(sql`SELECT SUM(jsonb_array_length(session_data->'messages')) as count FROM bot_sessions WHERE bot_type = 'manager' AND updated_at >= ${todayISO}`),
    ]);

    const [dispatchSent, dispatchResponded, ordersAssigned] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM order_dispatches WHERE created_at >= ${todayISO}`),
      db.execute(sql`SELECT COUNT(*) as count FROM order_dispatches WHERE created_at >= ${todayISO} AND status IN ('responded','assigned')`),
      db.execute(sql`SELECT COUNT(*) as count FROM orders WHERE assigned_at >= ${todayISO} AND master_id IS NOT NULL AND deleted_at IS NULL`),
    ]);

    const recentManagerActivity = await db.execute(sql`
      SELECT session_data->'messages' as messages, updated_at FROM bot_sessions WHERE bot_type = 'manager' ORDER BY updated_at DESC LIMIT 3
    `);

    const recentDispatcher = await db.execute(sql`
      SELECT od.created_at, o.service_type, o.city, m.alias as master_alias, od.status
      FROM order_dispatches od JOIN orders o ON o.id = od.order_id JOIN masters m ON m.id = od.master_id
      ORDER BY od.created_at DESC LIMIT 5
    `);

    const recentBrowserLogs = await db.execute(sql`SELECT action_type, description, created_at FROM browser_agent_logs ORDER BY created_at DESC LIMIT 10`).catch(() => ({ rows: [] }));

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
          return { ts: r.updated_at, text: lastUser?.content?.slice(0, 80) ?? "разговор" };
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
