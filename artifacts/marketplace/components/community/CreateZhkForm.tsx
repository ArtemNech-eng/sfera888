"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { CommunityLocalityKind } from "../../lib/types";
import { LOCALITY_KIND_OPTIONS } from "../../lib/communityLocalityForm";

interface Props {
  /** Родительский город (Requirement 4.1) — slug и человекочитаемое имя. */
  citySlug: string;
  cityName: string;
}

type Status = "idle" | "submitting" | "error" | "duplicate";

interface CreatedEnvelope {
  ok: true;
  status: "created";
  zhk: { slug: string; name: string };
}
interface DuplicateEnvelope {
  ok: true;
  status: "duplicate_suggested";
  existing: { slug: string; name: string };
}
interface ErrorEnvelope {
  ok: false;
  error: string;
  reason?: string;
}
type Envelope = CreatedEnvelope | DuplicateEnvelope | ErrorEnvelope;

/**
 * Выбор типа локации (Locality_Kind, Requirement 4.1). Опции вынесены в чистый
 * модуль `lib/communityLocalityForm.ts`, чтобы их можно было проверить юнит-
 * тестом без клиентского рантайма (task 9.5). Значение по умолчанию — `zhk`.
 */
const KIND_OPTIONS = LOCALITY_KIND_OPTIONS;

const ERROR_MESSAGES: Record<string, string> = {
  verification_required:
    "Чтобы добавить место, подтвердите телефон — это займёт минуту.",
  validation_error: "Проверьте название места.",
  invalid_name: "Название места должно содержать от 2 до 100 символов.",
  invalid_kind: "Выберите тип места из списка.",
  city_not_found: "Город временно недоступен.",
  invalid_json: "Не удалось обработать форму. Перезагрузите страницу.",
  upstream_unreachable: "Сервис временно недоступен, попробуйте позже.",
  upstream_error: "Не удалось добавить место, попробуйте позже.",
};

function friendlyError(label: string | undefined): string {
  if (!label) return ERROR_MESSAGES.upstream_error;
  return ERROR_MESSAGES[label] ?? ERROR_MESSAGES.upstream_error;
}

/**
 * Форма создания нового места жителем (Requirement 4). Житель выбирает тип
 * локации — ЖК, район или посёлок (Requirement 4.1) — так что сообщество
 * работает и для старого фонда, и для частного сектора, а не только для
 * новостроек.
 *
 * Уровень доступа 3 гейтится на клиенте: если сессия сообщества отсутствует,
 * бэкенд-прокси вернёт `verification_required`, и форма покажет предложение
 * подтвердить телефон (Requirement 11.1/11.3) вместо тихого провала.
 */
export function CreateZhkForm({ citySlug, cityName }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [duplicate, setDuplicate] = useState<{ slug: string; name: string } | null>(null);
  // Контролируем поле, чтобы ввод не терялся при ошибке (Requirement 3.4-стиль UX).
  const [name, setName] = useState("");
  // Тип локации (Requirement 4.1). По умолчанию `zhk` — обратная совместимость.
  const [kind, setKind] = useState<CommunityLocalityKind>("zhk");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage(null);
    setNeedsVerification(false);
    setDuplicate(null);

    let res: Response;
    try {
      res = await fetch("/api/community/zhk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), citySlug, kind }),
      });
    } catch {
      setMessage("Сетевая ошибка. Проверьте интернет-соединение.");
      setStatus("error");
      return;
    }

    let parsed: Envelope | null = null;
    try {
      parsed = (await res.json()) as Envelope;
    } catch {
      parsed = null;
    }

    if (parsed && parsed.ok === true && parsed.status === "created") {
      // Local_Feed нового места доступен сразу (Requirement 4.6) — ведём туда.
      window.location.assign(`/zhk/${parsed.zhk.slug}`);
      return;
    }

    if (parsed && parsed.ok === true && parsed.status === "duplicate_suggested") {
      // Дубликат: предлагаем существующее место вместо создания (Requirement 4.5).
      setDuplicate(parsed.existing);
      setStatus("duplicate");
      return;
    }

    const label = parsed && parsed.ok === false ? parsed.error : undefined;
    if (label === "verification_required") {
      setNeedsVerification(true);
    }
    setMessage(friendlyError(label));
    setStatus("error");
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div>
        <label className="zen-label" htmlFor="place-kind">Тип места *</label>
        <select
          id="place-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CommunityLocalityKind)}
          className="zen-input"
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--z-muted)" }}>
          Новостройка, район старого фонда или посёлок — соседи найдут вас по типу места.
        </p>
      </div>

      <div>
        <label className="zen-label" htmlFor="zhk-name">Название места *</label>
        <input
          id="zhk-name"
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={100}
          placeholder="например, ЖК «Скандинавия» или «Черёмушки»"
          className="zen-input"
        />
        <p style={{ marginTop: 6, fontSize: 12, color: "var(--z-muted)" }}>
          От 2 до 100 символов. Если место уже есть — предложим перейти в него.
        </p>
      </div>

      {duplicate ? (
        <div role="status" className="zen-alert zen-alert--ok">
          Такое место уже есть:{" "}
          <Link href={`/zhk/${duplicate.slug}`} style={{ fontWeight: 700, textDecoration: "underline" }}>
            {duplicate.name}
          </Link>. Перейдите в него, чтобы читать и обсуждать.
        </div>
      ) : null}

      {message ? (
        <div role="alert" className="zen-alert zen-alert--err">
          {message}
          {needsVerification ? (
            <> <Link href="/login" style={{ fontWeight: 700, textDecoration: "underline" }}>Подтвердить телефон</Link></>
          ) : null}
        </div>
      ) : null}

      <button type="submit" disabled={submitting} className="zen-btn zen-btn--block">
        {submitting ? "Добавляем…" : "Добавить место"}
      </button>
    </form>
  );
}
