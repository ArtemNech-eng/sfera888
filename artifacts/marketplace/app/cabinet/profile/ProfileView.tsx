"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetProfile, type ProfileData } from "../_lib/cabinetClient";

/**
 * Read-only `/cabinet/profile` view (plan §18.3 W2 first slice).
 *
 * Shows the master's own profile as it exists in the DB right now: avatar +
 * identity, public-profile state (with a "посмотреть на сайте" link when
 * published), stat tiles, specializations + service prices, working hours,
 * Max-bot integration. Editing waits for the next iteration that ports the
 * EditProfileModal sheet from master-pwa — it's a substantial sheet UI with
 * service-price grids, working-hours selector and avatar upload.
 *
 * For now the master can see everything they have set, and a single CTA
 * sends them to the master-pwa app to make actual changes.
 */
export function ProfileView() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cabinetProfile
      .fetch()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => {
        const msg = err.message ?? "Не удалось загрузить профиль";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        {error ?? "Не удалось загрузить профиль"}.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Профиль
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            Ваш профиль
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Данные, которые мастера и клиенты видят на маркетплейсе.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm sm:p-5">
          <Avatar src={data.customAvatarUrl} name={data.alias} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-[var(--color-text)]">{data.alias}</p>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {data.specialization} · {data.city}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
              {data.phone ? <span>{formatPhone(data.phone)}</span> : null}
              {data.isTestMaster ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Тестовый
                </span>
              ) : null}
              {data.contractSignedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <CheckMicroIcon />
                  Договор подписан
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href="/cabinet/profile/edit"
            className="inline-flex h-10 flex-shrink-0 items-center gap-1 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
          >
            Редактировать
            <ArrowRightIcon />
          </Link>
        </div>
      </header>

      {/* Public profile state */}
      <PublicProfileCard data={data} />

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Завершено заказов"
          value={data.completedCount}
          tone="ok"
        />
        <StatTile
          label="В работе"
          value={data.activeCount}
          tone="primary"
        />
        <StatTile
          label="Конверсия"
          value={`${Math.round(data.stats.conversionRate * 100)}%`}
          tone="indigo"
          sub="отклик → выполнение"
        />
        <StatTile
          label="Рейтинг"
          value={data.rating > 0 ? `★ ${data.rating.toFixed(1)}` : "—"}
          tone="amber"
        />
      </div>

      {/* Specializations + service prices */}
      <section>
        <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
          Специализации и цены
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Эти услуги и расценки видят клиенты на маркетплейсе.
        </p>
        {data.specializations.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted)]">
            Специализации не указаны. Заполните в редакторе.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <ul className="flex flex-wrap gap-2">
              {data.specializations.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]"
                >
                  {s}
                </li>
              ))}
            </ul>

            {data.servicePrices.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.servicePrices.map((p, i) => (
                  <li
                    key={`${p.service}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3.5 shadow-sm"
                  >
                    <span className="line-clamp-2 text-sm font-medium text-[var(--color-text)]">{p.service}</span>
                    <span className="whitespace-nowrap text-sm font-bold text-[var(--color-primary)]">
                      от {formatRubles(p.priceFrom)} ₽
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {/* Working hours */}
      {data.workingHours ? <WorkingHoursCard hours={data.workingHours} /> : null}

      {/* Max bot integration */}
      <MaxBotCard maxChatId={data.maxChatId} maxBotLink={data.maxBotLink} />

      {/* Read-only notice */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-sm text-[var(--color-muted)]">
        <p className="font-semibold text-[var(--color-text)]">Полное редактирование — в старом приложении</p>
        <p className="mt-1">
          В новом кабинете пока работает просмотр и баланс. Чтобы поменять имя, добавить услугу или
          изменить рабочие часы — откройте старое приложение мастера. Полный редактор переедет в
          ближайших обновлениях.
        </p>
        <a
          href="https://sfera-master.ru/master-pwa/"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          Открыть в старом приложении →
        </a>
      </div>
    </div>
  );
}

// ── Public profile card ─────────────────────────────────────────────────────

function PublicProfileCard({ data }: { data: ProfileData }) {
  const ago = data.publishedAt ? timeSince(data.publishedAt) : null;

  if (!data.isPublished) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
            <EyeOffIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">Профиль ещё не опубликован</p>
            <p className="mt-1 text-xs text-amber-800">
              Заполните публичный заголовок и описание, добавьте опыт работы — и мы покажем вас на маркетплейсе.
              Это бесплатные клиенты, которые сами вас найдут.
            </p>
            <a
              href="https://sfera-master.ru/master-pwa/"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 hover:underline"
            >
              Опубликовать профиль →
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <GlobeIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-900">Профиль опубликован на маркетплейсе</p>
          {ago ? (
            <p className="mt-1 text-xs text-emerald-800">Опубликован {ago}</p>
          ) : null}

          {data.publicTitle ? (
            <p className="mt-3 text-sm font-semibold text-emerald-950">{data.publicTitle}</p>
          ) : null}
          {data.publicBio ? (
            <p className="mt-1 line-clamp-3 text-xs text-emerald-900">{data.publicBio}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {data.profileUrl ? (
              <a
                href={data.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
              >
                Посмотреть на сайте
                <ArrowExternalIcon />
              </a>
            ) : null}
            {data.yearsExperience != null && data.yearsExperience > 0 ? (
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                Опыт {data.yearsExperience} {pluralYears(data.yearsExperience)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Working hours ───────────────────────────────────────────────────────────

const WEEKDAY_LABELS: Record<number, string> = {
  0: "вс",
  1: "пн",
  2: "вт",
  3: "ср",
  4: "чт",
  5: "пт",
  6: "сб",
};

function WorkingHoursCard({ hours }: { hours: { start: string; end: string; days: number[] } }) {
  const days = hours.days.length > 0 ? hours.days.map((d) => WEEKDAY_LABELS[d] ?? "?").join(", ") : "не указаны";
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">Рабочие часы</h2>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <ClockIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {hours.start} – {hours.end}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Дни: {days}</p>
        </div>
      </div>
    </section>
  );
}

// ── Max bot ─────────────────────────────────────────────────────────────────

function MaxBotCard({ maxChatId, maxBotLink }: { maxChatId: string | null; maxBotLink: string | null }) {
  const linked = !!maxChatId;
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">Max-бот</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Уведомления о новых заявках в Max — быстрее push, удобнее почты.
      </p>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <span className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${linked ? "bg-emerald-50 text-emerald-700" : "bg-[var(--color-background)] text-[var(--color-muted)]"}`}>
          <BotIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {linked ? "Бот подключён" : "Бот не подключён"}
          </p>
          {linked ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Получаете заявки в Max</p>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Подключите за 30 секунд</p>
          )}
        </div>
        {!linked && maxBotLink ? (
          <a
            href={maxBotLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 flex-shrink-0 items-center gap-1 rounded-xl bg-[var(--color-primary)] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
          >
            Подключить
            <ArrowRightIcon />
          </a>
        ) : null}
      </div>
    </section>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "amber" | "indigo" | "ok";
  sub?: string;
}) {
  const VALUE_TONE = {
    primary: "text-[var(--color-text)]",
    amber: "text-amber-700",
    indigo: "text-[var(--color-secondary)]",
    ok: "text-emerald-700",
  } as const;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${VALUE_TONE[tone]}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{sub}</p> : null}
    </div>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="h-16 w-16 flex-shrink-0 rounded-2xl border border-[var(--color-border)] object-cover sm:h-20 sm:w-20"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "М";
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)] text-xl font-bold text-white sm:h-20 sm:w-20 sm:text-2xl"
    >
      {initials}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phone;
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

function timeSince(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - d);
    const day = Math.round(diff / 86_400_000);
    if (day < 1) return "сегодня";
    if (day < 30) return `${day} ${pluralDays(day)} назад`;
    const month = Math.round(day / 30);
    return `${month} ${pluralMonths(month)} назад`;
  } catch {
    return "";
  }
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function pluralMonths(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "месяцев";
  if (mod10 === 1) return "месяц";
  if (mod10 >= 2 && mod10 <= 4) return "месяца";
  return "месяцев";
}

// ── Inline icons ────────────────────────────────────────────────────────────

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function ArrowExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function CheckMicroIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}
