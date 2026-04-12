import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ArrowLeft } from "lucide-react";

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[#333333] leading-snug">{children}</p>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] font-bold text-[#333333] leading-snug">{children}</p>;
}

function TierBlock({
  emoji,
  bg,
  children,
}: {
  emoji: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${bg}`}>
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1">{emoji}</p>
      <div className="text-[14px] text-[#333333] leading-snug space-y-0.5">{children}</div>
    </div>
  );
}

const howToGetOrders = (
  <div className="space-y-3">
    <P>Когда появляется новый заказ — его видят все свободные мастера.</P>
    <P>Вы нажимаете «Откликнуться».</P>
    <P>
      Но заказ получает не тот кто первый откликнулся, а тот у кого выше{" "}
      <span className="font-bold">конверсия</span>.
    </P>

    <SectionTitle>Что такое конверсия:</SectionTitle>
    <P>
      Это процент ваших заявок которые дошли до оплаты предоплаты клиентом.
    </P>
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-0.5">
      <P>Пример:</P>
      <P>Вам пришло 10 заявок.</P>
      <P>8 клиентов оплатили предоплату.</P>
      <P><span className="font-bold">Ваша конверсия = 80%</span></P>
    </div>

    <SectionTitle>Как система выбирает:</SectionTitle>

    <TierBlock emoji="🥇 Конверсия 80%+" bg="bg-green-50">
      <p>Получаете заказы ПЕРВЫМ.</p>
      <p>Включая крупные объекты за 50 000 — 100 000₽+</p>
      <p>Пока другие ждут — вы уже зарабатываете.</p>
    </TierBlock>

    <TierBlock emoji="🥈 Конверсия 60–79%" bg="bg-blue-50">
      <p>Получаете заказы во вторую очередь.</p>
      <p>Если в первой группе никто не откликнулся.</p>
    </TierBlock>

    <TierBlock emoji="🥉 Конверсия 30–59%" bg="bg-yellow-50">
      <p>Получаете редко.</p>
      <p>Только если первые две группы не откликнулись.</p>
    </TierBlock>

    <TierBlock emoji="⚠️ Конверсия ниже 30%" bg="bg-red-50">
      <p>Почти не получаете заказов.</p>
      <p>Система считает что вы не доводите клиентов до оплаты.</p>
    </TierBlock>

    <div className="pt-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Простое правило:</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Чем выше конверсия — тем больше заказов.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Чем больше заказов — тем больше денег.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Тем меньше простоев.</p>
    </div>
  </div>
);

interface Section {
  emoji: string;
  title: string;
  content: React.ReactNode;
}

const howEstimateWorks = (
  <div className="space-y-3">
    <P>Все заказы проходят через смету в приложении. Это обязательно.</P>

    <SectionTitle>Как это работает:</SectionTitle>
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      {[
        "Вы приехали на замер",
        "Посмотрели объект",
        "Открываете смету в приложении",
        "Выбираете работы из списка",
        "Вводите площадь и цену за м²",
        "Приложение само всё считает",
        "Отправляете ссылку клиенту",
      ].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
    </div>
    <P>Это занимает 2 минуты.</P>

    <SectionTitle>Зачем смета через приложение:</SectionTitle>
    <div className="space-y-2">
      {[
        "Клиент видит профессиональный документ — доверяет больше, соглашается чаще",
        "Клиент оплачивает предоплату прямо через смету — вам не нужно просить деньги",
        "Сумма зафиксирована — потом не будет споров «мы договаривались на другую цену»",
        "Ваш лимит на новые заказы разблокируется автоматически после оплаты",
        "Вы выглядите как серьёзная компания, а не как шабашник",
      ].map((text, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-base leading-none shrink-0 mt-px">✅</span>
          <p className="text-[14px] text-[#333333] leading-snug">{text}</p>
        </div>
      ))}
    </div>

    <P>Без сметы через приложение заказ не считается выполненным и не учитывается в конверсии.</P>

    <SectionTitle>Как брать предоплату на замере:</SectionTitle>
    <P>
      Лучше всего закрывать предоплату прямо на замере — пока стоите рядом с клиентом.
    </P>
    <P>
      Отправили смету → клиент открыл → оплатил при вас → готово.{" "}
      Не откладывайте на потом. Потом = клиент забыл.
    </P>

    <div className="bg-yellow-50 rounded-xl px-3.5 py-3 space-y-2">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Если у клиента нет денег на карте:</p>
      <P>Можно взять предоплату наличкой. В этом случае:</P>
      <div className="bg-white/70 rounded-lg px-3 py-2.5 space-y-1">
        {[
          "Берёте 5 000₽ наличкой у клиента",
          "Пополняете свою карту",
          "Переводите на реквизиты приложения Честный Мастер — реквизиты находятся в разделе «Оплата»",
          "Смета закрывается автоматически",
          "Лимит на новые заказы разблокируется",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
            <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
          </div>
        ))}
      </div>
      <P>
        Клиенту всё равно как оплатить — картой или наличкой.
        Главное чтобы смета была закрыта в приложении.
      </P>
    </div>
  </div>
);

const SECTIONS: Section[] = [
  { emoji: "📋", title: "Как получать заказы", content: howToGetOrders },
  { emoji: "📱", title: "Как работает смета", content: howEstimateWorks },
  { emoji: "💰", title: "Предоплата клиента", content: null },
  { emoji: "⏳", title: "Если клиент не оплатил", content: null },
  { emoji: "📈", title: "Как зарабатывать больше", content: null },
  { emoji: "🔨", title: "Правила на объекте", content: null },
  { emoji: "📄", title: "Акт и фото", content: null },
  { emoji: "🛡", title: "Гарантия", content: null },
  { emoji: "🏆", title: "Бонус для лучших", content: null },
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
  content: React.ReactNode;
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
        <div className="px-4 pb-5 pt-1 bg-white">
          {content}
        </div>
      )}

      {!isLast && <div className="h-px bg-gray-100" />}
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
