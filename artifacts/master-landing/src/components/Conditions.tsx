import { CreditCard, Percent, Layers, Smartphone, FileText } from 'lucide-react';

const conditions = [
  {
    icon: CreditCard,
    label: 'Заявка',
    value: '500 ₽',
    note: 'оплачивается после завершения объекта',
  },
  {
    icon: Percent,
    label: 'Комиссия',
    value: 'от 15%',
    note: 'с суммы заказа, оплачивается после завершения',
  },
  {
    icon: Layers,
    label: 'Активные заказы',
    value: '1 заказ',
    note: 'для топовых мастеров — 2 одновременно',
  },
  {
    icon: Smartphone,
    label: 'Сделки',
    value: 'Через приложение',
    note: 'все этапы фиксируются в PWA',
  },
  {
    icon: FileText,
    label: 'Смета',
    value: 'В приложении',
    note: 'прозрачные расчёты для клиента и мастера',
  },
];

export default function Conditions() {
  return (
    <section id="conditions" className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Условия <span className="text-[#D9342B]">сотрудничества</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Всё прозрачно — вы платите только после выполненной работы
        </p>

        <div className="max-w-3xl mx-auto space-y-4">
          {conditions.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center bg-[#FCE9E7] border border-[#EDEAE2]">
                <item.icon className="w-6 h-6 text-[#D9342B]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-[#475569] text-sm">{item.label}:</span>
                  <span className="text-[#0F172A] font-bold text-lg">{item.value}</span>
                </div>
                <p className="text-[#94A3B8] text-sm mt-0.5">{item.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-8 p-5 rounded-2xl bg-[#FCE9E7] border border-[#EDEAE2] text-center">
          <p className="text-[#475569]">
            <span className="text-[#D9342B] font-semibold">Важно:</span> вы ничего не платите при подключении.
            500₽ + комиссия списываются только после того, как объект закрыт и клиент принял работу.
          </p>
        </div>
      </div>
    </section>
  );
}
