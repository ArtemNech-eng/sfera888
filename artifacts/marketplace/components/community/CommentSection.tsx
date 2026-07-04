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
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

/**
 * Обсуждение под темой (portal-стиль). Дерево комментариев из плоского списка,
 * форма нового комментария и inline-формы ответа. Публикация — через фасад-прокси
 * `/api/community/threads/[id]/comments` (уровень доступа 3). Успех → router.refresh().
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
    <section style={{ marginTop: 40 }}>
      <div className="portal-kicker">
        <h2 className="portal-h2">Обсуждение</h2>
        <span className="portal-kicker-count">{comments.length}</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <CommentForm
          placeholder="Написать комментарий…"
          submitLabel="Отправить"
          disabled={submitting}
          onSubmit={(text) => submit(text, null)}
        />
      </div>

      {error ? (
        <div role="alert" className="portal-alert portal-alert--err">
          {error}
          {needsVerification ? (
            <> <Link href="/login" style={{ fontWeight: 700, textDecoration: "underline" }}>Подтвердить телефон</Link></>
          ) : null}
        </div>
      ) : null}

      {tree.length > 0 ? (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
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
        </div>
      ) : (
        <p style={{ marginTop: 24, color: "var(--p-muted)", fontSize: 15 }}>
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
    <div className="portal-comment" style={{ marginLeft: indent > 0 ? indent * 14 : undefined }}>
      <div className="portal-comment-head">
        <span className="portal-comment-author">Сосед</span>
        <span aria-hidden>·</span>
        <time dateTime={node.createdAt}>{formatDate(node.createdAt)}</time>
      </div>
      <p className="portal-comment-body">{node.body}</p>
      <button type="button" onClick={() => setReplyTo(replyTo === node.id ? null : node.id)} className="portal-reply-btn">
        {replyTo === node.id ? "Отмена" : "Ответить"}
      </button>

      {replyTo === node.id ? (
        <div style={{ marginTop: 12 }}>
          <CommentForm placeholder="Ваш ответ…" submitLabel="Ответить" disabled={submitting} onSubmit={onReply} />
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
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
        </div>
      ) : null}
    </div>
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
    <form onSubmit={handle} style={{ display: "grid", gap: 10 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={placeholder}
        className="portal-textarea"
      />
      <div>
        <button type="submit" disabled={disabled || text.trim().length === 0} className="portal-btn">
          {disabled ? "Отправляем…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
