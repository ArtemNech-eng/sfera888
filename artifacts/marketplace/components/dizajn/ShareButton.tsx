"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Share-кнопка для AI-дизайн-проекта.
 *
 * Стратегия:
 *   • Mobile (есть navigator.share) — нативный share-sheet OS, открывает все
 *     установленные приложения (VK, Telegram, WhatsApp, Mail, и т.п.) одним
 *     тапом.
 *   • Desktop (нет navigator.share) — dropdown с явными targetами: VK,
 *     Telegram, WhatsApp, OK, Email + Copy link.
 *
 * UTM-параметры добавляются к каждому shared URL для атрибуции трафика:
 *   ?utm_source=share&utm_medium={platform}&utm_campaign=ai_design
 *
 * SEO-петля: пользователь шерит → друзья кликают → лендят на /dizajn/{slug}
 * → могут шарить дальше или создать свой → backlinks из соцсетей.
 */

interface Props {
  /** Полный публичный URL дизайна (без UTM). */
  shareUrl: string;
  /** Заголовок для share-sheet и og-fallback. */
  shareTitle: string;
  /** Краткое описание / first sentence. */
  shareText?: string;
}

const PLATFORMS = [
  { key: "vk", label: "ВКонтакте", icon: "vk" },
  { key: "telegram", label: "Telegram", icon: "telegram" },
  { key: "whatsapp", label: "WhatsApp", icon: "whatsapp" },
  { key: "ok", label: "Одноклассники", icon: "ok" },
  { key: "email", label: "Email", icon: "email" },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]["key"];

export function ShareButton({ shareUrl, shareTitle, shareText }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Reset copied after 2s.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  function buildPlatformUrl(platform: PlatformKey): string {
    const trackedUrl = appendUtm(shareUrl, platform);
    const encodedUrl = encodeURIComponent(trackedUrl);
    const encodedTitle = encodeURIComponent(shareTitle);
    const encodedText = encodeURIComponent(`${shareTitle}\n${trackedUrl}`);

    switch (platform) {
      case "vk":
        return `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`;
      case "telegram":
        return `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
      case "whatsapp":
        return `https://api.whatsapp.com/send?text=${encodedText}`;
      case "ok":
        return `https://connect.ok.ru/offer?url=${encodedUrl}&title=${encodedTitle}`;
      case "email":
        return `mailto:?subject=${encodedTitle}&body=${encodedText}`;
      default:
        return shareUrl;
    }
  }

  async function handleNativeShare() {
    if (!hasNativeShare) {
      setOpen(true);
      return;
    }
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText ?? shareTitle,
        url: appendUtm(shareUrl, "native"),
      });
    } catch {
      // User cancelled or share failed — silent.
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(appendUtm(shareUrl, "copy"));
      setCopied(true);
      setOpen(false);
    } catch {
      // Clipboard API can fail in non-secure contexts. Fallback: textarea trick.
      const ta = document.createElement("textarea");
      ta.value = appendUtm(shareUrl, "copy");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setOpen(false);
      } catch {
        // give up
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={hasNativeShare ? handleNativeShare : () => setOpen((v) => !v)}
        aria-haspopup={hasNativeShare ? undefined : "menu"}
        aria-expanded={!hasNativeShare ? open : undefined}
        className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
      >
        <ShareIcon />
        {copied ? "Скопировано" : "Поделиться"}
      </button>

      {/* Desktop dropdown */}
      {!hasNativeShare && open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-cozy-md"
        >
          {PLATFORMS.map((p) => (
            <a
              key={p.key}
              href={buildPlatformUrl(p.key)}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-cream-deep)]"
            >
              <PlatformIcon name={p.icon} />
              {p.label}
            </a>
          ))}
          <button
            type="button"
            onClick={handleCopy}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-cream-deep)]"
          >
            <CopyIcon />
            {copied ? "Скопировано" : "Скопировать ссылку"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function appendUtm(url: string, medium: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "share");
    u.searchParams.set("utm_medium", medium);
    u.searchParams.set("utm_campaign", "ai_design");
    return u.toString();
  } catch {
    // url is relative or malformed — fallback to simple concat.
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}utm_source=share&utm_medium=${medium}&utm_campaign=ai_design`;
  }
}

// ── Icons ───────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PlatformIcon({ name }: { name: string }) {
  switch (name) {
    case "vk":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#0077FF]" aria-hidden>
          <path d="M12.785 16.241s.288-.032.435-.193c.135-.148.131-.426.131-.426s-.019-1.305.589-1.498c.601-.19 1.371 1.265 2.187 1.825.617.422 1.084.328 1.084.328l2.183-.031s1.143-.071.601-.973c-.044-.075-.318-.671-1.633-1.892-1.378-1.279-1.193-1.072.466-3.282 1.011-1.346 1.415-2.169 1.288-2.518-.121-.334-.851-.245-.851-.245l-2.444.015s-.181-.025-.317.057c-.131.08-.215.265-.215.265s-.391 1.041-.911 1.927c-1.099 1.866-1.539 1.965-1.718 1.847-.42-.272-.315-1.092-.315-1.673 0-1.815.275-2.572-.535-2.769-.27-.065-.469-.108-1.155-.115-.881-.009-1.626.003-2.048.21-.281.138-.498.443-.366.46.163.022.534.1.731.367.253.346.244 1.122.244 1.122s.146 2.137-.342 2.402c-.336.183-.795-.189-1.775-1.886-.502-.869-.881-1.83-.881-1.83s-.072-.179-.201-.275c-.156-.117-.376-.154-.376-.154l-2.323.015s-.349.01-.477.162c-.114.135-.009.413-.009.413s1.819 4.255 3.879 6.401c1.889 1.97 4.034 1.84 4.034 1.84z"/>
        </svg>
      );
    case "telegram":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#0088CC]" aria-hidden>
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      );
    case "whatsapp":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#25D366]" aria-hidden>
          <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.107zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
        </svg>
      );
    case "ok":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#EE8208]" aria-hidden>
          <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 5.405c1.94 0 3.514 1.572 3.514 3.514S13.94 12.432 12 12.432 8.486 10.86 8.486 8.919 10.06 5.405 12 5.405zm0 4.756c.687 0 1.243-.557 1.243-1.243S12.687 7.675 12 7.675s-1.243.557-1.243 1.244c0 .686.557 1.242 1.243 1.242zm5.137 4.95c-.296.594-.875 1.012-1.493 1.292-.617.281-1.298.464-1.97.563l1.59 1.59c.594.594.594 1.557 0 2.151-.296.297-.685.445-1.075.445s-.778-.148-1.075-.445L12 18.965l-2.114 2.114c-.296.297-.685.445-1.075.445s-.779-.148-1.076-.445c-.594-.594-.594-1.557 0-2.151l1.591-1.59c-.673-.099-1.353-.282-1.97-.563-.62-.28-1.198-.698-1.494-1.293-.347-.696-.082-1.541.614-1.888.696-.346 1.541-.082 1.888.614.046.092.464.358 1.052.554.587.196 1.265.295 1.585.295.32 0 .998-.099 1.585-.295.587-.196 1.005-.462 1.052-.554.346-.696 1.191-.96 1.888-.614.696.347.96 1.192.613 1.888z"/>
        </svg>
      );
    case "email":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]" aria-hidden>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    default:
      return null;
  }
}
