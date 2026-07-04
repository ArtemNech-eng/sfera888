/**
 * Демо-сидирование и имитация активности гео-сообщества «ХочуТакже».
 *
 * Назначение: наполнить публичные разделы (/goroda/[city], /zhk/[zhk],
 * /pro/[specialty]) правдоподобным контентом до появления реальных
 * пользователей — с настоящими названиями ЖК, «болевыми» темами (приёмка,
 * дефекты застройщика, ЖКХ, звукоизоляция, отопление) и содержательными
 * обсуждениями с вложенными ответами. Всё помечается `is_seeded = true`.
 *
 * Данные проходят те же фильтры, что и реальные ленты (см. FeedService):
 *   • City_Feed  — zone='sosedi', scope='city', city_id=?, zhk_id IS NULL.
 *   • Local_Feed — zone='sosedi', scope='zhk',  zhk_id=?.
 *   • PRO_Public — zone='pro_public', specialty_id=?.
 * Комментарии — community_comments (дерево через parent_comment_id).
 *
 * Идемпотентность: специальности/ЖК — ON CONFLICT (slug) DO NOTHING; темы и
 * комментарии досеваются по каждой цели, только если у неё их ещё нет
 * (рестарт не затирает наработанную имитацию).
 *
 * Включается env-флагами (см. index.ts):
 *   COMMUNITY_SEED_ENABLED=true          — разовый сид на старте.
 *   COMMUNITY_ACTIVITY_SIM_ENABLED=true  — периодическая имитация активности.
 */

