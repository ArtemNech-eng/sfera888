interface EyebrowProps {
  number: string;
  label: string;
  align?: 'left' | 'center';
}

/**
 * Моноширинный eyebrow-лейбл с номером секции — в стиле MBK-Agent.
 * Пример: 01 · КАК ЭТО РАБОТАЕТ
 */
export default function Eyebrow({ number, label, align = 'center' }: EyebrowProps) {
  return (
    <div
      className={`flex items-center gap-3 mb-5 ${
        align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      <span className="font-mono text-xs sm:text-sm font-bold tracking-[0.2em] text-[#E8590C]">
        {number}
      </span>
      <span className="h-px w-6 bg-[#E8590C]/40" />
      <span className="font-mono text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-[#78716C]">
        {label}
      </span>
    </div>
  );
}
