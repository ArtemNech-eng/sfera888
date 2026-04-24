import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Inbox,
  MapPin,
  Phone,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";

type ColumnKey =
  | "new"
  | "waiting_master"
  | "no_estimate"
  | "estimate_unpaid"
  | "estimate_paid"
  | "commission_left"
  | "closed_24h"
  | "problem";

type Card = {
  id: string;
  leadId: number;
  title: string;
  address: string;
  master?: string;
  timeInStage: string;
  money?: { kind: "estimate" | "paid" | "commission"; amount: number };
  bot?: { action: string; eta: string; tone?: "ok" | "warn" | "bad" };
  badge?: { text: string; tone: "ok" | "warn" | "bad" | "info" };
};

type Column = {
  key: ColumnKey;
  title: string;
  emoji: string;
  count: number;
  sum?: number;
  hint: string;
  cards: Card[];
  expanded?: boolean;
  accent: string;
};

const columns: Column[] = [
  {
    key: "new",
    emoji: "🆕",
    title: "Новые",
    hint: "автоматически уходят в рассылку",
    count: 47,
    cards: [
      {
        id: "n1",
        leadId: 18342,
        title: "Не работает варочная панель Bosch",
        address: "Москва, Ленинский пр-т, 84",
        timeInStage: "2 мин",
        bot: { action: "разошлю мастерам через", eta: "1 мин", tone: "ok" },
        badge: { text: "автопул", tone: "info" },
      },
      {
        id: "n2",
        leadId: 18341,
        title: "Подключение посудомойки Electrolux",
        address: "Химки, ул. Молодёжная, 12",
        timeInStage: "6 мин",
        bot: { action: "разослано 14 мастерам", eta: "ждём отклик", tone: "ok" },
      },
    ],
    accent: "border-l-sky-400",
  },
  {
    key: "waiting_master",
    emoji: "📡",
    title: "Ждут мастера",
    hint: "рассылка ушла, ждём отклик",
    count: 12,
    cards: [
      {
        id: "w1",
        leadId: 18338,
        title: "Стиральная LG не сливает",
        address: "Москва, Профсоюзная 122",
        timeInStage: "47 мин",
        bot: { action: "повторная рассылка через", eta: "13 мин", tone: "warn" },
        badge: { text: "0 откликов", tone: "warn" },
      },
      {
        id: "w2",
        leadId: 18336,
        title: "Холодильник Samsung — шум",
        address: "Балашиха, Свердлова 8",
        timeInStage: "1ч 12м",
        bot: { action: "расширю радиус до 25км", eta: "сейчас", tone: "warn" },
      },
    ],
    accent: "border-l-amber-400",
  },
  {
    key: "no_estimate",
    emoji: "📋",
    title: "Без сметы",
    hint: "мастер взял, но сметы нет",
    count: 38,
    cards: [
      {
        id: "e1",
        leadId: 18329,
        title: "ТВ Sony — нет изображения",
        address: "Москва, Сокольники",
        master: "Алексей К.",
        timeInStage: "3ч 42м",
        bot: { action: "напомню мастеру", eta: "через 18 мин", tone: "warn" },
      },
      {
        id: "e2",
        leadId: 18324,
        title: "Котёл Vaillant — нет розжига",
        address: "Одинцово, Можайское ш. 64",
        master: "Игорь Т.",
        timeInStage: "26ч",
        bot: { action: "эскалация в Проблему через", eta: "2ч", tone: "bad" },
        badge: { text: "просрочка", tone: "bad" },
      },
      {
        id: "e3",
        leadId: 18321,
        title: "Кофемашина Saeco — не варит",
        address: "Москва, Тверская 6",
        master: "Сергей Р.",
        timeInStage: "5ч 10м",
        bot: { action: "ждём смету", eta: "норма", tone: "ok" },
      },
    ],
    accent: "border-l-violet-400",
  },
  {
    key: "estimate_unpaid",
    emoji: "💰",
    title: "Смета + ждём оплату",
    hint: "клиент должен оплатить аванс",
    count: 29,
    cards: [
      {
        id: "p1",
        leadId: 18315,
        title: "Замена ТЭН в духовке Miele",
        address: "Красногорск, Подмосковный б-р",
        master: "Дмитрий Л.",
        timeInStage: "5ч 8м",
        money: { kind: "estimate", amount: 8400 },
        bot: { action: "напомню клиенту", eta: "через 1ч", tone: "ok" },
      },
      {
        id: "p2",
        leadId: 18312,
        title: "Чистка кондиционера Daikin",
        address: "Москва, Митино",
        master: "Андрей В.",
        timeInStage: "23ч",
        money: { kind: "estimate", amount: 5200 },
        bot: { action: "третье напоминание", eta: "сейчас", tone: "warn" },
        badge: { text: "3-й контакт", tone: "warn" },
      },
      {
        id: "p3",
        leadId: 18308,
        title: "Замена компрессора Bosch",
        address: "Подольск, Революционный 33",
        master: "Виктор М.",
        timeInStage: "47ч",
        money: { kind: "estimate", amount: 14800 },
        bot: { action: "эскалация → Проблема", eta: "через 1ч", tone: "bad" },
        badge: { text: "почти просрочка", tone: "bad" },
      },
    ],
    accent: "border-l-emerald-400",
  },
  {
    key: "estimate_paid",
    emoji: "✅",
    title: "Смета оплачена",
    hint: "работа в процессе",
    count: 54,
    sum: 1_412_300,
    cards: [
      {
        id: "ok1",
        leadId: 18299,
        title: "Установка плиты Gorenje",
        address: "Москва, Чертаново",
        master: "Олег С.",
        timeInStage: "8ч",
        money: { kind: "paid", amount: 9800 },
        bot: { action: "проверю чек о завершении", eta: "через 12ч", tone: "ok" },
        badge: { text: "оплачено", tone: "ok" },
      },
      {
        id: "ok2",
        leadId: 18294,
        title: "Ремонт духовки Electrolux",
        address: "Мытищи, Силикатная 18",
        master: "Никита П.",
        timeInStage: "14ч",
        money: { kind: "paid", amount: 11200 },
        bot: { action: "ждём отчёт мастера", eta: "норма", tone: "ok" },
      },
    ],
    accent: "border-l-green-500",
  },
  {
    key: "commission_left",
    emoji: "🪙",
    title: "С остатком комиссии",
    hint: "доплата по итоговой сумме",
    count: 18,
    sum: 184_600,
    cards: [
      {
        id: "c1",
        leadId: 18280,
        title: "Замена платы СМА Indesit",
        address: "Реутов, Ленина 9",
        master: "Михаил Д.",
        timeInStage: "1д 4ч",
        money: { kind: "commission", amount: 2100 },
        bot: { action: "напомню мастеру", eta: "через 2ч", tone: "warn" },
      },
      {
        id: "c2",
        leadId: 18275,
        title: "Ремонт стиралки Bosch",
        address: "Москва, Бирюлёво",
        master: "Артём Г.",
        timeInStage: "2д",
        money: { kind: "commission", amount: 4700 },
        bot: { action: "блок при просрочке", eta: "через 8ч", tone: "bad" },
        badge: { text: "просрочка", tone: "bad" },
      },
    ],
    accent: "border-l-yellow-400",
  },
  {
    key: "closed_24h",
    emoji: "🏁",
    title: "Закрыто 24ч",
    hint: "успешно завершено",
    count: 43,
    sum: 487_200,
    cards: [
      {
        id: "cl1",
        leadId: 18250,
        title: "Холодильник Liebherr — замена компрессора",
        address: "Москва, Тропарёво",
        master: "Виталий Ж.",
        timeInStage: "3ч назад",
        money: { kind: "paid", amount: 18200 },
        badge: { text: "комиссия 1820 ₽", tone: "ok" },
      },
    ],
    accent: "border-l-slate-400",
  },
  {
    key: "problem",
    emoji: "🚨",
    title: "Проблема",
    hint: "нужен оператор",
    count: 6,
    expanded: true,
    cards: [
      {
        id: "pr1",
        leadId: 18301,
        title: "Клиент жалуется: мастер не вышел на связь",
        address: "Люберцы, Октябрьский 12",
        master: "Роман К.",
        timeInStage: "5ч",
        bot: { action: "ждёт твоего решения", eta: "верни в пул?", tone: "bad" },
        badge: { text: "жалоба", tone: "bad" },
      },
      {
        id: "pr2",
        leadId: 18288,
        title: "Смета 26 400₽ — клиент просит пересчёт",
        address: "Химки, Юбилейный 70",
        master: "Денис О.",
        timeInStage: "11ч",
        money: { kind: "estimate", amount: 26400 },
        bot: { action: "ждёт твоего решения", eta: "связаться с клиентом?", tone: "bad" },
      },
      {
        id: "pr3",
        leadId: 18261,
        title: "Просрочка оплаты комиссии 5800₽",
        address: "Москва, Беляево",
        master: "Павел Е.",
        timeInStage: "3д",
        money: { kind: "commission", amount: 5800 },
        bot: { action: "блокировка мастера", eta: "подтвердить?", tone: "bad" },
        badge: { text: "блок ждёт", tone: "bad" },
      },
    ],
    accent: "border-l-red-500",
  },
];