import {
  db,
  citiesTable,
  zhkTable,
  specialtiesTable,
  communityThreadsTable,
  communityCommentsTable,
  systemSettingsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

// ─── Конфигурация набора ─────────────────────────────────────────────────────

/** Стартовые города приоритетного развития (Requirement 17.1). */
const STARTER_CITY_SLUGS = ["krasnodar", "rostov-na-donu", "volgograd"];

/** Целевой SEO-набор (Requirement 16.1) — реальные города каталога (Южный ФО). */
const GEO_COVERED_CITY_SLUGS = [...STARTER_CITY_SLUGS, "stavropol"];

/** Специальности PRO_Zone (Requirement 6.1). */
const SPECIALTIES: { slug: string; name: string }[] = [
  { slug: "elektrik", name: "Электрик" },
  { slug: "santehnik", name: "Сантехник" },
  { slug: "plitochnik", name: "Плиточник" },
  { slug: "malyar-shtukatur", name: "Маляр-штукатур" },
  { slug: "otdelochnik", name: "Отделочник" },
  { slug: "dizajner-intererov", name: "Дизайнер интерьеров" },
];

/** Один засеваемый ЖК (реальные комплексы городов). */
interface ZhkSeed {
  name: string;
  slug: string;
  developer?: string;
}

/**
 * Реальные, узнаваемые ЖК/микрорайоны по городам. `developer` заполнен только
 * там, где связка достоверна; остальные атрибуты не выдумываем (не показываются
 * при пустом значении — Requirement 1.7).
 */
const ZHK_BY_CITY: Record<string, ZhkSeed[]> = {
  krasnodar: [
    { name: "ЖК Немецкая Деревня", slug: "nemetskaya-derevnya-krasnodar" },
    { name: "ЖК Панорама", slug: "panorama-krasnodar" },
    { name: "ЖК Родные Просторы", slug: "rodnye-prostory-krasnodar", developer: "ГК DOGMA" },
    { name: "ЖК Догма Парк", slug: "dogma-park-krasnodar", developer: "ГК DOGMA" },
    { name: "ЖК Восточно-Кругликовский", slug: "vostochno-kruglikovskiy-krasnodar" },
    { name: "ЖК Черёмушки", slug: "cheryomushki-krasnodar" },
  ],
  "rostov-na-donu": [
    { name: "ЖК Левенцовский", slug: "leventsovskiy-rostov" },
    { name: "Микрорайон Суворовский", slug: "suvorovskiy-rostov" },
    { name: "ЖК Норд", slug: "nord-rostov", developer: "ЮгСтройИнвест" },
    { name: "ЖК Красный Аксай", slug: "krasnyy-aksay-rostov" },
    { name: "ЖК Екатерининский", slug: "ekaterininskiy-rostov" },
    { name: "ЖК Западные Ворота", slug: "zapadnye-vorota-rostov" },
  ],
  volgograd: [
    { name: "ЖК Родниковая Долина", slug: "rodnikovaya-dolina-volgograd" },
    { name: "ЖК Парк Европейский", slug: "park-evropeyskiy-volgograd" },
    { name: "ЖК Комсомольский", slug: "komsomolskiy-volgograd" },
    { name: "ЖК Династия", slug: "dinastiya-volgograd" },
    { name: "ЖК Волжские Паруса", slug: "volzhskie-parusa-volgograd" },
  ],
  stavropol: [
    { name: "ЖК Гармония", slug: "garmoniya-stavropol", developer: "ЮгСтройИнвест" },
    { name: "Микрорайон Перспективный", slug: "perspektivnyy-stavropol", developer: "ЮгСтройИнвест" },
    { name: "ЖК Российский", slug: "rossiyskiy-stavropol" },
    { name: "ЖК Европейский", slug: "evropeyskiy-stavropol" },
    { name: "ЖК Гагарин Парк", slug: "gagarin-park-stavropol" },
  ],
};

// ─── Контент: темы с комментариями ───────────────────────────────────────────

interface SeedComment {
  body: string;
  /** Ответы на этот комментарий (один уровень вложенности). */
  replies?: string[];
}
interface SeedThread {
  category?: string | null;
  title: string;
  body: string;
  /** Для PRO — локальная ли тема (My_City_Filter). */
  isLocal?: boolean;
  comments: SeedComment[];
}

/** City_Feed — общегородские темы (покупки, бригады, приёмка, услуги). */
const CITY_THREADS: SeedThread[] = [
  {
    title: "Проверенная бригада для ремонта под ключ — с кем реально не пожалели?",
    body: "Беру квартиру в новостройке, черновая. Наслушался историй про переделки и «внезапные» доплаты. Поделитесь, с кем работали и остались довольны — по возможности с порядком цен и что входило в смету.",
    comments: [
      {
        body: "Делали двушку 54 м² под ключ прошлой осенью. Работа без материалов вышла ~8 500 ₽/м², черновая + чистовая. Обязательно смета построчно и оплата по этапам с приёмкой — иначе демонтаж, вынос мусора и штробление «вдруг» оказываются сверх сметы.",
        replies: [
          "8 500 сейчас адекватно. Зимой находил дешевле, но по швам плитки потом плакал.",
          "Скинете контакт бригады, если не жалко?",
        ],
      },
      {
        body: "Главное правило: предоплата не больше 30%, остальное по этапам. Один раз отдали 60% вперёд — бригада пропала на стяжке, доделывали другие за свой счёт. Договор с паспортными данными бригадира — минимальная защита.",
      },
    ],
  },
  {
    title: "Где реально дешевле брать материалы — базы или сетевые магазины?",
    body: "Считаю бюджет на черновую: профиль, гипсокартон, смеси. Где закупались и сколько удалось сэкономить против условного сетевого гипермаркета?",
    comments: [
      {
        body: "Смеси и профиль беру на оптовых базах — выходит на 15–20% дешевле сети, но нужна своя доставка. Кнауф-профиль и Волма по мешкам на поддоне ощутимо дешевле поштучно.",
        replies: ["Доставка не съедает разницу? Газель сейчас 2–3 тыс за ходку."],
      },
      {
        body: "По плитке проси «цену за м² с учётом боя 10%» — сразу видно реальную стоимость. Прямые склады дилеров дешевле шоурумов процентов на 20.",
      },
    ],
  },
  {
    title: "Как принимать квартиру у застройщика — брать приёмщика или самому?",
    body: "Скоро ключи. Стоит ли платить 4–5 тыс за приёмщика с тепловизором, или реально пройти по чек-листу самому? Что чаще всего находят?",
    comments: [
      {
        body: "Брал приёмщика — окупилось. Нашли отклонение стен от вертикали больше нормы, продувание окон и бухтящую стяжку. По акту застройщик всё устранял бесплатно, сам бы половину не увидел.",
        replies: [
          "А бухтение стяжки реально заставили переделать?",
          "Да, простукивание + в смотровой лист. Переделали участками.",
        ],
      },
      {
        body: "Если сами — минимум: правило 2 м, уровень, лист бумаги на продув окон, зарядка для проверки розеток. Не подписывайте акт с «претензий не имею», пока дефекты не внесены в смотровой лист.",
      },
    ],
  },
  {
    title: "Клининг после ремонта — сколько сейчас стоит и что входит?",
    body: "Ремонт заканчивается, сил на уборку ноль. Кто заказывал послестроительную уборку — по деньгам и качеству как?",
    comments: [
      {
        body: "Двушку убирали за 6,5 тыс — мойка окон, вынос мелкого мусора, обеспыливание, санузлы. Плёнку и наклейки с окон лучше снять заранее самим, иначе берут доплату.",
        replies: ["Окна почти всегда считают отдельно, уточняйте сразу."],
      },
    ],
  },
  {
    title: "Вывоз строительного мусора — Газель + грузчики, по цене?",
    body: "После демонтажа скопились мешки и старая сантехника. Кто вывозил — сколько вышло и есть ли нюансы с площадкой/пропуском?",
    comments: [
      {
        body: "Газель + 2 грузчика — 4 тыс за подъём с 7 этажа без лифта. Уточняйте, что мусор строительный (некоторые берут доплату за вес), и заранее оформляйте пропуск на площадку, иначе охрана не пустит.",
        replies: ["На нашу площадку без пропуска реально не заезжают, +полчаса на оформление."],
      },
    ],
  },
  {
    title: "Натяжные потолки — поделюсь опытом и реальной ценой",
    body: "Ставил в двух комнатах и коридоре. Расскажу, на чём можно сэкономить, а на чём нет, чтобы потом не переделывать.",
    comments: [
      {
        body: "Матовые белые без люстры (споты по периметру) вышли ~450 ₽/м² с монтажом. Совет: закладные под люстру и карниз обговаривайте ДО монтажа — потом переделка = новое полотно. Обход труб отопления просите с термокольцом.",
        replies: ["Споты по итогу дешевле люстры? Нам насчитали дороже из-за проводки."],
      },
    ],
  },
];

/** Local_Feed — темы уровня ЖК (категории Requirement 3.1). */
const LOCAL_THREADS: SeedThread[] = [
  {
    category: "developer_defect",
    title: "Трещины по стенам в новых квартирах — у кого так же?",
    body: "Заехали полгода назад, по углам комнаты пошли трещины по штукатурке, в одном месте расходится шов между плитой и стеной. УК кивает на «усадку». Собираем коллективное обращение к застройщику — кто с нами и что писали?",
    comments: [
      {
        body: "У нас в соседнем подъезде то же. Усадка усадкой, но гарантия на конструктив по ФЗ-214 — 5 лет. Пишите претензию заказным с фото и требованием акта осмотра. Волосяные по штукатурке — косметика, а расхождение плит — уже к экспертизе.",
        replies: [
          "Скинете шаблон претензии?",
          "После жалобы в Госстройнадзор застройщик зашевелился за неделю.",
        ],
      },
      {
        body: "Не подписывайте акт устранения, пока реально не заделают и не отсохнет. У нас замазали, через месяц треснуло снова — хорошо, что акт не закрыли.",
      },
    ],
  },
  {
    category: "utility_incident",
    title: "Отключили горячую воду без предупреждения — куда звонить?",
    body: "Второй день нет ГВС, объявлений не было, в УК не дозвониться. Что делать и положен ли перерасчёт?",
    comments: [
      {
        body: "Превышение норматива по ГВС (суммарно больше 8 часов в месяц, единовременно больше 8 ч при аварии) — основание для перерасчёта. Звоните в аварийно-диспетчерскую, требуйте зафиксировать актом, затем заявление на перерасчёт.",
        replies: ["Спасибо, не знал про нормативы. Аварийка хоть трубку берёт?"],
      },
      {
        body: "Если УК молчит — жалоба в ГЖИ через ГИС ЖКХ. После этого обычно перезванивают сами.",
      },
    ],
  },
  {
    category: "developer_defect",
    title: "Продувают окна и туго закрывается фурнитура — это гарантия?",
    body: "Зимой из-под створок тянет, ручка закрывается с усилием. Дом на гарантии. Регулировать самому или требовать с застройщика?",
    comments: [
      {
        body: "Окна входят в гарантию застройщика. Сначала заявка на регулировку — часто хватает перевода фурнитуры в зимний режим и замены уплотнителя. Если раму повело — меняют по гарантии.",
        replies: ["Зимний режим реально помог, дуть перестало. Эксцентрики повернул шестигранником."],
      },
    ],
  },
  {
    category: "utility_incident",
    title: "Слабый напор воды на верхних этажах",
    body: "Живём на 16-м, вечером напор падает почти до струйки, газовая колонка не запускается. У кого решилось и как?",
    comments: [
      {
        body: "Это к УК: на верхние этажи должна работать повысительная насосная станция, её часто экономят или неправильно настраивают. Коллективная заявка + требование замера давления на вводе в квартиру (норматив не ниже 0,3 атм).",
        replies: ["Нам после коллективки поставили частотник на насос — стало нормально."],
      },
    ],
  },
  {
    category: "local_recommendation",
    title: "Проверенный плиточник по нашему ЖК — делюсь контактом",
    body: "Делал санузел под ключ: ровные швы, уложился в смету и в срок. Работой доволен, поэтому рекомендую соседям.",
    comments: [
      {
        body: "Подтверждаю, у нас он же клал в ванной — раскладку продумал так, чтобы подрезка ушла в угол за унитаз. Гидроизоляцию делал обмазочную в два слоя с заходом на стены.",
        replies: ["А по цене за м² укладки сейчас как?"],
      },
    ],
  },
  {
    category: "developer_defect",
    title: "Слышно соседей через стену — как боролись со звукоизоляцией?",
    body: "Межквартирная перегородка тонкая, слышно разговоры и телевизор. Кто реально улучшил ситуацию и каким «пирогом»?",
    comments: [
      {
        body: "Каркас на виброподвесах, отступ от стены, минвата (именно акустическая) + две плиты ГКЛ, герметизация примыканий. Съедает ~8 см, зато разговоры уходят. Наклеить рулонную «шумоизоляцию» 2 см — деньги на ветер, воздушный шум она не берёт.",
        replies: [
          "Подтверждаю, тонкие рулонные материалы почти не работают.",
          "А розетки в общей стене развязывали? Через них хорошо слышно.",
        ],
      },
    ],
  },
  {
    category: "utility_incident",
    title: "Холодные батареи в угловой квартире",
    body: "Отопление дали, но верх батареи горячий, низ холодный, в угловой комнате прохладно. Что делать?",
    comments: [
      {
        body: "Сначала развоздушить через кран Маевского. Не помогло — заявка в УК на промывку/балансировку стояка. Требуйте замер температуры (для угловой комнаты норматив 20 °C, ночью не ниже 18 °C), при недоборе — перерасчёт.",
        replies: ["Кран Маевского реально спас, воздух стравил — потеплело."],
      },
    ],
  },
  {
    category: "local_recommendation",
    title: "Какой провайдер стабильнее работает в доме?",
    body: "Переехали, выбираю интернет. Кто каким пользуется и как со стабильностью вечером?",
    comments: [
      {
        body: "У нас в дом заведены два оператора по оптике до квартиры, вечерних просадок нет ни у одного — разница в цене и техподдержке. Уточните у УК, кого реально пускали в дом: не все заходят.",
        replies: ["Спасибо, позвоню в УК уточнить список."],
      },
    ],
  },
  {
    category: "tool_sharing",
    title: "Отдам соседям на время перфоратор и стремянку",
    body: "Ремонт закончил, инструмент простаивает. Перфоратор и стремянка 5 ступеней — соседям по ЖК бесплатно, под залог.",
    comments: [
      {
        body: "Отличная инициатива! Давайте заведём чат ЖК под обмен инструментом — плиткорез, лазерный уровень, строительный пылесос по кругу гоняем, всем экономия.",
        replies: ["Поддерживаю, у меня есть лазерный уровень, могу давать."],
      },
    ],
  },
  {
    category: "developer_defect",
    title: "Стяжка бухтит и есть перепады — принимать или нет?",
    body: "На приёмке простучал стяжку — местами глухой звук, правилом ловлю перепады до сантиметра. Застройщик говорит «в допуске». Так ли это?",
    comments: [
      {
        body: "Перепад больше 2 мм на 2 м под чистовой пол — уже проблема, под ламинат/плитку критично. Бухтение = отслоение от плиты, со временем трескается. Вносите в смотровой лист с фото и требованием устранения, не подписывайте «без претензий».",
        replies: [
          "У нас переделали участками после внесения в акт.",
          "Под наливной пол потом всё равно ровнял, но с застройщика хоть материалы отбил.",
        ],
      },
    ],
  },
];

/** PRO_Public — профессиональные темы специальности (name подставляется). */
function proThreads(name: string): SeedThread[] {
  return [
    {
      title: `${name}: реальные расценки 2026 — скидываемся по операциям`,
      body: "Клиенты вечно спрашивают «почему так дорого». Давайте соберём актуальные расценки по операциям, чтобы ориентировать и себя, и заказчика. Пишите город и цену за единицу.",
      comments: [
        {
          body: "По югу работа держится, материалы скакнули. Ставлю ценник от объёма: на большом метраже за единицу дешевле, на мелочёвке — минималка за выезд, иначе не окупается дорога.",
          replies: ["Плюсую про минималку за выезд, без неё мелкие заказы уходят в минус."],
        },
      ],
    },
    {
      title: `${name}: как считаете смету, чтобы не уйти в минус?`,
      body: "На старте часто недооцениваю подготовку и мелочёвку (крепёж, расходники, вывоз). Как закладываете это в смету, чтобы потом не доплачивать из своего кармана?",
      comments: [
        {
          body: "Закладываю 10–15% на расходники и бой, отдельной строкой «непредвиденное» с согласованием. Демонтаж и вынос — всегда отдельно: это самая частая причина споров с заказчиком.",
        },
      ],
    },
    {
      title: `${name}: инструмент, который реально окупился`,
      body: "Из последнего — что купили и не пожалели? Делимся, чтобы новички не сливали деньги на ненужное.",
      comments: [
        {
          body: "Лазерный уровень нормального бренда окупился за пару объектов — скорость разметки в разы. Дешёвый врал по вертикали, перепроверял вручную, смысл терялся.",
          replies: ["Какой конкретно взяли?"],
        },
      ],
    },
    {
      isLocal: true,
      title: `${name}: сложный объект в городе — как решали?`,
      body: "Поделюсь нестандартной задачей с последнего объекта и хочу услышать, как бы подошли вы. Обсуждение локальное, по нашему городу.",
      comments: [
        {
          body: "Сталкивался с похожим. Ключевое — не гнать сроки в ущерб подготовке основания, потом переделка дороже. По городу подскажу, где брали материал под такую задачу.",
        },
      ],
    },
    {
      title: `${name}: частые косяки на приёмке — собираем чек-лист`,
      body: "Давайте соберём список, на чём чаще всего «ловит» заказчик и что реально косяк, а что придирка.",
      comments: [
        {
          body: "Топ претензий: неровные швы и углы, перепады под финиш, следы инструмента. Фотофиксирую этапы — снимает 90% споров, когда заказчик «вспоминает» то, чего не было.",
        },
      ],
    },
  ];
}

/** Follow-up комментарии для имитации активности. */
const FOLLOWUP_COMMENTS = [
  "Подниму тему — актуально.",
  "Спасибо, пригодилось!",
  "У нас та же ситуация, будем решать по вашему совету.",
  "Отпишусь по результату.",
  "Кто-нибудь сталкивался с этим в этом году?",
];

/** Верхняя граница числа сид-тем (защита от разрастания при имитации). */
const MAX_SEEDED_THREADS = 800;

/**
 * Версия демо-контента. При изменении наполнения — поднять версию: тогда на
 * ближайшем сиде старый сид-контент (is_seeded) очищается и пересевается новым
 * (однократно на версию, не на каждый рестарт). Ключ хранится в system_settings.
 */
const CONTENT_VERSION = "2026-01-realistic-v2";
const SEED_VERSION_KEY = "community_seed_version";

// ─── Вспомогательное ─────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
function hoursAgo(h: number): Date {
  return new Date(Date.now() - Math.round(h * HOUR_MS));
}
function pickRotating<T>(pool: T[], seed: number, count: number): T[] {
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) out.push(pool[(seed + i) % pool.length]!);
  return out;
}
function citySeoTitle(name: string): string {
  return `Соседи ${name}: ЖК, ремонт, рекомендации`.slice(0, 70);
}
function cityH1(name: string): string {
  return `Сообщество соседей — ${name}`.slice(0, 100);
}
function cityBody(name: string): string {
  return (
    `Локальное сообщество жителей города ${name}: приёмка квартир и дефекты застройщиков, ` +
    `аварии и перерасчёты ЖКХ, звукоизоляция и отопление, проверенные мастера и обмен инструментом. ` +
    `Задайте вопрос соседям или поделитесь опытом ремонта.`
  );
}

