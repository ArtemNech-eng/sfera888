import {
  AlertTriangle,
  ArrowLeftCircle,
  Bot,
  CheckCircle2,
  Clock,
  History,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldAlert,
  User,
  Wallet,
  X,
} from "lucide-react";

const events = [
  { t: "сегодня 09:14", who: "Клиент", text: "Оставил заявку через сайт", tone: "info" as const },
  { t: "09:14", who: "🤖", text: "Создал заявку #18288, разослал 23 мастерам в радиусе 15км", tone: "ok" as const },
  { t: "09:21", who: "🤖", text: "Получено 4 отклика, выбран Денис О. (рейтинг 4.8, ETA 1ч 20м)", tone: "ok" as const },
  { t: "11:02", who: "Денис О.", text: "Прибыл на адрес, начал диагностику", tone: "info" as const },
  { t: "13:47", who: "Денис О.", text: "Выставил смету: 26 400 ₽ (замена компрессора + фреон)", tone: "info" as const },
  { t: "14:10", who: "🤖", text: "Отправил клиенту ссылку на оплату", tone: "ok" as const },
  { t: "16:28", who: "Клиент", text: "Звонил, говорит сумма большая, просит пересчёт", tone: "warn" as const },
  { t: "16:29", who: "🤖", text: "Эскалировал в «Проблема» — нужен оператор", tone: "bad" as const },
];

export function CardDetail() {
  return (
    <div className="min-h-screen bg-slate-100 p-3 text-slate-900 text-[12px]">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-red-600 font-semibold">🚨 Проблема — нужен оператор</div>
            <div className="font-semibold text-slate-900">Заявка #18288 · Клиент просит пересчёт сметы</div>
          </div>
          <button className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        {/* Money strip */}
        <div className="grid grid-cols-3 border-b border-slate-200">
          <div className="p-2.5">
            <div className="text-[10px] text-slate-500 uppercase">Смета</div>
            <div className="text-lg font-bold text-violet-700">26 400 ₽</div>
            <div className="text-[10px] text-slate-400">не оплачена · 11ч</div>
          </div>
          <div className="p-2.5 border-l border-slate-100">
            <div className="text-[10px] text-slate-500 uppercase">Оплата</div>
            <div className="text-lg font-bold text-slate-400">— ₽</div>
            <div className="text-[10px] text-slate-400">ссылка отправлена</div>
          </div>
          <div className="p-2.5 border-l border-slate-100">
            <div className="text-[10px] text-slate-500 uppercase">Комиссия</div>
            <div className="text-lg font-bold text-slate-400">2 640 ₽</div>
            <div className="text-[10px] text-slate-400">10% от сметы</div>
          </div>
        </div>

        {/* Bot suggestion */}
        <div className="m-3 bg-slate-900 text-white rounded-md p-2.5 flex items-start gap-2">
          <Bot className="w-4 h-4 mt-0.5" />
          <div className="flex-1 text-[11px] leading-relaxed">
            <div className="font-semibold mb-0.5">Что я могу сделать сейчас</div>
            <div className="text-slate-300">
              Связаться с клиентом и обсудить смету, либо вернуть заявку в пул для нового мастера.
              <br />
              <span className="text-amber-300">Возврат в пул требует твоего подтверждения.</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-[10px] font-semibold px-2 py-1 rounded">
                💬 Связаться с клиентом
              </button>
              <button className="bg-white text-slate-900 text-[10px] font-semibold px-2 py-1 rounded">
                📞 Звонок мастеру
              </button>
              <button className="bg-amber-400 text-slate-900 text-[10px] font-semibold px-2 py-1 rounded flex items-center gap-1">
                <ArrowLeftCircle className="w-3 h-3" /> Вернуть в пул
              </button>
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="px-3 pb-2 grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <div className="text-[10px] uppercase text-slate-500 mb-1">Клиент</div>
            <div className="font-semibold text-slate-800">Анна П.</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> +7 (***) ***-43-12</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Химки, Юбилейный 70</div>
            <div className="flex gap-1 mt-1.5">
              <button className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> Чат
              </button>
              <button className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                <Phone className="w-3 h-3" /> Звонок
              </button>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <div className="text-[10px] uppercase text-slate-500 mb-1">Мастер</div>
            <div className="font-semibold text-slate-800">Денис О.</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              ★ 4.8 · 142 заказа · комиссия 0₽
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> +7 (***) ***-87-90</div>
            <div className="flex gap-1 mt-1.5">
              <button className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                <MessageCircle className="w-3 h-3" /> Чат
              </button>
              <button className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Заблокировать
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-3 pb-2">
          <div className="text-[10px] uppercase text-slate-500 mb-1">Проблема</div>
          <div className="text-[11px] text-slate-700 bg-amber-50 border border-amber-200 rounded p-2">
            Не работает холодильник Liebherr CBN 36-Premium, морозит, но не охлаждает основную камеру.
            Клиент хочет понять, почему смета 26 400 ₽ — мастер предложил замену компрессора и заправку фреоном.
          </div>
        </div>

        {/* Timeline */}
        <div className="px-3 pb-3">
          <div className="text-[10px] uppercase text-slate-500 mb-1 flex items-center gap-1">
            <History className="w-3 h-3" /> История
          </div>
          <div className="space-y-1">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="text-slate-400 font-mono w-16 shrink-0">{e.t}</span>
                <span className={
                  "px-1 py-0.5 rounded text-[10px] font-semibold shrink-0 " +
                  (e.tone === "ok" ? "bg-emerald-100 text-emerald-700" :
                   e.tone === "warn" ? "bg-amber-100 text-amber-700" :
                   e.tone === "bad" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")
                }>{e.who}</span>
                <span className="text-slate-700 flex-1">{e.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer status */}
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex items-center gap-2 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          В стадии «Проблема» 11 минут
          <span className="ml-auto flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> обновляется автоматически
          </span>
        </div>
      </div>
    </div>
  );
}
