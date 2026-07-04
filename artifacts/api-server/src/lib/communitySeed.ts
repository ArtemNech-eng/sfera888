/**
 * Демо-сидирование и имитация активности гео-сообщества «ХочуТакже».
 *
 * Назначение: чтобы публичные разделы (/goroda/[city], /zhk/[zhk],
 * /pro/[specialty]) выглядели «живыми» на старте — до появления реального
 * пользовательского контента. Всё, что создаётся здесь, помечается
 * `is_seeded = true`, поэтому легко отличимо от реальных данных и не смешивается
 * с ними в аналитике/модерации.
 *
 * Данные проходят те же фильтры, что и реальные ленты (см. FeedService):
 *   • City_Feed  — zone='sosedi', scope='city', city_id=?, zhk_id IS NULL,
 *                  visibility='public', сортировка по last_activity_at.
 *   • Local_Feed — zone='sosedi', scope='zhk',  zhk_id=?, visibility='public',
 *                  сортировка по created_at.
 *   • PRO_Public — zone='pro_public', specialty_id=?, visibility='public'.
 *
 * Идемпотентность:
 *   • specialties / zhk — вставка через ON CONFLICT (slug) DO NOTHING.
 *   • города — помечаются флагами is_geo_covered/is_starter и добираются SEO
 *     через COALESCE (существующие значения не перезаписываются).
 *   • демо-темы — вставляются ТОЛЬКО если ни одной сид-темы ещё нет
 *     (`is_seeded = true`), чтобы рестарт сервера не затирал наработанную
 *     имитацию активности.
 *
 * Оба входа безопасно вызывать многократно. Включаются env-флагами (см. index.ts):
 *   COMMUNITY_SEED_ENABLED=true          — разовый сид на старте.
 *   COMMUNITY_ACTIVITY_SIM_ENABLED=true  — периодическая имитация активности.
 */