// ─── Сид ─────────────────────────────────────────────────────────────────────

export interface SeedResult {
  citiesMarked: number;
  zhkCreated: number;
  specialtiesEnsured: number;
  threadsCreated: number;
  commentsCreated: number;
}

interface ThreadContext {
  zone: string;
  scope: string;
  cityId?: number | null;
  zhkId?: number | null;
  specialtyId?: number | null;
  isLocal?: boolean;
}

/** Разовое демо-сидирование сообщества (идемпотентно). */
export async function seedCommunityDemo(): Promise<SeedResult> {
  const result: SeedResult = {
    citiesMarked: 0,
    zhkCreated: 0,
    specialtiesEnsured: 0,
    threadsCreated: 0,
    commentsCreated: 0,
  };

  // 0. Версия контента: при новой версии — однократный вайп старого сид-контента
  //    (фейковые ЖК/детские темы предыдущих версий), затем пересев ниже.
  const prevVersion = await getSetting(SEED_VERSION_KEY);
  const freshContent = prevVersion !== CONTENT_VERSION;
  if (freshContent) {
    await wipeSeededContent();
    console.log(`[community-seed] контент обновлён до ${CONTENT_VERSION} — старый сид-контент очищен`);
  }

  // 1. Специальности.
  for (const s of SPECIALTIES) {
    await db
      .insert(specialtiesTable)
      .values({ slug: s.slug, name: s.name, isActive: true })
      .onConflictDoNothing({ target: specialtiesTable.slug });
  }
  result.specialtiesEnsured = SPECIALTIES.length;

  // 2. Пометить целевые города + добрать SEO (не перезаписывая существующее).
  await db.update(citiesTable).set({ isGeoCovered: true }).where(inArray(citiesTable.slug, GEO_COVERED_CITY_SLUGS));
  await db.update(citiesTable).set({ isStarter: true }).where(inArray(citiesTable.slug, STARTER_CITY_SLUGS));

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
    console.warn("[community-seed] целевые города не найдены в cities — пропускаю ЖК/темы");
    return result;
  }

  // 3. Реальные ЖК по городам.
  for (const c of cities) {
    const seeds = ZHK_BY_CITY[c.slug ?? ""] ?? [];
    for (const z of seeds) {
      const nn = z.name.trim().toLowerCase();
      await db
        .insert(zhkTable)
        .values({
          slug: z.slug,
          name: z.name,
          nameNormalized: nn,
          cityId: c.id,
          developer: z.developer ?? null,
          status: "LIVING",
          isSeeded: true,
          contentScore: 70,
          isIndexable: true,
          seoTitle: `${z.name} — соседи и мастера`.slice(0, 70),
          h1: z.name.slice(0, 100),
          bodyMd:
            `Сообщество жителей ${z.name} (${c.name}): приёмка и дефекты застройщика, аварии ЖКХ, ` +
            `рекомендации проверенных мастеров и обмен инструментом.`,
        })
        .onConflictDoNothing({ target: zhkTable.slug });
    }
  }

  const seededZhk = await db
    .select({ id: zhkTable.id, cityId: zhkTable.cityId, name: zhkTable.name })
    .from(zhkTable)
    .where(eq(zhkTable.isSeeded, true));
  result.zhkCreated = seededZhk.length;

  const specialties = await db
    .select({ id: specialtiesTable.id, name: specialtiesTable.name })
    .from(specialtiesTable);
  const starterCity = cities.find((c) => STARTER_CITY_SLUGS.includes(c.slug ?? "")) ?? cities[0]!;

  // 4. City_Feed — все городские темы на каждый город (досев по городу).
  for (const c of cities) {
    if (await seededExists(eq(communityThreadsTable.scope, "city"), eq(communityThreadsTable.cityId, c.id))) continue;
    let idx = 0;
    for (const t of CITY_THREADS) {
      const when = hoursAgo(idx * 26 + Math.random() * 10);
      result.commentsCreated += await insertThreadWithComments({ zone: "sosedi", scope: "city", cityId: c.id }, t, when);
      result.threadsCreated += 1;
      idx += 1;
    }
  }

  // 5. Local_Feed — по 4 темы на ЖК (ротация пула, досев по ЖК).
  for (const z of seededZhk) {
    if (await seededExists(eq(communityThreadsTable.scope, "zhk"), eq(communityThreadsTable.zhkId, z.id))) continue;
    const topics = pickRotating(LOCAL_THREADS, z.id, 4);
    let idx = 0;
    for (const t of topics) {
      const when = hoursAgo(idx * 30 + Math.random() * 12);
      result.commentsCreated += await insertThreadWithComments(
        { zone: "sosedi", scope: "zhk", zhkId: z.id, cityId: z.cityId },
        t,
        when,
      );
      result.threadsCreated += 1;
      idx += 1;
    }
  }

  // 6. PRO_Public — темы специальности (досев по специальности).
  for (const sp of specialties) {
    if (await seededExists(eq(communityThreadsTable.zone, "pro_public"), eq(communityThreadsTable.specialtyId, sp.id))) continue;
    let idx = 0;
    for (const t of proThreads(sp.name)) {
      const when = hoursAgo(idx * 22 + Math.random() * 9);
      result.commentsCreated += await insertThreadWithComments(
        {
          zone: "pro_public",
          scope: "pro",
          specialtyId: sp.id,
          isLocal: t.isLocal ?? false,
          cityId: t.isLocal ? starterCity.id : null,
        },
        t,
        when,
      );
      result.threadsCreated += 1;
      idx += 1;
    }
  }

  console.log(
    `[community-seed] готово: города=${result.citiesMarked}, ЖК=${result.zhkCreated}, ` +
      `специальности=${result.specialtiesEnsured}, новых тем=${result.threadsCreated}, ` +
      `новых комментариев=${result.commentsCreated}`,
  );

  if (freshContent) await setSetting(SEED_VERSION_KEY, CONTENT_VERSION);
  return result;
}

