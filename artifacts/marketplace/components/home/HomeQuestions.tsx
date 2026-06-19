import Link from "next/link";

/**
 * Q&A featured-вопрос блок (home-magazine-redesign).
 *
 * Стратегия v3: Q&A — отдельный SEO-канал в духе СпросиВрача. На главной
 * показываем ОДИН featured-вопрос с подробным ответом и блоком мастера-
 * эксперта (фото, имя, опыт). Формат — Stack Overflow «accepted answer
 * card» + magazine pull-quote.
 *
 * До запуска Q&A backend это редакторский preview. После запуска — будем
 * брать featured-вопрос из БД с самым высоким engagement.
 *
 * Stub `/voprosy` пока ведёт на placeholder-страницу. Реальная Q&A
 * платформа (DB schema, модерация, профили мастеров-respondents) — отдельный
 * спек.
 */

const FEATURED = {
  question: "Можно ли клеить новую плитку прямо на старую?",
  answer:
    "Можно, если старая плитка крепко держится — простучите молотком и проверьте на отслоения. Поверхность шкурят грубой шкуркой (P40), грунтуют адгезионной грунтовкой типа «Бетоконтакт» и используют клей с маркировкой C2 или C2TE. Если же есть пустоты, трещины или плитка «бухтит» в нескольких местах — старое покрытие лучше демонтировать. Это сэкономит месяцы переделок.",
  master: {
    name: "Антон Кириллов",
    role: "плиточник",
    yearsLabel: "12 лет опыта",
    cityLabel: "Москва",
    portraitUrl:
      "https://images.unsplash.com/photo-1742844019488-12a9356a7ace?w=160&q=80&auto=format&fit=crop&crop=faces",
    portraitAlt: "Портрет мастера-плиточника",
  },
};

export function HomeQuestions() {
  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Спроси мастера</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-[2rem]">
              Реальные ответы на типичные вопросы про ремонт.
            </h2>
          </div>
          <Link
            href="/voprosy"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4 transition hover:text-[var(--color-primary)] hover:decoration-[var(--color-primary)] sm:inline"
          >
            Все вопросы →
          </Link>
        </div>

        {/* Stack Overflow-style accepted answer card — magazine read-flow width */}
        <article className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
          {/* Question */}
          <div className="border-b border-[var(--color-border)] p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-faint)]">
              Вопрос
            </p>
            <h3 className="font-display mt-2 text-xl leading-snug text-[var(--color-text)] sm:text-2xl">
              {FEATURED.question}
            </h3>
          </div>

          {/* Answer + master byline */}
          <div className="p-6 sm:p-8">
            <p className="text-base leading-relaxed text-[var(--color-text)]">
              {FEATURED.answer}
            </p>

            <div className="mt-6 flex items-center gap-3 border-t border-[var(--color-border)] pt-5">
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-cream-deep)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={FEATURED.master.portraitUrl}
                  alt={FEATURED.master.portraitAlt}
                  loading="lazy"
                  className="block h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {FEATURED.master.name}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {FEATURED.master.role} · {FEATURED.master.yearsLabel} ·{" "}
                  {FEATURED.master.cityLabel}
                </p>
              </div>
              <Link
                href="/voprosy"
                className="hidden flex-shrink-0 text-xs font-medium text-[var(--color-text)] underline decoration-[var(--color-border-strong)] decoration-2 underline-offset-4 transition hover:text-[var(--color-primary)] hover:decoration-[var(--color-primary)] sm:inline"
              >
                Задать вопрос
              </Link>
            </div>
          </div>
        </article>

        <div className="mt-6 sm:hidden">
          <Link
            href="/voprosy"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4"
          >
            Все вопросы →
          </Link>
        </div>
      </div>
    </section>
  );
}