const formatMoney = (n: number) =>
  new Intl.NumberFormat("ru-RU").format(n) + " ₽";

const toneBg: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

const botToneBg: Record<string, string> = {
  ok: "bg-slate-50 text-slate-600 border-slate-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
};

function MiniCard({ card }: { card: Card }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-2 text-[11px] leading-tight shadow-sm hover:shadow transition cursor-pointer space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-400">#{card.leadId}</span>
        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-3 h-3" />
          {card.timeInStage}
        </span>
      </div>
      <div className="font-medium text-slate-800 line-clamp-2">{card.title}</div>
      <div className="flex items-center gap-1 text-slate-500">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">{card.address}</span>
      </div>
      {card.master && (
        <div className="flex items-center gap-1 text-slate-600">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.master}</span>
        </div>
      )}
      {card.money && (
        <div
          className={
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold " +
            (card.money.kind === "paid"
              ? "bg-emerald-100 text-emerald-700"
              : card.money.kind === "commission"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-violet-100 text-violet-700")
          }
        >
          <Wallet className="w-3 h-3" />
          {card.money.kind === "paid" && "оплачено "}
          {card.money.kind === "commission" && "комиссия "}
          {card.money.kind === "estimate" && "смета "}
          {formatMoney(card.money.amount)}
        </div>
      )}
      {card.badge && (
        <div className={"inline-flex ml-1 items-center px-1.5 py-0.5 rounded text-[10px] border " + toneBg[card.badge.tone]}>
          {card.badge.text}
        </div>
      )}
      {card.bot && (
        <div className={"flex items-start gap-1 px-1.5 py-1 rounded border text-[10px] " + botToneBg[card.bot.tone ?? "ok"]}>
          <Bot className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="opacity-70">{card.bot.action}</span>{" "}
            <span className="font-semibold">{card.bot.eta}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function ColumnView({ col }: { col: Column }) {
  const [expanded, setExpanded] = useState(!!col.expanded);
  const visible = expanded ? col.cards : col.cards.slice(0, 2);
  return (
    <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-md min-w-[200px] max-w-[210px] flex-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={"flex items-start gap-1.5 p-2 border-b border-slate-200 border-l-4 " + col.accent}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5" />}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-800">
            <span>{col.emoji}</span>
            <span>{col.title}</span>
            <span className="ml-auto bg-white border border-slate-200 text-slate-600 rounded px-1 text-[10px]">{col.count}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{col.hint}</div>
          {col.sum !== undefined && (
            <div className="text-[10px] mt-0.5 font-mono text-emerald-700">{formatMoney(col.sum)}</div>
          )}
        </div>
      </button>
      <div className="p-1.5 space-y-1.5 overflow-hidden">
        {visible.map((c) => <MiniCard key={c.id} card={c} />)}
        {col.cards.length > visible.length && (
          <button className="w-full text-[10px] text-slate-500 hover:text-slate-700 py-1 border border-dashed border-slate-300 rounded">
            ещё {col.cards.length - visible.length}…
          </button>
        )}
        {col.count > col.cards.length && (
          <button className="w-full text-[10px] text-slate-400 hover:text-slate-600 py-1">
            подгрузить ещё ({col.count - col.cards.length})
          </button>
        )}
      </div>
    </div>
  );
}

export function Desktop() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4">
      {/* Top tabs (context) */}
      <div className="flex items-center gap-1 text-[12px] text-slate-500 mb-3">
        <span className="font-semibold text-slate-700">Заявки</span>
        <ChevronRight className="w-3 h-3" />
        <button className="px-2 py-0.5 rounded text-slate-500 hover:bg-white">Очередь</button>
        <button className="px-2 py-0.5 rounded text-slate-500 hover:bg-white">Активные мастера</button>
        <button className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900 font-semibold">В работе</button>
        <button className="px-2 py-0.5 rounded text-slate-500 hover:bg-white">История</button>
      </div>

      {/* Funnel header */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3 grid grid-cols-7 gap-3 text-[11px]">
        <div>
          <div className="text-slate-500">Активных в работе</div>
          <div className="text-2xl font-bold text-slate-900">247</div>
          <div className="text-[10px] text-slate-400">за 7 дней: ↑ 18%</div>
        </div>
        <div className="border-l border-slate-100 pl-3">
          <div className="text-slate-500 flex items-center gap-1"><Wallet className="w-3 h-3" /> в работе</div>
          <div className="text-xl font-bold text-violet-700">3 218 400 ₽</div>
          <div className="text-[10px] text-slate-400">смета без оплаты</div>
        </div>
        <div className="border-l border-slate-100 pl-3">
          <div className="text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> оплачено</div>
          <div className="text-xl font-bold text-emerald-700">1 412 300 ₽</div>
          <div className="text-[10px] text-slate-400">комиссия: 141 230 ₽</div>
        </div>
        <div className="border-l border-slate-100 pl-3">
          <div className="text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> доходимость</div>
          <div className="text-xl font-bold text-slate-900">58%</div>
          <div className="text-[10px] text-emerald-600">+4 п.п. vs прошл. неделя</div>
        </div>
        <div className="border-l border-slate-100 pl-3">
          <div className="text-slate-500 flex items-center gap-1"><Bot className="w-3 h-3" /> бот сделал</div>
          <div className="text-xl font-bold text-slate-900">1 284</div>
          <div className="text-[10px] text-slate-400">авто-действий за сутки</div>
        </div>
        <div className="border-l border-slate-100 pl-3">
          <div className="text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> требуют тебя</div>
          <div className="text-xl font-bold text-red-600">6</div>
          <div className="text-[10px] text-red-500">в колонке «Проблема»</div>
        </div>
        <div className="border-l border-slate-100 pl-3 flex flex-col justify-center gap-1">
          <button className="bg-slate-900 text-white text-[11px] py-1.5 rounded flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" /> AI-сводка
          </button>
          <button className="border border-slate-200 text-slate-700 text-[11px] py-1.5 rounded flex items-center justify-center gap-1">
            <RefreshCw className="w-3 h-3" /> обновить
          </button>
        </div>
      </div>

      {/* Filter / search bar */}
      <div className="flex items-center gap-2 mb-3 text-[11px]">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2 py-1 flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            placeholder="Поиск по №, адресу, мастеру, клиенту…"
            className="bg-transparent outline-none text-[11px] flex-1"
          />
        </div>
        <button className="border border-slate-200 bg-white px-2 py-1 rounded flex items-center gap-1 text-slate-600">
          <Filter className="w-3 h-3" /> Город: все
        </button>
        <button className="border border-slate-200 bg-white px-2 py-1 rounded flex items-center gap-1 text-slate-600">
          <User className="w-3 h-3" /> Мастер: все
        </button>
        <button className="border border-slate-200 bg-white px-2 py-1 rounded flex items-center gap-1 text-slate-600">
          <Clock className="w-3 h-3" /> Время: всё
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-slate-500">Режим:</span>
          <div className="flex border border-slate-200 rounded overflow-hidden">
            <button className="bg-slate-900 text-white px-2 py-1">Компактный</button>
            <button className="bg-white text-slate-600 px-2 py-1">Детальный</button>
          </div>
          <button className="border border-slate-200 bg-white p-1 rounded">
            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button className="border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1 rounded flex items-center gap-1">
            <Radio className="w-3 h-3" /> live
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex gap-2 items-start">
        {columns.map((c) => <ColumnView key={c.key} col={c} />)}
      </div>

      {/* Footer hint */}
      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
        <Bell className="w-3 h-3 text-slate-400" />
        Карточки сами переезжают между колонками. Возврат в пул — только по твоему подтверждению.
        <span className="ml-auto flex items-center gap-1 text-slate-400">
          <Inbox className="w-3 h-3" />
          обновлено 4с назад · SSE
        </span>
      </div>
    </div>
  );
}
