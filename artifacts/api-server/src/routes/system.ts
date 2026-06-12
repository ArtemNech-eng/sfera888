/**
 * System endpoints — feature flags и связанные системные настройки.
 *
 * GET /api/system/feature-flags — возвращает значения feature-flag'ов
 * для CRM/Master_PWA frontend. Используется фронтом для условного рендеринга
 * новой UI (кнопки, баннеры) и для скрытия фич, которые ещё не включены
 * на стороне сервера.
 *
 * См. .kiro/specs/estimate-optional-flow/design.md § Feature flags.
 */

import { Router } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// Фиксированный whitelist — чтобы клиент не мог вычитать произвольные
// значения из system_settings (там лежат пароли/токены/секреты).
const PAYMENT_STATE_FLAGS = [
  "payment_state_engine_enabled",
  "payment_state_audit_ui_enabled",
  "payment_state_master_proposal_oneclick",
] as const;

const FLAG_DEFAULTS: Record<typeof PAYMENT_STATE_FLAGS[number], boolean> = {
  payment_state_engine_enabled: false,
  payment_state_audit_ui_enabled: false,
  payment_state_master_proposal_oneclick: true,
};

router.get("/feature-flags", requireAuth, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, [...PAYMENT_STATE_FLAGS]));

    const map = new Map(rows.map((r) => [r.key, r.value]));

    const result: Record<string, boolean> = {};
    for (const key of PAYMENT_STATE_FLAGS) {
      const stored = map.get(key);
      result[key] = stored != null ? stored === "true" : FLAG_DEFAULTS[key];
    }

    res.json(result);
  } catch (err) {
    console.error("[system/feature-flags] error:", err);
    // Fail-closed: при ошибке чтения возвращаем дефолты, чтобы фронт не падал.
    res.json(FLAG_DEFAULTS);
  }
});

export default router;
