import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const specializations = [
  'Обои', 'Шпаклёвка', 'Покраска', 'Плитка', 'Санузлы',
  'Отделочники', 'Универсалы', 'Ламинат', 'Натяжные потолки', 'Электрика',
];

const rules = [
  'Вовремя выезжать на замер',
  'Составлять смету через приложение',
  'Работать по рыночным ценам',
  'Соблюдать договорённости с клиентом',
];

const forbidden = [
  'Работа в обход системы (мимо приложения)',
  'Срыв сроков без предупреждения',
];

export default function Selection() {
  return (
    <section className="relative py-14 sm:py-20 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          С кем мы <span className="text-[#D9342B]">работаем</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Мы отбираем мастеров, которые работают на результат и ценят систему
        </p>

        {/* Specializations */}
        <div className="max-w-4xl mx-auto mb-12">
          <h3 className="text-lg font-bold text-[#0F172A] mb-4 text-center">Специализации</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {specializations.map((spec) => (
              <span
                key={spec}
                className="px-4 py-2 rounded-xl bg-white border border-[#EDEAE2] text-[#0F172A] text-sm font-medium shadow-sm"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Rules */}
          <div className="p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <h3 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Правила работы
            </h3>
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li key={rule} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-[#475569] text-sm">{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Forbidden */}
          <div className="p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <h3 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Запрещено
            </h3>
            <ul className="space-y-3">
              {forbidden.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[#475569] text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Warning */}
        <div className="max-w-4xl mx-auto mt-8 p-5 rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/20 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#F59E0B] flex-shrink-0 mt-0.5" />
            <p className="text-[#475569] text-sm">
              <span className="text-[#0F172A] font-semibold">Внимание:</span> нарушение правил приводит к заморозке аккаунта.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