/** Чтение значения system_settings по ключу. */
async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

/** Запись значения system_settings (upsert). */
async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value, updatedAt: new Date() } });
}

/**
 * Однократная очистка старого демо-контента (только is_seeded): комментарии →
 * темы → ЖК. Реальные данные пользователей (is_seeded=false) не трогаются.
 */
async function wipeSeededContent(): Promise<void> {
  await db.delete(communityCommentsTable).where(eq(communityCommentsTable.isSeeded, true));
  await db.delete(communityThreadsTable).where(eq(communityThreadsTable.isSeeded, true));
  await db.delete(zhkTable).where(eq(zhkTable.isSeeded, true));
}

/** Есть ли уже сид-темы, удовлетворяющие условию? */
async function seededExists(...conds: (ReturnType<typeof eq>)[]): Promise<boolean> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(communityThreadsTable)
    .where(and(eq(communityThreadsTable.isSeeded, true), ...conds));
  return n > 0;
}

/**
 * Вставить тему с деревом комментариев. Комментарии распределяются по времени
 * между созданием темы и «сейчас»; `last_activity_at` темы = время последнего
 * комментария (ленты, отсортированные по активности, выглядят живыми).
 * Возвращает число созданных комментариев.
 */
async function insertThreadWithComments(
  ctx: ThreadContext,
  thread: SeedThread,
  createdAt: Date,
): Promise<number> {
  const [row] = await db
    .insert(communityThreadsTable)
    .values({
      zone: ctx.zone,
      scope: ctx.scope,
      cityId: ctx.cityId ?? null,
      zhkId: ctx.zhkId ?? null,
      specialtyId: ctx.specialtyId ?? null,
      isLocal: ctx.isLocal ?? false,
      category: thread.category ?? null,
      title: thread.title,
      body: thread.body,
      isSeeded: true,
      visibility: "public",
      createdAt,
      lastActivityAt: createdAt,
    })
    .returning({ id: communityThreadsTable.id });

  const threadId = row!.id;
  let created = 0;
  let last = createdAt;
  const step = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / ((thread.comments.length + 1) * HOUR_MS)));

  let offset = 1;
  for (const c of thread.comments) {
    const when = new Date(createdAt.getTime() + offset * step * HOUR_MS);
    offset += 1;
    const [top] = await db
      .insert(communityCommentsTable)
      .values({ threadId, body: c.body, isSeeded: true, visibility: "public", createdAt: when })
      .returning({ id: communityCommentsTable.id });
    created += 1;
    if (when > last) last = when;

    for (const reply of c.replies ?? []) {
      const rwhen = new Date(when.getTime() + Math.round((0.3 + Math.random() * 0.6) * HOUR_MS));
      await db.insert(communityCommentsTable).values({
        threadId,
        parentCommentId: top!.id,
        body: reply,
        isSeeded: true,
        visibility: "public",
        createdAt: rwhen,
      });
      created += 1;
      if (rwhen > last) last = rwhen;
    }
  }

  await db.update(communityThreadsTable).set({ lastActivityAt: last }).where(eq(communityThreadsTable.id, threadId));
  return created;
}

