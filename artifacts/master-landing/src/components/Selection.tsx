import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import Eyebrow from './Eyebrow';

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
    <section className="relative py-14 sm:py-20 bg-[#F5F0E8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="06" label="Отбор" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          С кем мы{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            работаем
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-14 text-lg">
          Мы отбираем мастеров, которые работают на результат и ценят систему
        </p>

        {/* Specializations */}
        <div className="max-w-4xl mx-auto mb-12">
          <h3 className="text-lg font-bold text-[#1A1A1A] mb-4 text-center">Специализации</h3>
          <div className="flex flex-wrap justify-center gap-3">
            {specializations.map((spec) => (
              <span
                key={spec}
                className="px-4 py-2 rounded-full bg-white border border-[#E7E0D4] text-[#1A1A1A] text-sm font-medium shadow-sm"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Rules */}
          <div className="p-6 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm">
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#E8590C]" />
              Правила работы
            </h3>
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li key={rule} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-[#E8590C] flex-shrink-0 mt-0.5" />
                  <span className="text-[#57534E] text-sm">{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Forbidden */}
          <div className="p-6 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm">
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5 text-[#A8908A]" />
              Запрещено
            </h3>
            <ul className="space-y-3">
              {forbidden.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-[#A8908A] flex-shrink-0 mt-0.5" />
                  <span className="text-[#57534E] text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Warning */}
        <div
          className="max-w-4xl mx-auto mt-8 p-5 rounded-3xl border border-[#FACC15] shadow-sm"
          style={{ background: 'linear-gradient(160deg, #FEFCE8 0%, #FDEBD8 100%)' }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#E8590C] flex-shrink-0 mt-0.5" />
            <p className="text-[#57534E] text-sm">
              <span className="text-[#1A1A1A] font-semibold">Внимание:</span> нарушение правил приводит к заморозке аккаунта.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
