import { X, Check } from 'lucide-react';

const problems = [
  'Ищешь клиентов сам — через знакомых и объявления',
  'Покупаешь пустые контакты на агрегаторах',
  'Клиенты прицениваются и пропадают',
  'Бесконечные переписки без результата',
  'Демпинг — конкуренты сбивают цену',
  'Нет стабильности — то густо, то пусто',
];

const solutions = [
  'Платишь только за реальные объекты',
  'Клиенты отфильтрованы и готовы к работе',
  'Стабильный поток — заявки каждый день',
  'Смета в приложении — без переписок',
  'Понятные правила — без демпинга',
  'Рост рейтинга → больше заказов',
];

export default function Comparison() {
  return (
    <section className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-14 text-center">
          Почему сильные мастера <span className="text-[#D9342B]">переходят к нам</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Без системы */}
          <div className="p-8 rounded-2xl bg-white border border-red-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A]">Без системы</h3>
            </div>
            <ul className="space-y-4">
              {problems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-50 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <span className="text-[#475569] text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* В системе */}
          <div className="p-8 rounded-2xl bg-white border border-green-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-[#0F172A]">В системе Честный Мастер</h3>
            </div>
            <ul className="space-y-4">
              {solutions.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-50 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-green-600" />
                  </div>
                  <span className="text-[#475569] text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
