"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LOCAL_FEED_CATEGORIES } from "../../lib/types";

interface Props {
  /** Имя ЖК — для подписи формы. */
  zhkName: string;
}

type Status = "idle" | "submitting" | "error" | "success";

interface CreatedEnvelope {
  ok: true;
  status: "created";
}
interface ErrorEnvelope {
  ok: false;
  error: string;
  reason?: string;
  draftId?: number | null;
}
type Envelope = CreatedEnvelope | ErrorEnvelope;

const ERROR_MESSAGES: Record<string, string> = {
  verification_required:
    "Чтобы опубликовать тему, подтвердите телефон — это займёт минуту.",
  validation_error: "Проверьте заполнение формы.",
  invalid_category: "Выберите категорию темы.",
  invalid_title: "Заголовок должен содержать от 1 до 200 символов.",
  invalid_body: "Текст не должен превышать 5000 символов.",
  no_zhk_binding:
    "Ваш профиль не привязан к ЖК. Присоединитесь к ЖК, чтобы публиковать темы.",
  invalid_json: "Не удалось обработать форму. Перезагрузите страницу.",
  upstream_unreachable: "Сервис временно недоступен, попробуйте позже.",
  upstream_error: "Не удалось опубликовать тему, попробуйте позже.",
};

const REASON_MESSAGES: Record<string, string> = {
  invalid_category: ERROR_MESSAGES.invalid_category,
  invalid_title: ERROR_MESSAGES.invalid_title,
  invalid_body: ERROR_MESSAGES.invalid_body,
  no_zhk_binding: ERROR_MESSAGES.no_zhk_binding,
};

function friendlyError(label: string | undefined, reason: string | undefined): string {
  if (reason && REASON_MESSAGES[reason]) return REASON_MESSAGES[reason];
  if (!label) return ERROR_MESSAGES.upstream_error;
  return ERROR_MESSAGES[label] ?? ERROR_MESSAGES.upstream_error;
}

/**
 * Форма создания темы в Local_Feed ЖК (Requirement 3). Уровень доступа 3
 * гейтится на клиенте: при отсутствии сессии сообщества прокси вернёт
 * `verification_required`, и форма предложит подтвердить телефон.
 *
 * Ввод хранится в состоянии и НЕ очищается при ошибке — данные пользователя не
 * теряются даже если публикация отклонена (Requirements 3.4, 11.3). При успехе
 * форма очищается и обновляет ленту через `router.refresh()`.
 */
export function CreateTopicForm({ zhkName }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage(null);
    setNeedsVerification(false);

    let res: Response;
    try {
      res = await fetch("/api/community/topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title: title.trim(), body }),
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

    if (parsed && parsed.ok === true) {
      // Успех: очищаем форму и обновляем ленту.
      setCategory("");
      setTitle("");
      setBody("");
      setStatus("success");
      setMessage("Тема опубликована.");
      router.refresh();
      return;
    }

    const label = parsed && parsed.ok === false ? parsed.error : undefined;
    const reason = parsed && parsed.ok === false ? parsed.reason : undefined;
    if (label === "verification_required") {
      setNeedsVerification(true);
    }
    // Ввод намеренно НЕ очищаем (Requirement 3.4).
    setMessage(friendlyError(label, reason));
    setStatus("error");
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <p style={{ fontSize: 12, color: "var(--p-muted)" }}>ЖК: {zhkName}</p>

      <div>
        <label className="portal-label" htmlFor="topic-cat">Категория *</label>
        <select
          id="topic-cat"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="portal-select"
        >
          <option value="" disabled>Выберите категорию</option>
          {LOCAL_FEED_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="portal-label" htmlFor="topic-title">Заголовок *</label>
        <input
          id="topic-title"
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={1}
          maxLength={200}
          placeholder="Коротко о теме"
          className="portal-input"
        />
      </div>

      <div>
        <label className="portal-label" htmlFor="topic-body">Текст</label>
        <textarea
          id="topic-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Опишите подробнее — соседям будет проще помочь."
          className="portal-textarea"
        />
      </div>

      {message ? (
        <div role="alert" className={`portal-alert ${status === "success" ? "portal-alert--ok" : "portal-alert--err"}`}>
          {message}
          {needsVerification ? (
            <> <Link href="/login" style={{ fontWeight: 700, textDecoration: "underline" }}>Подтвердить телефон</Link></>
          ) : null}
        </div>
      ) : null}

      <button type="submit" disabled={submitting} className="portal-btn portal-btn--block">
        {submitting ? "Публикуем…" : "Опубликовать тему"}
      </button>
    </form>
  );
}
