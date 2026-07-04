"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * «Спросите что угодно» (Ask_Anything) — форма вопроса низкого трения.
 *
 * SEO/UGC-поток (Reddit-модель): любой посетитель задаёт вопрос БЕЗ выбора
 * категории и БЕЗ подтверждения телефона. Постит на анонимный прокси
 * `/api/community/ask`, который форвардит на api-server `/community/feeds/ask`.
 * При успехе — редирект на страницу созданного вопроса `/t/[id]`, чтобы человек
 * сразу видел свою тему живой (и получал дофамин от публикации).
 *
 * Промпт-чипы подсказывают «болевые» формулировки и снижают барьер начала.
 */

interface Props {
  /** Slug ЖК — вопрос уйдёт в Local_Feed этого ЖК. Приоритетнее citySlug. */
  zhkSlug?: string;
  /** Slug города — вопрос уйдёт в City_Feed. Используется, если нет zhkSlug. */
  citySlug?: string;
  /** Готовые формулировки-подсказки (клик подставляет в заголовок). */
  suggestions?: string[];
  /** Плейсхолдер заголовка. */
  placeholder?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Проверьте формулировку вопроса.",
  invalid_title: "Вопрос должен содержать от 1 до 200 символов.",
  invalid_body: "Текст не должен превышать 5000 символов.",
  no_target: "Не удалось определить, куда отправить вопрос. Обновите страницу.",
  rate_limited: "Слишком много вопросов подряд. Подождите минуту и попробуйте снова.",
  not_found: "Раздел не найден. Обновите страницу.",
  upstream_unreachable: "Сервис временно недоступен, попробуйте позже.",
  upstream_error: "Не удалось отправить вопрос, попробуйте позже.",
};

function friendly(label: string | undefined, reason: string | undefined): string {
  if (reason && ERROR_MESSAGES[reason]) return ERROR_MESSAGES[reason];
  if (!label) return ERROR_MESSAGES.upstream_error;
  return ERROR_MESSAGES[label] ?? ERROR_MESSAGES.upstream_error;
}

export function AskForm({ zhkSlug, citySlug, suggestions = [], placeholder }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (title.trim().length === 0) {
      setError(ERROR_MESSAGES.invalid_title);
      return;
    }
    setSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/community/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zhkSlug, citySlug, title: title.trim(), body }),
      });
    } catch {
      setError("Сетевая ошибка. Проверьте соединение.");
      setSubmitting(false);
      return;
    }

    let parsed: { ok?: boolean; error?: string; reason?: string; thread?: { id?: number } } | null = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    if (parsed && parsed.ok === true && parsed.thread?.id) {
      // Успех: ведём человека на страницу его вопроса — он сразу «живой».
      router.push(`/t/${parsed.thread.id}`);
      return;
    }
    setSubmitting(false);
    setError(friendly(parsed?.error, parsed?.reason));
  }

  return (
    <form onSubmit={onSubmit} className="zen-ask" style={{ display: "grid", gap: 12 }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setExpanded(true)}
        maxLength={200}
        placeholder={placeholder ?? "Спросите соседей о чём угодно…"}
        className="zen-input"
        aria-label="Ваш вопрос"
      />

      {expanded ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Добавьте детали — так соседям проще ответить (необязательно)."
          className="zen-textarea"
        />
      ) : null}

      {suggestions.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="zen-chip zen-chip--btn"
              onClick={() => {
                setTitle(s);
                setExpanded(true);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="zen-alert zen-alert--err">{error}</div>
      ) : null}

      <button type="submit" disabled={submitting || title.trim().length === 0} className="zen-btn zen-btn--block">
        {submitting ? "Публикуем…" : "Задать вопрос"}
      </button>
      <p style={{ fontSize: 12, color: "var(--z-muted)", margin: 0 }}>
        Без регистрации — вопрос появится сразу.
      </p>
    </form>
  );
}
