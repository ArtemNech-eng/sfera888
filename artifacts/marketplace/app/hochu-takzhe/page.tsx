import type { Metadata } from "next";
import { publicUrl } from "../../lib/env";
import { DesignConfigurator } from "../../components/dizajn/DesignConfigurator";

/**
 * `/hochu-takzhe` — продукт «Хочу также»: визуальный конфигуратор дизайна
 * интерьера с премиальной тёмной стилистикой.
 *
 * Отличие от `/ai-design`: «лёгкий» потребительский сценарий — выбор
 * карточек (тип комнаты / стиль / палитра / бюджет / площадь) без ввода
 * размеров вручную, с клиентской квотой бесплатных генераций и пейволлом
 * (см. lib/useGenerationQuota + components/dizajn/PaywallModal).
 *
 * Под капотом использует тот же рабочий пайплайн, что и /ai-design
 * (`POST /api/dizajn/generate` → worker → polling на `/dizajn/{slug}`),
 * поэтому генерация выдаёт коллаж 2×2 одной и той же комнаты в разных
 * ракурсах. Ключи fal/OpenRouter остаются на api-server.
 */

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "Хочу также — соберите дизайн интерьера за минуты" },
    description:
      "Выберите тип комнаты, стиль, палитру и бюджет — нейросеть нарисует ваш интерьер в четырёх ракурсах. Первые генерации бесплатно, без регистрации.",
    alternates: { canonical: `${publicUrl()}/hochu-takzhe` },
  };
}

export default function HochuTakzhePage() {
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <DesignConfigurator turnstileSiteKey={turnstileSiteKey} />
      </div>
    </section>
  );
}
