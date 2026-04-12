import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ArrowLeft } from "lucide-react";

const SECTIONS = [
  { emoji: "📋", title: "Как получать заказы", content: "" },
  { emoji: "📱", title: "Как работает смета", content: "" },
  { emoji: "💰", title: "Предоплата клиента", content: "" },
  { emoji: "⏳", title: "Если клиент не оплатил", content: "" },
  { emoji: "📈", title: "Как зарабатывать больше", content: "" },
  { emoji: "🔨", title: "Правила на объекте", content: "" },
  { emoji: "📄", title: "Акт и фото", content: "" },
  { emoji: "🛡", title: "Гарантия", content: "" },
  { emoji: "🏆", title: "Бонус для лучших", content: "" },
];

function AccordionItem({
  emoji,
  title,
  content,
  isOpen,
  onToggle,
  isLast,
}: {
  emoji: string;
  title: string;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-4 bg-white text-left active:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-3">
          <span className="text-xl leading-none">{emoji}</span>
          <span className="font-bold text-base text-gray-900">{title}</span>
        </span>
        <ChevronRight
          size={18}
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>

      {isOpen && content && (
        <div className="px-4 pb-4 pt-0 bg-white text-sm text-gray-600 leading-relaxed">
          {content}
        </div>
      )}

      {!isLast && <div className="h-px bg-gray-100 mx-0" />}
    </div>
  );
}

export default function WorkRulesPage() {
  const [, navigate] = useLocation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(prev => (prev === i ? null : i));
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate("/profile")}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold text-lg text-gray-900">Правила работы</h1>
      </div>

      <div className="flex-1 py-3 px-4">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
          {SECTIONS.map((section, i) => (
            <AccordionItem
              key={i}
              emoji={section.emoji}
              title={section.title}
              content={section.content}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
              isLast={i === SECTIONS.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
