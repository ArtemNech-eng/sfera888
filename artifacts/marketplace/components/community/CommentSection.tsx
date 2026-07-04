"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ThreadCommentDTO } from "../../lib/communityApi";

interface Props {
  threadId: number;
  comments: ThreadCommentDTO[];
}

interface TreeNode extends ThreadCommentDTO {
  children: TreeNode[];
}

/** Максимальная визуальная вложенность (глубже — выравниваем, чтобы не уезжало). */
const MAX_INDENT_DEPTH = 5;

const ERROR_MESSAGES: Record<string, string> = {
  verification_required: "Чтобы ответить, подтвердите телефон — это займёт минуту.",
  validation_error: "Введите текст комментария.",
  invalid_body: "Комментарий не должен быть пустым и длиннее 5000 символов.",
  thread_not_found: "Тема не найдена или была скрыта.",
  parent_mismatch: "Не удалось привязать ответ к комментарию.",
  invalid_json: "Не удалось обработать форму. Перезагрузите страницу.",
  upstream_unreachable: "Сервис временно недоступен, попробуйте позже.",
  upstream_error: "Не удалось отправить комментарий, попробуйте позже.",
};

function friendly(label: string | undefined, reason: string | undefined): string {
  if (reason && ERROR_MESSAGES[reason]) return ERROR_MESSAGES[reason];
  if (!label) return ERROR_MESSAGES.upstream_error;
  return ERROR_MESSAGES[label] ?? ERROR_MESSAGES.upstream_error;
}

function buildTree(comments: ThreadCommentDTO[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const c of comments) byId.set(c.id, { ...c, children: [] });
  const roots: TreeNode[] = [];
  for (const c of comments) {
    const node = byId.get(c.id)!;
    if (c.parentCommentId != null && byId.has(c.parentCommentId)) {
      byId.get(c.parentCommentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Обсуждение под темой (форум-слой). Строит дерево комментариев из плоского
 * списка, показывает форму нового комментария и inline-формы ответа. Публикация
 * идёт через фасад-прокси `/api/community/threads/[id]/comments` (уровень
 * доступа 3 — подтверждённый телефон). При успехе — `router.refresh()`.
 */
export function CommentSection({ threadId, comments }: Props) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(comments), [comments]);

  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(body: string, parentCommentId: number | null): Promise<boolean> {
    if (submitting) return false;
    if (body.trim().length === 0) {
      setError(ERROR_MESSAGES.invalid_body);
      return false;
    }
    setSubmitting(true);
    setError(null);
    setNeedsVerification(false);

    let res: Response;
    try {
      res = await fetch(`/api/community/threads/${threadId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentCommentId }),
      });
    } catch {
      setError("Сетевая ошибка. Проверьте соединение.");
      setSubmitting(false);
      return false;
    }

    let parsed: { ok?: boolean; error?: string; reason?: string } | null = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    setSubmitting(false);

    if (parsed && parsed.ok === true) {
      setReplyTo(null);
      router.refresh();
      return true;
    }

    const label = parsed?.error;
    if (label === "verification_required") setNeedsVerification(true);
    setError(friendly(label, parsed?.reason));
    return false;
  }

  return (
    <section className="mt-10">
      <h2 className="font-display mb-4 text-2xl text-[var(--color-text)]">
        Обсуждение{comments.length > 0 ? ` · ${comments.length}` : ""}
      </h2>

      {/* Новый комментарий верхнего уровня */}
      <CommentForm
        placeholder="Написать комментарий…"
        submitLabel="Отправить"
        disabled={submitting}
        onSubmit={(text) => submit(text, null)}
      />

      {error ? (
        <div role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          {needsVerification ? (
            <>
              {" "}
              <Link href="/login" className="font-medium underline">
                Подтвердить телефон
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Дерево комментариев */}
      {tree.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-4">
          {tree.map((node) => (
            <CommentNode
              key={node.id}
              node={node}
              depth={0}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              submitting={submitting}
              onReply={(text) => submit(text, node.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-[var(--color-muted)]">
          Пока нет комментариев. Будьте первым.
        </p>
      )}
    </section>
  );
}

function CommentNode({
  node,
  depth,
  replyTo,
  setReplyTo,
  submitting,
  onReply,
}: {
  node: TreeNode;
  depth: number;
  replyTo: number | null;
  setReplyTo: (id: number | null) => void;
  submitting: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const indent = Math.min(depth, MAX_INDENT_DEPTH);
  return (
    <li
      className="border-l-2 border-[var(--color-border)] pl-4"
      style={{ marginLeft: indent > 0 ? `${indent * 0.75}rem` : undefined }}
    >
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-faint)]">
          <span className="font-medium text-[var(--color-text)]">Сосед</span>
          <span aria-hidden>·</span>
          <time dateTime={node.createdAt}>{formatDate(node.createdAt)}</time>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
          {node.body}
        </p>
        <button
          type="button"
          onClick={() => setReplyTo(replyTo === node.id ? null : node.id)}
          className="mt-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          {replyTo === node.id ? "Отмена" : "Ответить"}
        </button>

        {replyTo === node.id ? (
          <div className="mt-3">
            <CommentForm
              placeholder="Ваш ответ…"
              submitLabel="Ответить"
              disabled={submitting}
              onSubmit={onReply}
            />
          </div>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {node.children.map((child) => (
            <CommentNode
              key={child.id}
              node={child}
              depth={depth + 1}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              submitting={submitting}
              onReply={onReply}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function CommentForm({
  placeholder,
  submitLabel,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await onSubmit(text);
    if (ok) setText("");
  }

  return (
    <form onSubmit={handle} className="grid gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={placeholder}
        className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
      />
      <div>
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--color-cta)] px-5 py-2.5 text-sm font-medium text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)] disabled:opacity-60"
        >
          {disabled ? "Отправляем…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
