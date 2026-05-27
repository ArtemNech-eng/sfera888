import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function OnlineBadge() {
  const [count, setCount] = useState(() => randInt(13, 19));
  const [viewers, setViewers] = useState(() => randInt(4, 9));

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => {
        const delta = randInt(-2, 2);
        return Math.max(11, Math.min(24, prev + delta));
      });
    }, randInt(20_000, 45_000));
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setViewers((prev) => {
        const delta = randInt(-1, 2);
        return Math.max(3, Math.min(12, prev + delta));
      });
    }, randInt(15_000, 30_000));
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
      {/* Masters online */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-sm font-semibold text-[#111827]">
          <AnimatePresence mode="wait">
            <motion.span
              key={count}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.25 }}
              className="inline-block tabular-nums"
            >
              {count}
            </motion.span>
          </AnimatePresence>
          {' '}мастеров онлайн
        </span>
      </div>

      {/* Viewers */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-100">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-400">
          <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span className="text-sm text-gray-500">
          <AnimatePresence mode="wait">
            <motion.span
              key={viewers}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="inline-block font-semibold text-[#111827] tabular-nums"
            >
              {viewers}
            </motion.span>
          </AnimatePresence>
          {' '}человек смотрят сейчас
        </span>
      </div>
    </div>
  );
}
