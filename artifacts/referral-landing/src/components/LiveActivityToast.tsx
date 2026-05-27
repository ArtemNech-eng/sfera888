import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAMES = [
  'Андрей', 'Михаил', 'Сергей', 'Дмитрий', 'Алексей',
  'Иван', 'Николай', 'Артём', 'Владимир', 'Александр',
  'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Марина',
  'Екатерина', 'Юрий', 'Роман', 'Павел', 'Виктор',
];

const CITIES = [
  'Москвы', 'Краснодара', 'Ростова-на-Дону', 'Новороссийска',
  'Сочи', 'Воронежа', 'Ставрополя', 'Армавира',
  'Анапы', 'Геленджика', 'Темрюка', 'Туапсе',
];

const SERVICES = [
  'покраску стен', 'поклейку обоев', 'укладку плитки',
  'ремонт санузла', 'шпаклёвку', 'штукатурку',
  'электрику', 'сантехнику', 'отделку под ключ',
  'ремонт кухни', 'натяжные потолки', 'укладку ламината',
];

const ACTIONS = [
  'только что запросил расчёт на',
  'оставил заявку на',
  'узнал стоимость работ:',
  'запросил смету на',
];

const AVATAR_COLORS = [
  '#059669', '#0284c7', '#7c3aed', '#db2777',
  '#d97706', '#dc2626', '#2563eb', '#16a34a',
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface Toast {
  id: number;
  name: string;
  city: string;
  service: string;
  action: string;
  color: string;
  timeAgo: number;
}

function buildToast(id: number): Toast {
  return {
    id,
    name: rand(NAMES),
    city: rand(CITIES),
    service: rand(SERVICES),
    action: rand(ACTIONS),
    color: rand(AVATAR_COLORS),
    timeAgo: randInt(1, 4),
  };
}

export default function LiveActivityToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const counterRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleNext() {
      const delay = randInt(12_000, 38_000);
      showTimerRef.current = setTimeout(() => {
        counterRef.current += 1;
        setToast(buildToast(counterRef.current));
        hideTimerRef.current = setTimeout(() => {
          setToast(null);
          scheduleNext();
        }, 5_500);
      }, delay);
    }

    // First toast appears sooner — after 6–12 sec
    showTimerRef.current = setTimeout(() => {
      counterRef.current += 1;
      setToast(buildToast(counterRef.current));
      hideTimerRef.current = setTimeout(() => {
        setToast(null);
        scheduleNext();
      }, 5_500);
    }, randInt(6_000, 12_000));

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed bottom-[72px] left-4 z-50 max-w-[320px] pointer-events-none md:bottom-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ x: -340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -340, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 px-4 py-3 flex items-start gap-3 pointer-events-auto"
          >
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm"
              style={{ backgroundColor: toast.color }}
            >
              {toast.name[0]}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-semibold text-[#111827] text-sm">{toast.name}</span>
                <span className="text-gray-400 text-xs">из {toast.city}</span>
              </div>
              <p className="text-gray-600 text-xs leading-relaxed">
                {toast.action} <span className="font-medium text-[#111827]">{toast.service}</span>
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-[10px] text-gray-400">{toast.timeAgo} мин назад</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
