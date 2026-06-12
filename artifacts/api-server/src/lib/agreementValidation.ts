/**
 * Pure validation/normalization helper for POST /api/orders/:id/agreement
 * (Phase 2 of estimate-optional-flow / Agreement_Path).
 *
 * Вынесена отдельно из роута, чтобы можно было проверить контракт
 * без поднятия Express и тестовой БД. Полностью детерминированная
 * функция: одни и те же входные данные → одинаковый выход.
 *
 * Вход: req.body — произвольный объект с полями amount, source, note,
 *   noteSource. Все поля могут быть undefined / неправильного типа.
 * Выход: либо `{ ok: true, ... }` — валидный нормализованный body,
 *   либо `{ ok: false, error }` — фронтенду нужно показать toast.
 */

export type AgreementSource = "agreement" | "master_proposal";

export interface ValidatedAgreementBody {
  ok: true;
  amount: number;
  source: AgreementSource;
  noteText: string | null;
  /** true когда сумма выше soft warning threshold (1М₽). UI показывает alert. */
  softWarning: boolean;
}

export interface ValidationError {
  ok: false;
  error: string;
}

const SOFT_WARNING_THRESHOLD = 1_000_000;
const ALLOWED_SOURCES: readonly AgreementSource[] = ["agreement", "master_proposal"];

const NOTE_SOURCE_LABELS: Record<string, string> = {
  from_master: "со слов мастера",
  from_chat: "по чату с клиентом",
  other: "другое",
};

const NOTE_MAX_LENGTH = 1000;

export function validateAgreementBody(
  body: unknown,
): ValidatedAgreementBody | ValidationError {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<
    string,
    unknown
  >;

  // ── amount ──────────────────────────────────────────────────────────────────
  const amountNum = Number(b.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { ok: false, error: "Сумма должна быть больше 0" };
  }

  // ── source ──────────────────────────────────────────────────────────────────
  // Whitelisted enum; невалидные значения молча падают в default ("agreement"),
  // т.к. agreement source — самый безопасный (operator typed it).
  const source: AgreementSource =
    typeof b.source === "string" && (ALLOWED_SOURCES as readonly string[]).includes(b.source)
      ? (b.source as AgreementSource)
      : "agreement";

  // ── noteText (composed from noteSource + note) ──────────────────────────────
  const noteText = composeNoteText(b.noteSource, b.note);

  return {
    ok: true,
    amount: amountNum,
    source,
    noteText,
    softWarning: amountNum >= SOFT_WARNING_THRESHOLD,
  };
}

/**
 * Composes human-readable audit/order note from selector + free text.
 * Stored in `orders.agreementNote` and used as audit reason. Optional
 * (Q12 decision — комментарий не обязателен).
 */
export function composeNoteText(noteSource: unknown, note: unknown): string | null {
  const parts: string[] = [];
  if (typeof noteSource === "string") {
    const label = NOTE_SOURCE_LABELS[noteSource];
    parts.push(label ?? noteSource);
  }
  if (typeof note === "string" && note.trim()) {
    parts.push(note.trim());
  }
  if (parts.length === 0) return null;
  return parts.join(": ").slice(0, NOTE_MAX_LENGTH);
}