// ─── Имитация активности ─────────────────────────────────────────────────────

/**
 * Один «тик» имитации: бампает `last_activity_at` у нескольких случайных
 * сид-тем и с некоторой вероятностью добавляет follow-up комментарий к случайной
 * теме (свежая активность в обсуждениях). Работает только с `is_seeded=true`.
 */
export async function simulateCommunityActivity(): Promise<void> {
  // 1. Бамп активности 2–4 случайных тем.
  const bump = 2 + Math.floor(Math.random() * 3);
  await db.execute(sql`
    UPDATE community_threads SET last_activity_at = NOW()
    WHERE id IN (
      SELECT id FROM community_threads WHERE is_seeded = true ORDER BY random() LIMIT ${bump}
    )
  `);

  // 2. С вероятностью ~50% — новый follow-up комментарий к случайной теме.
  if (Math.random() > 0.5) return;

  const [{ seeded }] = await db
    .select({ seeded: sql<number>`count(*)::int` })
    .from(communityThreadsTable)
    .where(eq(communityThreadsTable.isSeeded, true));
  if (seeded === 0 || seeded >= MAX_SEEDED_THREADS + 400) return;

  const [thread] = await db
    .select({ id: communityThreadsTable.id })
    .from(communityThreadsTable)
    .where(eq(communityThreadsTable.isSeeded, true))
    .orderBy(sql`random()`)
    .limit(1);
  if (!thread) return;

  const body = FOLLOWUP_COMMENTS[Math.floor(Math.random() * FOLLOWUP_COMMENTS.length)]!;
  await db.insert(communityCommentsTable).values({
    threadId: thread.id,
    body,
    isSeeded: true,
    visibility: "public",
  });
  await db
    .update(communityThreadsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(communityThreadsTable.id, thread.id));
}
