import { X, Check } from 'lucide-react';
import Eyebrow from './Eyebrow';

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
    <section className="relative py-14 sm:py-20 bg-[#FAF6EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="03" label="Сравнение" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-14 text-center">
          Почему сильные мастера{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            переходят к нам
          </span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Без системы */}
          <div className="p-8 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#F5EBE3] flex items-center justify-center">
                <X className="w-5 h-5 text-[#A8908A]" />
              </div>
              <h3 className="text-xl font-bold text-[#1A1A1A]">Без системы</h3>
            </div>
            <ul className="space-y-4">
              {problems.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#F5EBE3] flex-shrink-0 flex items-center justify-center mt-0.5">
                    <X className="w-3 h-3 text-[#A8908A]" />
                  </div>
                  <span className="text-[#57534E] text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* В системе */}
          <div
            className="p-8 rounded-3xl border-2 border-[#FACC15] shadow-md"
            style={{ background: 'linear-gradient(160deg, #FEFCE8 0%, #FDEBD8 100%)' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15] flex items-center justify-center">
                <Check className="w-5 h-5 text-[#1A1A1A]" />
              </div>
              <h3 className="text-xl font-bold text-[#1A1A1A]">В системе Честный Мастер</h3>
            </div>
            <ul className="space-y-4">
              {solutions.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#FACC15] flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-[#1A1A1A]" />
                  </div>
                  <span className="text-[#44403C] text-sm font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
