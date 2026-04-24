import { AlertTriangle, Bot, ChevronRight, Clock, Filter, MapPin, Search, User, Wallet } from "lucide-react";

const chips = [
  { key: "problem", label: "🚨 Проблема", count: 6, active: true, tone: "red" },
  { key: "all", label: "Все", count: 247 },
  { key: "new", label: "🆕 Новые", count: 47 },
  { key: "wait", label: "📡 Ждут мастера", count: 12 },
  { key: "noest", label: "📋 Без сметы", count: 38 },
  { key: "estunpaid", label: "💰 Ждут оплату", count: 29 },
  { key: "estpaid", label: "✅ Оплачено", count: 54 },
  { key: "comm", label: "🪙 Остаток комиссии", count: 18 },
  { key: "closed", label: "🏁 Закрыто 24ч", count: 43 },
];

const cards = [
  {
    id: "p1",
    leadId: 18301,
    title: "Клиент: мастер не вышел на связь",
    address: "Люберцы, Октябрьский 12",
    master: "Роман К.",
    timeInStage: "5ч",
    bot: "ждёт твоего решения · вернуть в пул?",
    severity: "high",
  },
  {
    id: "p2",
    leadId: 18288,
    title: "Смета 26 400₽ — клиент просит пересчёт",
    address: "Химки, Юбилейный 70",
    master: "Денис О.",
    timeInStage: "11ч",
    money: "смета 26 400 ₽",
    bot: "связаться с клиентом?",
    severity: "high",
  },
  {
    id: "p3",
    leadId: 18261,
    title: "Просрочка оплаты комиссии",
    address: "Москва, Беляево",
    master: "Павел Е.",
    timeInStage: "3д",
    money: "комиссия 5 000 ₽",
    bot: "блокировка мастера · подтвердить?",
    severity: "high",
  },
  {
    id: "p4",
    leadId: 18255,
    title: "Дубль заявки от клиента (3-й контакт)",
    address: "Москва, Бабушкинская",
    master: "—",
    timeInStage: "2ч",
    bot: "склеить с #18247?",
    severity: "med",
  },
];

export function Mobile() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 text-[12px] flex flex-col">
      {/* Status bar */}
      <div className="bg-slate-900 text-white text-[10px] px-3 py-1 flex items-center justify-between">
        <span>9:41</span>
        <span>Sfera Master CRM</span>
        <span>●●● ▮</span>
      </div>

      {/* Header */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[16px] font-bold flex-1">Заявки в работе</div>
          <button className="bg-white border border-slate-200 rounded p-1.5"><Search className="w-3.5 h-3.5 text-slate-500" /></button>
          <button className="bg-white border border-slate-200 rounded p-1.5"><Filter className="w-3.5 h-3.5 text-slate-500" /></button>
        </div>

        {/* Funnel mini */}
        <div className="bg-white border border-slate-200 rounded-md p-2 grid grid-cols-3 gap-1 text-center mb-2">
          <div>
            <div className="text-[18px] font-bold">247</div>
            <div className="text-[9px] text-slate-500">активных</div>
          </div>
          <div className="border-l border-slate-100">
            <div className="text-[18px] font-bold text-emerald-700">1.4M</div>
            <div className="text-[9px] text-slate-500">оплачено ₽</div>
          </div>
          <div className="border-l border-slate-100">
            <div className="text-[18px] font-bold">58%</div>
            <div className="text-[9px] text-slate-500">конверсия</div>
          </div>
        </div>

        {/* Problem alert */}
        <div className="bg-red-50 border border-red-200 rounded-md p-2 flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <div className="text-[11px] text-red-700 flex-1">
            <span className="font-semibold">6 заявок ждут тебя</span> — остальное бот ведёт сам
          </div>
          <ChevronRight className="w-4 h-4 text-red-500" />
        </div>

        {/* Column chips */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {chips.map((c) => (
            <button
              key={c.key}
              className={
                "shrink-0 px-2 py-1 rounded-full text-[10px] border whitespace-nowrap " +
                (c.active
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-slate-700 border-slate-200")
              }
            >
              {c.label} <span className={c.active ? "opacity-90" : "opacity-50"}>· {c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-3 pb-3 space-y-2 overflow-y-auto">
        <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wide pt-1">🚨 Проблема · 6</div>
        {cards.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-md p-2.5 shadow-sm border-l-4 border-l-red-500">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-slate-400">#{c.leadId}</span>
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Clock className="w-3 h-3" /> {c.timeInStage}
              </span>
            </div>
            <div className="font-semibold text-slate-900 text-[12px] leading-snug mb-1">{c.title}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-0.5">
              <MapPin className="w-3 h-3 shrink-0" /> {c.address}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1.5">
              <User className="w-3 h-3 shrink-0" /> Мастер: {c.master}
            </div>
            {c.money && (
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 mr-1">
                <Wallet className="w-3 h-3" /> {c.money}
              </div>
            )}
            <div className="mt-2 flex items-start gap-1 px-2 py-1.5 rounded bg-red-50 border border-red-200 text-[11px] text-red-700">
              <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{c.bot}</span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button className="flex-1 bg-slate-900 text-white text-[11px] py-1.5 rounded font-semibold">Открыть</button>
              <button className="bg-emerald-500 text-white text-[11px] py-1.5 px-2 rounded">💬</button>
              <button className="bg-amber-100 text-amber-800 text-[11px] py-1.5 px-2 rounded">↩︎ В пул</button>
            </div>
          </div>
        ))}

        <div className="text-[10px] text-slate-400 text-center py-2">
          подгрузить ещё (2)
        </div>
      </div>

      {/* Bottom nav */}
      <div className="bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around text-[10px]">
        <div className="text-slate-400 flex flex-col items-center gap-0.5">📋<span>Очередь</span></div>
        <div className="text-red-600 flex flex-col items-center gap-0.5 font-semibold">⚙️<span>В работе</span></div>
        <div className="text-slate-400 flex flex-col items-center gap-0.5">👷<span>Мастера</span></div>
        <div className="text-slate-400 flex flex-col items-center gap-0.5">💰<span>Деньги</span></div>
        <div className="text-slate-400 flex flex-col items-center gap-0.5">📊<span>Аналитика</span></div>
      </div>
    </div>
  );
}
