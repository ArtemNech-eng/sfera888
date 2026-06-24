/**
 * Сид `cities.work_coefficient_kopeks_per_sqm` для AI_Design_Product
 * (Requirement 11.4).
 *
 * Запускается вручную или из CI/CD после миграции
 * `2026-01-15-ai-design-product.sql`:
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/seedCityCoefficients.ts
 *
 * Что делает:
 *   • Проставляет значения коэффициента стоимости работ (₽ × 100 за 1 м²
 *     площади помещения) для топ-30 городов России. Цифры подобраны как
 *     ориентир по средним рыночным ценам на чистовую отделку «под ключ»
 *     в 2025–2026 гг. — точные значения легко правятся в `CITY_COEFFICIENTS`
 *     ниже, скрипт идемпотентен.
 *   • Идемпотентно: один UPDATE на каждый город (`UPDATE cities SET … WHERE
 *     name = ?`), повторный запуск перезаписывает значения по тем же ключам
 *     и не создаёт дубликатов. Города, которых нет в таблице `cities`,
 *     пропускаются с предупреждением — скрипт не падает (CRM может
 *     добавлять города отдельно, и порядок применения сидов не должен
 *     блокировать миграцию).
 *   • Для всех остальных городов колонка остаётся `NULL` и
 *     `Materials_Estimator` использует общероссийский дефолт
 *     `DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800_000` (Requirement 11.4).
 *
 * Цены в копейках за 1 м² помещения (площадь комнаты, не поверхностей):
 *   • Москва — 1 500 000 (15 000 ₽/м²)
 *   • Санкт-Петербург — 1 300 000
 *   • Города-миллионники Урала/Поволжья/Юга — 1 000 000
 *   • Крупные региональные центры — 750 000–900 000
 */

import { db, pool, citiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface CityCoefficient {
  /** Точное имя города как в `cities.name` (`text NOT NULL UNIQUE`). */
  name: string;
  /** Коэффициент в копейках за 1 м² помещения (₽ × 100). */
  workCoefficientKopeksPerSqm: number;
}

/**
 * Топ-30 городов России по численности населения. Значения коэффициента —
 * ориентир по средним ценам на чистовую отделку с учётом региональной
 * разницы стоимости рабочей силы и материалов. Источник цифр — Requirement
 * 11.4 (см. шапку файла), правится без миграции.
 */
export const CITY_COEFFICIENTS: readonly CityCoefficient[] = [
  // Столицы — самые высокие коэффициенты.
  { name: "Москва", workCoefficientKopeksPerSqm: 1_500_000 },
  { name: "Санкт-Петербург", workCoefficientKopeksPerSqm: 1_300_000 },

  // Миллионники — 10 000 ₽/м².
  { name: "Новосибирск", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Екатеринбург", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Казань", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Нижний Новгород", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Челябинск", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Самара", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Омск", workCoefficientKopeksPerSqm: 1_000_000 },
  { name: "Ростов-на-Дону", workCoefficientKopeksPerSqm: 1_000_000 },

  // Крупные региональные центры — 9 000 ₽/м².
  { name: "Уфа", workCoefficientKopeksPerSqm: 900_000 },
  { name: "Красноярск", workCoefficientKopeksPerSqm: 900_000 },
  { name: "Воронеж", workCoefficientKopeksPerSqm: 900_000 },
  { name: "Пермь", workCoefficientKopeksPerSqm: 900_000 },
  { name: "Волгоград", workCoefficientKopeksPerSqm: 900_000 },
  { name: "Краснодар", workCoefficientKopeksPerSqm: 900_000 },

  // Средние города — 8 000 ₽/м² (совпадает с общероссийским дефолтом).
  { name: "Саратов", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Тюмень", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Тольятти", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Ижевск", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Барнаул", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Ульяновск", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Иркутск", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Хабаровск", workCoefficientKopeksPerSqm: 800_000 },
  { name: "Ярославль", workCoefficientKopeksPerSqm: 800_000 },

  // Замыкающие топ-30 — 7 500 ₽/м².
  { name: "Махачкала", workCoefficientKopeksPerSqm: 750_000 },
  { name: "Владивосток", workCoefficientKopeksPerSqm: 750_000 },
  { name: "Оренбург", workCoefficientKopeksPerSqm: 750_000 },
  { name: "Томск", workCoefficientKopeksPerSqm: 750_000 },
  { name: "Кемерово", workCoefficientKopeksPerSqm: 750_000 },
  { name: "Рязань", workCoefficientKopeksPerSqm: 750_000 },
];

interface SeedResult {
  /** Города, для которых UPDATE затронул ровно одну строку. */
  updated: string[];
  /** Города, отсутствующие в таблице `cities` — пропущены с warning. */
  skipped: string[];
}

/**
 * Применить коэффициенты к таблице `cities`. Идемпотентно: каждый город
 * получает свой `UPDATE … WHERE name = ?`. Если строки с таким именем нет,
 * город попадает в `skipped` (без падения скрипта).
 */
export async function seedCityCoefficients(
  rows: readonly CityCoefficient[] = CITY_COEFFICIENTS,
): Promise<SeedResult> {
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const result = await db
      .update(citiesTable)
      .set({ workCoefficientKopeksPerSqm: row.workCoefficientKopeksPerSqm })
      .where(eq(citiesTable.name, row.name))
      .returning({ id: citiesTable.id });

    if (result.length === 0) {
      skipped.push(row.name);
      console.warn(
        `[seedCityCoefficients] city not found in DB, skipping: ${row.name}`,
      );
    } else {
      updated.push(row.name);
    }
  }

  return { updated, skipped };
}

async function main(): Promise<void> {
  if (!process.env["DATABASE_URL"]) {
    console.error("[seedCityCoefficients] DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log(
    `[seedCityCoefficients] applying coefficients for ${CITY_COEFFICIENTS.length} cities`,
  );

  const { updated, skipped } = await seedCityCoefficients();

  console.log(`[seedCityCoefficients] updated=${updated.length} skipped=${skipped.length}`);
  if (skipped.length > 0) {
    console.log(`  skipped (not in cities table): ${skipped.join(", ")}`);
  }
}

// Main guard — позволяет импортировать `CITY_COEFFICIENTS` и
// `seedCityCoefficients` из тестов или других сидов, не запуская при этом
// CLI-эффекты (`process.exit`, `pool.end`). На Windows `process.argv[1]`
// приходит как backslash-путь, а `import.meta.url` — как `file:///` URL,
// поэтому нормализуем через `pathToFileURL`.
const { pathToFileURL } = await import("node:url");
const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[seedCityCoefficients] fatal:", err);
      try {
        await pool.end();
      } catch {
        // pool already closed — ignore
      }
      process.exit(1);
    });
}
