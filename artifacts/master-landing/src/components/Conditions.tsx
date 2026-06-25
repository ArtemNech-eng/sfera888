import { Gift, CreditCard, Percent, ShieldCheck } from 'lucide-react';

const cards = [
  {
    icon: Gift,
    title: 'Подключение — 0₽',
    description: 'Бесплатно, без предоплат. Заполняете форму — получаете доступ к приложению и ленте заказов.',
    accent: true,
  },
  {
    icon: CreditCard,
    title: 'Заявка — 500₽',
    description: 'Оплачивается после получения оплаты от клиента. Сначала зарабатываете — потом платите.',
    accent: false,
  },
  {
    icon: Percent,
    title: 'Комиссия — от 15%',
    description: 'С суммы заказа, после получения оплаты от клиента. Чем больше заказ — тем больше зарабатываете.',
    accent: false,
  },
];

export default function Conditions() {
  return (
    <section id="conditions" className="relative py-14 sm:py-20 bg-[#FAFAF7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Прозрачные <span className="text-[#D9342B]">условия</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Никаких предоплат и токенов. Вы платите только после получения денег от клиента.
        </p>

        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {cards.map((card) => (
            <div
              key={card.title}
              className={`relative p-8 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-300 ${
                card.accent
                  ? 'bg-[#FCE9E7] border-[#D9342B]/20'
                  : 'bg-white border-[#EDEAE2]'
              }`}
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${
                card.accent
                  ? 'bg-[#D9342B] text-white'
                  : 'bg-[#FCE9E7] border border-[#EDEAE2]'
              }`}>
                <card.icon className={`w-7 h-7 ${card.accent ? 'text-white' : 'text-[#D9342B]'}`} />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A] mb-3">{card.title}</h3>
              <p className="text-[#475569] text-sm leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Callout */}
        <div className="max-w-4xl mx-auto mt-10 p-6 rounded-2xl bg-white border-2 border-[#D9342B]/20 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#FCE9E7] flex-shrink-0 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#D9342B]" />
            </div>
            <div>
              <p className="text-[#0F172A] font-semibold mb-1">Не договорились с клиентом — ничего не платите.</p>
              <p className="text-[#475569] text-sm mb-2">Комиссия списывается только после получения оплаты от клиента. Если сделка не состоялась — вы ничего не должны.</p>
              <p className="text-[#94A3B8] text-xs">Но если система дала вам тестовые заказы, а вы систематически не закрываете — доступ к новым заявкам будет ограничен. Мы даём объекты тем, кто умеет договариваться.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
