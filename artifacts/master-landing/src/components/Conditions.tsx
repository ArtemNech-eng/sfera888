import { Gift, CreditCard, Percent, ShieldCheck } from 'lucide-react';
import Eyebrow from './Eyebrow';

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
    <section id="conditions" className="relative py-14 sm:py-20 bg-[#F5F0E8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="02" label="Условия" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Прозрачные{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            условия
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-14 text-lg">
          Никаких предоплат и токенов. Вы платите только после получения денег от клиента.
        </p>

        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {cards.map((card) => (
            <div
              key={card.title}
              className="relative p-8 rounded-3xl border shadow-sm hover:shadow-md transition-all duration-300"
              style={
                card.accent
                  ? { background: 'linear-gradient(160deg, #FEF3C7 0%, #FDEBD8 100%)', borderColor: '#FACC15' }
                  : { background: 'linear-gradient(160deg, #FFFFFF 0%, #FBF6EE 100%)', borderColor: '#E7E0D4' }
              }
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                card.accent ? 'bg-[#FACC15]' : 'bg-[#FEF3C7]'
              }`}>
                <card.icon className={`w-7 h-7 ${card.accent ? 'text-[#1A1A1A]' : 'text-[#E8590C]'}`} />
              </div>
              <h3 className="text-xl font-bold text-[#1A1A1A] mb-3">{card.title}</h3>
              <p className="text-[#57534E] text-sm leading-relaxed">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Callout */}
        <div className="max-w-4xl mx-auto mt-10 p-6 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex-shrink-0 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#E8590C]" />
            </div>
            <div>
              <p className="text-[#1A1A1A] font-semibold mb-1">Не договорились с клиентом — ничего не платите.</p>
              <p className="text-[#57534E] text-sm mb-2">Комиссия списывается только после получения оплаты от клиента. Если сделка не состоялась — вы ничего не должны.</p>
              <p className="text-[#A8A29E] text-xs">Но если система дала вам тестовые заказы, а вы систематически не закрываете — доступ к новым заявкам будет ограничен. Мы даём объекты тем, кто умеет договариваться.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
