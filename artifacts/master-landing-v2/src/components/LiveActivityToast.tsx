import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCheck, Package } from 'lucide-react';

const NAMES = [
  'Андрей', 'Михаил', 'Сергей', 'Дмитрий', 'Алексей',
  'Иван', 'Артём', 'Владимир', 'Александр', 'Роман',
  'Павел', 'Виктор', 'Игорь', 'Евгений', 'Денис',
];

const CITIES = [
  'Москвы', 'Краснодара', 'Ростова-на-Дону', 'Новороссийска',
  'Сочи', 'Воронежа', 'Ставрополя', 'Армавира',
  'Анапы', 'Геленджика', 'Самары', 'Казани', 'Екатеринбурга',
];

const JOBS = [
  'покраска стен', 'поклейка обоев', 'укладка плитки',
  'ремонт санузла', 'шпаклёвка', 'штукатурка',
  'отделка под ключ', 'ремонт кухни', 'укладка ламината',
];

const AMOUNTS = [28000, 35000, 42000, 48000, 55000, 63000, 71000, 38000, 44000];

const AVATAR_COLORS = [
  '#059669', '#0284c7', '#7c3aed', '#db2777',
  '#d97706', '#dc2626', '#2563eb', '#16a34a',
];

type EventType = 'register' | 'order';

interface Toast {
  id: number;
  type: EventType;
  name: string;
  city: string;
  job: string;
  amount: number;
  color: string;
  timeAgo: number;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildToast(id: number): Toast {
  return {
    id,
    type: Math.random() > 0.45 ? 'register' : 'order',
    name: rand(NAMES),
    city: rand(CITIES),
    job: rand(JOBS),
    amount: rand(AMOUNTS),
    color: rand(AVATAR_COLORS),
    timeAgo: randInt(1, 5),
  };
}

export default function LiveActivityToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const counterRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleNext() {
      const delay = randInt(15_000, 35_000);
      showTimerRef.current = setTimeout(() => {
        counterRef.current += 1;
        setToast(buildToast(counterRef.current));
        hideTimerRef.current = setTimeout(() => {
          setToast(null);
          scheduleNext();
        }, 5_500);
      }, delay);
    }

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
    <div className="fixed bottom-6 left-4 z-50 max-w-[300px] pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.10)] border border-[#E2E8F0] px-4 py-3 flex items-start gap-3 pointer-events-auto"
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
                <span className="text-[#94A3B8] text-xs">из {toast.city}</span>
              </div>

              {toast.type === 'register' ? (
                <p className="text-[#64748B] text-xs leading-relaxed flex items-center gap-1">
                  <UserCheck size={11} className="text-[#10B981] flex-shrink-0" />
                  зарегистрировался в системе
                </p>
              ) : (
                <p className="text-[#64748B] text-xs leading-relaxed flex items-center gap-1">
                  <Package size={11} className="text-[#3B82F6] flex-shrink-0" />
                  взял объект —{' '}
                  <span className="font-medium text-[#111827]">
                    {toast.job}, {toast.amount.toLocaleString('ru')} ₽
                  </span>
                </p>
              )}

              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] flex-shrink-0" />
                <span className="text-[10px] text-[#94A3B8]">{toast.timeAgo} мин назад</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