import {
  db,
  citiesTable,
  zhkTable,
  specialtiesTable,
  communityThreadsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

// ─── Конфигурация набора ─────────────────────────────────────────────────────

/** Стартовые города приоритетного развития (Requirement 17.1) — до 3 шт. */
const STARTER_CITY_SLUGS = ["krasnodar", "rostov-na-donu", "volgograd"];

/** Целевой SEO-набор (Requirement 16.1) — города, где включаем публичные страницы. */
const GEO_COVERED_CITY_SLUGS = [
  ...STARTER_CITY_SLUGS,
  "stavropol",
];

/** Специальности PRO_Zone (Requirement 6.1). */
const SPECIALTIES: { slug: string; name: string }[] = [
  { slug: "elektrik", name: "Электрик" },
  { slug: "santehnik", name: "Сантехник" },
  { slug: "plitochnik", name: "Плиточник" },
  { slug: "malyar-shtukatur", name: "Маляр-штукатур" },
  { slug: "otdelochnik", name: "Отделочник" },
  { slug: "dizajner-intererov", name: "Дизайнер интерьеров" },
];

/** Шаблоны ЖК (по 2 на город; итоговый slug = `${slug}-${citySlug}`). */
const ZHK_TEMPLATES: { name: string; slug: string; developer: string; completionDate: string }[] = [
  { name: "ЖК Парковый", slug: "parkovyy", developer: "СтройИнвест", completionDate: "2023" },
  { name: "ЖК Солнечный", slug: "solnechnyy", developer: "Мегаполис", completionDate: "2024" },
  { name: "ЖК Ривер Хаус", slug: "river-haus", developer: "Ак Барс Дом", completionDate: "2022" },
];
/** Сколько ЖК создавать на город. */
const ZHK_PER_CITY = 2;

/** Пул тем City_Feed (уровень города). */
const CITY_TOPICS: { title: string; body: string }[] = [
  { title: "Ищу проверенную бригаду для ремонта под ключ", body: "Планируем ремонт двушки, хочется работать с проверенными людьми. Кого посоветуете по району?" },
  { title: "Рекомендую электрика — работал аккуратно и в срок", body: "Делал разводку и щиток, всё чисто, цены адекватные. Пишите — поделюсь контактом." },
  { title: "Куда вывозить строительный мусор?", body: "Накопилось после демонтажа. Подскажите, кто вывозил и почём." },
  { title: "Осторожно: подрядчик пропал с предоплатой", body: "Делюсь опытом, чтобы соседи не попались. Договор обязательно, предоплату — минимально." },
  { title: "Обмен инструментом между соседями", body: "Есть перфоратор, плиткорез, уровень. Готов дать на время взамен." },
  { title: "Сколько по времени заняла у вас черновая отделка?", body: "Собираю статистику по нашему городу, интересно сравнить сроки и цены." },
  { title: "Хороший мастер по натяжным потолкам", body: "Сделали за день, без пыли, аккуратные углы. Рекомендую." },
  { title: "Вопрос по приёмке квартиры у застройщика", body: "На что смотреть в первую очередь? Стоит ли звать специалиста по приёмке?" },
];

/** Пул тем Local_Feed (уровень ЖК) с категориями Requirement 3.1. */
const LOCAL_TOPICS: { title: string; body: string; category: string }[] = [
  { title: "Плановое отключение воды в корпусе 2", body: "Завтра с 9 до 15 отключат холодную воду. Запаситесь заранее.", category: "utility_incident" },
  { title: "Трещина на фасаде — кто ещё заметил?", body: "Возле входной группы пошла трещина. Собираем обращения к застройщику.", category: "developer_defect" },
  { title: "Отдам в аренду перфоратор соседям", body: "Хороший Bosch, залог символический. Пишите в личку.", category: "tool_sharing" },
  { title: "Проверенный сантехник по нашему ЖК", body: "Менял стояк и смесители, работой довольны. Делюсь контактом.", category: "local_recommendation" },
  { title: "Не работает лифт в подъезде 3", body: "Второй день стоит, УК обещает мастера. Кто-нибудь дозвонился?", category: "utility_incident" },
  { title: "Рекомендация: мастер по плитке", body: "Санузел под ключ, ровные швы, уложился в смету. Советую.", category: "local_recommendation" },
];

/** Шаблоны PRO-тем (подставляется название специальности). */
const PRO_TOPIC_TEMPLATES: { title: (name: string) => string; body: string; isLocal: boolean }[] = [
  { title: (n) => `${n}: обсуждаем цены на работы в 2026`, body: "Поделитесь актуальными расценками по регионам — сравним и сориентируем клиентов.", isLocal: false },
  { title: (n) => `${n}: инструмент и лайфхаки`, body: "Что реально экономит время на объекте? Делимся приёмами и находками.", isLocal: false },
  { title: (n) => `${n}: сложный объект — как решили?`, body: "Разбираем нестандартную задачу и варианты решения. Локальное обсуждение по городу.", isLocal: true },
  { title: (n) => `${n}: частые ошибки новичков`, body: "Собираем чек-лист, чтобы не наступать на одни и те же грабли.", isLocal: false },
];

/** Верхняя граница количества сид-тем (защита от разрастания при имитации). */
const MAX_SEEDED_THREADS = 600;

// ─── Вспомогательное ─────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

/** Дата «N часов назад» — для разброса времени активности сид-контента. */
function hoursAgo(h: number): Date {
  return new Date(Date.now() - Math.round(h * HOUR_MS));
}

function citySeoTitle(name: string): string {
  return `Соседи ${name}: ЖК, ремонт, рекомендации`.slice(0, 70);
}
function cityH1(name: string): string {
  return `Сообщество соседей — ${name}`.slice(0, 100);
}
function cityBody(name: string): string {
  return (
    `Локальное сообщество жителей города ${name}: обсуждения по жилым комплексам, ` +
    `аварии ЖКХ, дефекты застройщиков, обмен инструментом и проверенные рекомендации ` +
    `мастеров. Задайте вопрос соседям или поделитесь опытом ремонта.`
  );
}

// ─── Сид ─────────────────────────────────────────────────────────────────────

export interface SeedResult {
  citiesMarked: number;
  zhkCreated: number;
  specialtiesEnsured: number;
  threadsCreated: number;
}

/**
 * Разовое демо-сидирование сообщества (идемпотентно). Возвращает сводку.
 */
export async function seedCommunityDemo(): Promise<SeedResult> {
  const result: SeedResult = { citiesMarked: 0, zhkCreated: 0, specialtiesEnsured: 0, threadsCreated: 0 };

  // 1. Специальности (ON CONFLICT DO NOTHING по slug).
  for (const s of SPECIALTIES) {
    await db
      .insert(specialtiesTable)
      .values({ slug: s.slug, name: s.name, isActive: true })
      .onConflictDoNothing({ target: specialtiesTable.slug });
  }
  result.specialtiesEnsured = SPECIALTIES.length;

  // 2. Пометить города целевого набора и добрать SEO (не перезаписывая существующее).
  await db
    .update(citiesTable)
    .set({ isGeoCovered: true })
    .where(inArray(citiesTable.slug, GEO_COVERED_CITY_SLUGS));
  await db
    .update(citiesTable)
    .set({ isStarter: true })
    .where(inArray(citiesTable.slug, STARTER_CITY_SLUGS));

  const cities = await db
    .select({ id: citiesTable.id, slug: citiesTable.slug, name: citiesTable.name })
    .from(citiesTable)
    .where(inArray(citiesTable.slug, GEO_COVERED_CITY_SLUGS));
  result.citiesMarked = cities.length;

  for (const c of cities) {
    await db
      .update(citiesTable)
      .set({
        seoTitle: sql`COALESCE(${citiesTable.seoTitle}, ${citySeoTitle(c.name)})`,
        h1: sql`COALESCE(${citiesTable.h1}, ${cityH1(c.name)})`,
        seoDescription: sql`COALESCE(${citiesTable.seoDescription}, ${citySeoTitle(c.name)})`,
        bodyMd: sql`COALESCE(${citiesTable.bodyMd}, ${cityBody(c.name)})`,
      })
      .where(eq(citiesTable.id, c.id));
  }

  if (cities.length === 0) {
    console.warn("[community-seed] ни один из целевых городов не найден в cities — пропускаю ЖК/темы");
    return result;
  }

  // 3. ЖК на каждый город (ON CONFLICT DO NOTHING по slug).
  for (const c of cities) {
    const slug = c.slug ?? "";
    if (!slug) continue;
    const templates = ZHK_TEMPLATES.slice(0, ZHK_PER_CITY);
    for (const t of templates) {
      const name = `${t.name} (${c.name})`.slice(0, 100);
      await db
        .insert(zhkTable)
        .values({
          slug: `${t.slug}-${slug}`.slice(0, 100),
          name,
          nameNormalized: name.trim().toLowerCase(),
          cityId: c.id,
          developer: t.developer,
          completionDate: t.completionDate,
          buildings: [{ name: "Корпус 1" }, { name: "Корпус 2" }],
          status: "LIVING",
          isSeeded: true,
          contentScore: 60,
          isIndexable: true,
          seoTitle: `${t.name} — соседи и мастера`.slice(0, 70),
          h1: t.name.slice(0, 100),
          bodyMd: `Сообщество жителей ${t.name} в городе ${c.name}: аварии, дефекты застройщика, рекомендации мастеров и обмен инструментом.`,
        })
        .onConflictDoNothing({ target: zhkTable.slug });
    }
  }

  const createdZhk = await db
    .select({ id: zhkTable.id, cityId: zhkTable.cityId })
    .from(zhkTable)
    .where(eq(zhkTable.isSeeded, true));
  result.zhkCreated = createdZhk.length;

  // 4. Демо-темы — досев ПО КАЖДОМУ городу/ЖК/специальности отдельно.
  // Для каждой цели вставляем демо-темы только если у неё ещё нет сид-тем —
  // это тонко идемпотентно: дозасевает новые цели, не дублирует существующие
  // и не затирает наработанную имитацию активности.
  const specialties = await db
    .select({ id: specialtiesTable.id, name: specialtiesTable.name })
    .from(specialtiesTable);

  const starterCity = cities.find((c) => STARTER_CITY_SLUGS.includes(c.slug ?? "")) ?? cities[0];

  type ThreadRow = typeof communityThreadsTable.$inferInsert;

  /** Единая форма строки — все колонки заданы явно (стабильный пакетный INSERT). */
  function makeThread(over: Partial<ThreadRow> & Pick<ThreadRow, "zone" | "scope" | "title" | "body">): ThreadRow {
    const when = over.createdAt ?? new Date();
    return {
      zone: over.zone,
      scope: over.scope,
      cityId: over.cityId ?? null,
      zhkId: over.zhkId ?? null,
      specialtyId: over.specialtyId ?? null,
      isLocal: over.isLocal ?? false,
      category: over.category ?? null,
      title: over.title,
      body: over.body,
      authorAccountId: over.authorAccountId ?? null,
      isSeeded: true,
      visibility: "public",
      lastActivityAt: over.lastActivityAt ?? when,
      createdAt: when,
    };
  }

  /** Есть ли уже сид-темы, удовлетворяющие условию? */
  async function seededExists(...conds: (ReturnType<typeof eq>)[]): Promise<boolean> {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(communityThreadsTable)
      .where(and(eq(communityThreadsTable.isSeeded, true), ...conds));
    return n > 0;
  }

  // City_Feed: темы уровня города (досев по городу).
  for (const c of cities) {
    if (await seededExists(eq(communityThreadsTable.scope, "city"), eq(communityThreadsTable.cityId, c.id))) continue;
    const rows = CITY_TOPICS.map((topic, i) => {
      const when = hoursAgo(i * 5 + Math.random() * 3);
      return makeThread({ zone: "sosedi", scope: "city", cityId: c.id, title: topic.title, body: topic.body, lastActivityAt: when, createdAt: when });
    });
    await db.insert(communityThreadsTable).values(rows);
    result.threadsCreated += rows.length;
  }

  // Local_Feed: темы уровня ЖК (досев по ЖК).
  for (const z of createdZhk) {
    if (await seededExists(eq(communityThreadsTable.scope, "zhk"), eq(communityThreadsTable.zhkId, z.id))) continue;
    const rows = LOCAL_TOPICS.map((topic, i) => {
      const when = hoursAgo(i * 8 + Math.random() * 4);
      return makeThread({ zone: "sosedi", scope: "zhk", zhkId: z.id, cityId: z.cityId, category: topic.category, title: topic.title, body: topic.body, lastActivityAt: when, createdAt: when });
    });
    await db.insert(communityThreadsTable).values(rows);
    result.threadsCreated += rows.length;
  }

  // PRO_Public: тематические темы по специальностям (досев по специальности).
  for (const sp of specialties) {
    if (await seededExists(eq(communityThreadsTable.zone, "pro_public"), eq(communityThreadsTable.specialtyId, sp.id))) continue;
    const rows = PRO_TOPIC_TEMPLATES.map((tpl, i) => {
      const when = hoursAgo(i * 6 + Math.random() * 3);
      return makeThread({
        zone: "pro_public",
        scope: "pro",
        specialtyId: sp.id,
        isLocal: tpl.isLocal,
        cityId: tpl.isLocal ? starterCity.id : null,
        title: tpl.title(sp.name),
        body: tpl.body,
        lastActivityAt: when,
        createdAt: when,
      });
    });
    await db.insert(communityThreadsTable).values(rows);
    result.threadsCreated += rows.length;
  }

  console.log(
    `[community-seed] готово: города=${result.citiesMarked}, ЖК=${result.zhkCreated}, ` +
      `специальности=${result.specialtiesEnsured}, новых тем=${result.threadsCreated}`,
  );
  return result;
}

// ─── Имитация активности ─────────────────────────────────────────────────────

/**
 * Один «тик» имитации активности:
 *   1. Бампает `last_activity_at = NOW()` у нескольких случайных сид-тем — ленты,
 *      отсортированные по активности (City_Feed / PRO), выглядят свежими.
 *   2. С некоторой вероятностью добавляет новую сид-тему City_Feed в случайном
 *      городе целевого набора (пока общее число сид-тем не превысило лимит).
 *
 * Полностью безопасно и идемпотентно по эффекту; работает только с
 * `is_seeded = true` строками, реальный пользовательский контент не трогает.
 */
export async function simulateCommunityActivity(): Promise<void> {
  // 1. Бамп активности у 2–4 случайных сид-тем.
  const bump = 2 + Math.floor(Math.random() * 3);
  await db.execute(sql`
    UPDATE community_threads
    SET last_activity_at = NOW()
    WHERE id IN (
      SELECT id FROM community_threads
      WHERE is_seeded = true
      ORDER BY random()
      LIMIT ${bump}
    )
  `);

  // 2. Иногда (≈40%) добавить свежую тему City_Feed, если не превышен лимит.
  if (Math.random() > 0.4) return;

  const [{ seeded }] = await db
    .select({ seeded: sql<number>`count(*)::int` })
    .from(communityThreadsTable)
    .where(eq(communityThreadsTable.isSeeded, true));
  if (seeded >= MAX_SEEDED_THREADS) return;

  const [city] = await db
    .select({ id: citiesTable.id })
    .from(citiesTable)
    .where(eq(citiesTable.isGeoCovered, true))
    .orderBy(sql`random()`)
    .limit(1);
  if (!city) return;

  const topic = CITY_TOPICS[Math.floor(Math.random() * CITY_TOPICS.length)];
  const now = new Date();
  await db.insert(communityThreadsTable).values({
    zone: "sosedi",
    scope: "city",
    cityId: city.id,
    zhkId: null,
    title: topic.title,
    body: topic.body,
    visibility: "public",
    isSeeded: true,
    lastActivityAt: now,
    createdAt: now,
  });
}
