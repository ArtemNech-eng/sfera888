"use client";

import { useState } from "react";
import Link from "next/link";
// ─── Inline SVG icons (marketplace has no lucide-react dep) ──────────────────
function ChevronRight({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><polyline points="9 18 15 12 9 6"/></svg>;
}
function ArrowLeft({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
}
function ClipboardList({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>;
}
function FileText({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
}
function CreditCard({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function Clock({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function TrendingUp({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
}
function HardHat({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>;
}
function Camera({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function ShieldCheck({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
}
function Star({ size = 18, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[#333333] leading-snug">{children}</p>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] font-bold text-[#333333] leading-snug">{children}</p>;
}

function TierBlock({ emoji, bg, children }: { emoji: string; bg: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${bg}`}>
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1">{emoji}</p>
      <div className="text-[14px] text-[#333333] leading-snug space-y-0.5">{children}</div>
    </div>
  );
}

// ─── Section icons ─────────────────────────────────────────────────────────────

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: "var(--color-primary)" }}
    >
      {children}
    </span>
  );
}

const ICONS = {
  orders:   <SectionIcon><ClipboardList size={18} className="text-white" /></SectionIcon>,
  estimate: <SectionIcon><FileText      size={18} className="text-white" /></SectionIcon>,
  prepay:   <SectionIcon><CreditCard    size={18} className="text-white" /></SectionIcon>,
  unpaid:   <SectionIcon><Clock         size={18} className="text-white" /></SectionIcon>,
  earn:     <SectionIcon><TrendingUp    size={18} className="text-white" /></SectionIcon>,
  site:     <SectionIcon><HardHat       size={18} className="text-white" /></SectionIcon>,
  photo:    <SectionIcon><Camera        size={18} className="text-white" /></SectionIcon>,
  warranty: <SectionIcon><ShieldCheck   size={18} className="text-white" /></SectionIcon>,
  bonus:    <SectionIcon><Star          size={18} className="text-white" /></SectionIcon>,
};

// ─── Section content ──────────────────────────────────────────────────────────

const howToGetOrders = (
  <div className="space-y-3">
    <P>Когда появляется новый заказ — его видят все свободные мастера.</P>
    <P>Вы нажимаете «Откликнуться».</P>
    <P>
      Но заказ получает не тот кто первый откликнулся, а тот у кого выше{" "}
      <span className="font-bold">конверсия</span>.
    </P>

    <SectionTitle>Что такое конверсия:</SectionTitle>
    <P>Это процент ваших заявок которые дошли до оплаты предоплаты клиентом.</P>
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
    <P>Лучше всего закрывать предоплату прямо на замере — пока стоите рядом с клиентом.</P>
    <P>Отправили смету → клиент открыл → оплатил при вас → готово. Не откладывайте на потом. Потом = клиент забыл.</P>

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
      <P>Клиенту всё равно как оплатить — картой или наличкой. Главное чтобы смета была закрыта в приложении.</P>
    </div>
  </div>
);

const clientPrepayment = (
  <div className="space-y-3">
    <P>Вы не платите ничего. Предоплату платит клиент.</P>
    <P>Предоплата 5 000₽ — это бронь мастера и даты.</P>
    <P>Клиент не переплачивает — предоплата входит в стоимость работ.</P>

    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-0.5">
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1">Пример:</p>
      <P>Смета: 32 000₽</P>
      <P>Клиент оплатил предоплату: 5 000₽</P>
      <P>Остаток после работы: 27 000₽</P>
      <P>Итого клиент заплатил: 32 000₽</P>
    </div>
    <P>Всё честно. Клиент платит ту же сумму что в смете.</P>

    <SectionTitle>Что происходит после оплаты:</SectionTitle>
    <div className="space-y-2">
      {[
        "Вам приходит уведомление «Клиент забронировал!»",
        "Лимит на новые заказы разблокируется — можете откликаться на следующие заявки",
        "Вы можете приступать к работе",
        "Клиент получает подтверждение брони и ждёт вас",
      ].map((text, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-base leading-none shrink-0 mt-px">✅</span>
          <p className="text-[14px] text-[#333333] leading-snug">{text}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Почему предоплата важна:</SectionTitle>
    <P>Клиент который оплатил предоплату — серьёзный клиент.</P>
    <P>Он не передумает. Он не пропадёт. Он не начнёт торговаться после работы.</P>
    <P>Клиент который не хочет платить предоплату — обычно проблемный. Экономит на всём. Будет торговаться по цене работы. Может затянуть финальную оплату.</P>

    <div className="bg-green-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Предоплата фильтрует несерьёзных клиентов.</p>
      <P>Вам достаются только те кто точно заплатит.</P>
    </div>
  </div>
);

const ifClientDidntPay = (
  <div className="space-y-3">
    <P>Отправили смету — ждёте оплаты.</P>
    <P>Если клиент не оплатил до вечера — напомните ему про бронь.</P>

    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1 border-l-4 border-gray-300">
      <p className="text-[13px] font-semibold text-gray-500 mb-1">Напишите в WhatsApp:</p>
      <p className="text-[14px] text-[#333333] leading-snug italic">
        «Здравствуйте! Напоминаю про бронь мастера. Оплатите предоплату чтобы зафиксировать дату.
        Если не успеете сегодня — мастер может быть занят на другом объекте.»
      </p>
    </div>

    <SectionTitle>Если клиент просит начать без предоплаты:</SectionTitle>
    <div className="bg-yellow-50 rounded-xl px-3.5 py-3 space-y-2">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Есть исключение</p>
      <P>Если объект начинается в ближайшие 1–2 дня и клиент просит без брони — можно начать работу. Но только при одном условии:</P>
      <P>В первый день работы возьмите аванс у клиента. С этого аванса оплатите комиссию через раздел «Оплата» в приложении.</P>
    </div>

    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1.5">Порядок действий:</p>
      {[
        "Клиент просит начать без брони",
        "Вы договариваетесь на ближайшие 1–2 дня",
        "Выходите на объект",
        "Берёте аванс у клиента",
        "Оплачиваете комиссию через приложение — раздел «Оплата»",
        "Смета закрывается",
        "Лимит разблокируется",
      ].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Если нет оплаты 24 часа и объект не начинается в ближайшие дни:</SectionTitle>
    <div className="space-y-0.5">
      {["Не ждите.", "Не уговаривайте.", "Не договаривайтесь напрямую."].map((phrase, i) => (
        <p key={i} className="text-[14px] font-bold text-red-600 leading-snug">{phrase}</p>
      ))}
    </div>
    <P>Мы сразу готовим для вас новый заказ.</P>

    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1.5">Как это работает:</p>
      {["Отправили смету", "Клиент не оплатил 24 часа", "Мы даём вам новую заявку", "Вы едете на новый замер"].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
    </div>
    <P>Если старый клиент надумает — он оплатит предоплату через смету, вы получите уведомление и вернётесь к нему когда будет удобно.</P>

    <SectionTitle>Почему не нужно уговаривать:</SectionTitle>
    <P>Из 10 клиентов 8 вносят предоплату без проблем.</P>
    <P>А те двое которые не хотят — обычно оказываются проблемными:</P>
    <div className="space-y-0.5 pl-2">
      {["Торгуются по цене работы", "Придираются к качеству", "Затягивают финальную оплату"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[14px] text-gray-400 leading-snug shrink-0">—</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>
    <P>Зачем возиться с проблемным клиентом если есть нормальные?</P>
    <P>Ваша задача — не ждать, а зарабатывать. Заказов много. Клиенты найдутся.</P>

    <div className="bg-red-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">⚠️ Важно:</p>
      <P>Если договоритесь с клиентом напрямую минуя систему — конверсия упадёт. Лимит на новые заказы заблокируется.</P>
      <P>Не рискуйте стабильным потоком ради одного клиента.</P>
    </div>
  </div>
);

const howToEarnMore = (
  <div className="space-y-3">
    <P>Один заказ занимает 2–3 дня. В месяце 22 рабочих дня. Максимум 8–10 заказов в месяц.</P>
    <SectionTitle>Разница в деньгах:</SectionTitle>
    <div className="grid grid-cols-1 gap-2">
      <div className="bg-green-50 rounded-xl px-3.5 py-3 space-y-0.5">
        <p className="text-[14px] font-bold text-green-800 leading-snug mb-1">Мастер с конверсией 80%</p>
        {["8–10 заказов в месяц", "Без простоев между заказами", "Закончил один — следующий уже ждёт", "180 000 — 250 000₽ в месяц"].map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-green-500 leading-none shrink-0 mt-px text-sm">—</span>
            <p className="text-[14px] text-[#333333] leading-snug">{s}</p>
          </div>
        ))}
      </div>
      <div className="bg-red-50 rounded-xl px-3.5 py-3 space-y-0.5">
        <p className="text-[14px] font-bold text-red-800 leading-snug mb-1">Мастер с конверсией 40%</p>
        {["2–3 заказа в месяц", "Простои по 5–7 дней", "Ждёт когда дадут следующий", "40 000 — 70 000₽ в месяц"].map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-red-400 leading-none shrink-0 mt-px text-sm">—</span>
            <p className="text-[14px] text-[#333333] leading-snug">{s}</p>
          </div>
        ))}
      </div>
    </div>

    <p className="text-[14px] font-bold text-[#333333] leading-snug text-center">
      Одна и та же система. Один зарабатывает 250 000₽. Другой 50 000₽. Разница не в руках — разница в конверсии.
    </p>

    <SectionTitle>Как поднять конверсию:</SectionTitle>
    <div className="space-y-2.5">
      {[
        { title: "✅ Приезжайте на замер вовремя", text: "Клиент ждёт. Опоздали — он нашёл другого. Если задерживаетесь — предупредите за 2 часа." },
        { title: "✅ Называйте рыночную цену", text: "Завысили — клиент ушёл. Конверсия упала. Рыночная цена = больше заказов = больше денег." },
        { title: "✅ Общайтесь вежливо", text: "Клиент выбирает не только по цене. Улыбнулись, объяснили, показали фото работ — клиент ваш." },
        { title: "✅ Отправляйте смету на замере", text: "Отправьте пока стоите рядом с клиентом. Не откладывайте на потом. Потом = клиент забыл." },
        { title: "✅ Напоминайте про бронь", text: "Клиент не оплатил до вечера — напомните. Одно сообщение = плюс 20% к оплатам." },
        { title: "✅ Берите все заказы", text: "И мелкие и крупные. Мелкий заказ за 15 000₽ — это 1–2 дня без простоя. Каждый выполненный заказ повышает конверсию." },
      ].map((item, i) => (
        <div key={i}>
          <p className="text-[14px] font-bold text-[#333333] leading-snug">{item.title}</p>
          <p className="text-[14px] text-[#333333] leading-snug mt-0.5">{item.text}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Что убивает конверсию:</SectionTitle>
    <div className="space-y-2.5">
      {[
        { title: "❌ Не приехали на замер", text: "Клиент ждал — вы не приехали. Заявка сгорела. 2–3 дня простоя." },
        { title: "❌ Завысили цены", text: "Клиент сравнил с другими и ушёл. Конверсия упала." },
        { title: "❌ Не отправили смету", text: "Договорились на словах — клиент забыл — не оплатил." },
        { title: "❌ Отказались от мелкого заказа", text: "Каждый отказ = минус к конверсии. Система перестаёт давать даже крупные заказы." },
        { title: "❌ Договорились мимо системы", text: "Конверсия падает. Лимит блокируется. Поток заказов уменьшается." },
      ].map((item, i) => (
        <div key={i}>
          <p className="text-[14px] font-bold text-[#333333] leading-snug">{item.title}</p>
          <p className="text-[14px] text-[#333333] leading-snug mt-0.5">{item.text}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Пример роста:</SectionTitle>
    <div className="space-y-2">
      {[
        { label: "Месяц 1", text: "Конверсия 50% → 4 заказа → простои → 80 000₽" },
        { label: "Месяц 2", text: "Стали отправлять сметы, напоминать про бронь. Конверсия 70% → 7 заказов → меньше простоев → 150 000₽" },
        { label: "Месяц 3", text: "Приезжаете вовремя, рыночные цены, берёте все заказы. Конверсия 85% → 9 заказов → без простоев → 220 000₽" },
      ].map((m, i) => (
        <div key={i} className="bg-gray-50 rounded-xl px-3.5 py-3">
          <p className="text-[13px] font-bold text-gray-500 mb-0.5">{m.label}</p>
          <p className="text-[14px] text-[#333333] leading-snug">{m.text}</p>
        </div>
      ))}
    </div>
    <P>За 3 месяца доход вырос почти в 3 раза. Не потому что работали больше. А потому что не было простоев.</P>

    <div className="bg-green-50 rounded-xl px-3.5 py-3 space-y-0.5">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Простое правило:</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Высокая конверсия = нет простоев = 220 000₽/мес.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Низкая конверсия = простои = 80 000₽/мес.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug mt-1">Каждая упущенная заявка — это 2–3 дня простоя. 2–3 дня простоя — это минус 15 000 — 25 000₽.</p>
    </div>
  </div>
);

const rulesOnSite = (
  <div className="space-y-3">
    <div className="bg-green-50 rounded-xl px-3.5 py-3">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Как вы работаете на объекте — так клиент запоминает всю компанию.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug mt-1">Хорошая работа = хороший отзыв = больше заказов для вас.</p>
    </div>

    <SectionTitle>Перед началом работ:</SectionTitle>
    <div className="space-y-1.5">
      {[
        "Застелите полы плёнкой или картоном",
        "Закройте мебель плёнкой",
        "Сделайте фото ДО начала работ (2–3 фотографии)",
        "Убедитесь что есть все материалы и инструменты",
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[15px] leading-none shrink-0 mt-px text-gray-400">☐</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Во время работы:</SectionTitle>
    <div className="space-y-1.5">
      {[
        "Работайте аккуратно и по технологии",
        "Не курите в помещении",
        "Не употребляйте алкоголь — это основание для немедленного прекращения сотрудничества",
        "Если возникли проблемы или вопросы — напишите нам, решим вместе",
        "Если клиент просит дополнительные работы — скажите «уточню стоимость» и обновите смету в приложении",
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[15px] leading-none shrink-0 mt-px text-gray-400">☐</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>

    <SectionTitle>После завершения работ:</SectionTitle>
    <div className="space-y-1.5">
      {[
        "Уберите за собой: вынесите мусор, уберите остатки материалов, протрите пол",
        "Покажите результат клиенту",
        "Убедитесь что клиент доволен",
        "Сделайте фото ПОСЛЕ (3–5 фото)",
        "Заполните акт в приложении",
        "Попросите клиента подписать акт",
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[15px] leading-none shrink-0 mt-px text-gray-400">☐</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Если клиент недоволен:</SectionTitle>
    <div className="bg-yellow-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Не спорьте с клиентом. Не доказывайте что вы правы.</p>
      <P>Напишите нам — мы разберёмся и поможем решить ситуацию.</P>
      <P>Спокойный мастер + поддержка компании = довольный клиент.</P>
    </div>

    <div className="bg-red-50 rounded-xl px-3.5 py-3 space-y-1.5">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">⚠️ Запрещено:</p>
      {[
        "Курить в помещении клиента",
        "Употреблять алкоголь на объекте",
        "Грубить клиенту",
        "Обсуждать цены и условия в обход приложения",
        "Предлагать клиенту работать напрямую",
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[14px] font-bold text-red-500 leading-none shrink-0 mt-px">❌</span>
          <p className="text-[14px] text-red-700 leading-snug">{item}</p>
        </div>
      ))}
    </div>
  </div>
);

const actAndPhoto = (
  <div className="space-y-3">
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1">После каждого заказа обязательно:</p>
      {["Сделайте фото ДО и ПОСЛЕ", "Заполните акт в приложении", "Клиент подписывает акт", "Скиньте нам фото и акт"].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
      <p className="text-[14px] font-bold text-red-600 leading-snug mt-1.5">Без этого следующий заказ не передаём.</p>
    </div>

    <SectionTitle>Фото ДО начала работ:</SectionTitle>
    <P>Фотографируйте сразу как приехали на объект. До того как что-то тронули.</P>
    <P>Что фотографировать:</P>
    <div className="space-y-0.5 pl-2">
      {["Общий вид комнаты/помещения", "Состояние стен, потолка, пола", "Проблемные места (трещины, неровности, старые обои)"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-gray-400 text-sm leading-snug shrink-0">—</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>
    <P>Минимум 2–3 фото.</P>
    <P><span className="font-semibold">Зачем:</span> Если клиент потом скажет «вы сами сломали» или «это было не так» — у вас есть доказательства.</P>

    <SectionTitle>Фото ПОСЛЕ завершения работ:</SectionTitle>
    <P>Фотографируйте когда всё готово и убрано.</P>
    <P>Что фотографировать:</P>
    <div className="space-y-0.5 pl-2">
      {["Общий вид результата", "Стыки, углы, детали", "Красивые места"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-gray-400 text-sm leading-snug shrink-0">—</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>
    <P>Минимум 3–5 фото.</P>
    <P><span className="font-semibold">Зачем:</span> Это ваше портфолио. Клиенты видят качество ваших работ. Фото попадают в приложение и на сайт. Новые клиенты видят и выбирают вас.</P>

    <SectionTitle>Как заполнить акт:</SectionTitle>
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      {[
        "Откройте заказ в приложении",
        "Нажмите «Заполнить акт»",
        "Укажите итоговую сумму заказа",
        "Перечислите выполненные работы",
        "Дайте клиенту подписать на экране телефона",
        "Нажмите «Завершить заказ»",
      ].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
    </div>
    <P>После этого: клиент получает гарантийный сертификат, ваша конверсия обновляется, лимит на новые заказы остаётся открытым.</P>

    <SectionTitle>Зачем нужен акт с подписью:</SectionTitle>
    <P>Клиент подписал акт — значит принял работу. Потом не сможет сказать «мне плохо сделали», «я не доволен», «верните деньги».</P>
    <p className="text-[14px] font-bold text-green-700 leading-snug">Акт защищает вас. Заполняйте всегда.</p>

    <div className="bg-green-50 rounded-xl px-3.5 py-3 space-y-0.5">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Совет:</p>
      <P>Фотографируйте красиво. Это ваше портфолио.</P>
      <P>Хорошие фото = больше доверия клиентов = больше заказов для вас.</P>
    </div>
  </div>
);

const warranty = (
  <div className="space-y-3">
    <div className="bg-blue-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">После каждого завершённого заказа клиент получает гарантийный сертификат на 2 года.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Это наше обещание клиенту — если что-то пойдёт не так по вашей вине, мы исправим.</p>
    </div>

    <SectionTitle>Что входит в гарантию:</SectionTitle>
    <div className="space-y-1.5">
      {["Бесплатное исправление дефектов", "Бесплатный выезд мастера", "Повторное выполнение работ если нужно"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-base leading-none shrink-0 mt-px">✅</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>
    <P>Срок: 2 года с даты подписания акта.</P>

    <SectionTitle>Если клиент обратился по гарантии:</SectionTitle>
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      {["Нам поступает обращение", "Мы связываемся с вами", "Вы приезжаете к клиенту в течение 5 рабочих дней", "Осматриваете и исправляете", "Бесплатно"].map((step, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-[13px] font-bold text-gray-400 w-4 shrink-0 pt-px">{i + 1}.</span>
          <p className="text-[14px] text-[#333333] leading-snug">{step}</p>
        </div>
      ))}
    </div>
    <p className="text-[14px] font-bold text-[#333333] leading-snug">Это ваша ответственность за качество работы.</p>

    <SectionTitle>На что гарантия НЕ распространяется:</SectionTitle>
    <div className="space-y-1.5">
      {["Механические повреждения — клиент сам повредил", "Затопление соседями", "Естественный износ материалов", "Работы выполненные другими мастерами"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-base leading-none shrink-0 mt-px">❌</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Почему это важно для вас:</SectionTitle>
    <p className="text-[14px] font-bold text-green-700 leading-snug">Гарантия — это не страшно.</p>
    <P>За 2 года по гарантии обращаются очень редко — только если работа сделана некачественно.</P>
    <P>Если вы работаете хорошо — гарантийных случаев почти не будет.</P>
    <P>Зато клиент видит сертификат и доверяет вам больше. Доверие = оплата предоплаты = высокая конверсия = больше заказов для вас.</P>

    <div className="bg-green-50 rounded-xl px-3.5 py-3 space-y-0.5">
      <p className="text-[14px] font-bold text-[#333333] leading-snug">💡 Совет:</p>
      <P>Покажите клиенту на замере что после работы он получит гарантийный сертификат.</P>
      <P>Это убеждает оплатить предоплату. Клиенты любят гарантии.</P>
    </div>
  </div>
);

const bonusForBest = (
  <div className="space-y-3">
    <div className="rounded-xl px-3.5 py-3 space-y-0.5" style={{ backgroundColor: "#FFF9E6" }}>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Мы ценим мастеров которые работают хорошо.</p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug">Для лучших мастеров — особые условия.</p>
    </div>

    <SectionTitle>Как получить статус «Топ-мастер»:</SectionTitle>
    <p className="text-[17px] font-bold text-green-700 leading-snug text-center">Конверсия 90%+ три месяца подряд</p>
    <P>Это значит:</P>
    <div className="space-y-1 pl-2">
      {[
        "Приезжаете на замеры вовремя",
        "Называете рыночные цены",
        "Отправляете сметы через приложение",
        "9 из 10 клиентов оплачивают предоплату",
        "Берёте все заказы — и мелкие и крупные",
        "Клиенты довольны вашей работой",
      ].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-gray-400 text-sm leading-snug shrink-0 mt-px">—</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Что даёт статус «Топ-мастер»:</SectionTitle>
    <div className="space-y-2">
      {[
        { icon: "🔥", title: "Первый приоритет", text: "Заказы приходят вам раньше всех остальных. Пока другие ждут — вы уже работаете." },
        { icon: "🔥", title: "Крупные объекты", text: "Заказы за 50 000 — 150 000₽ идут только топ-мастерам." },
        { icon: "🔥", title: "Без простоев", text: "Закончили один заказ — следующий уже ждёт. Стабильная загрузка каждую неделю." },
        { icon: "🔥", title: "Бонус 5 000₽", text: "Ежемесячный бонус на ваш баланс." },
        { icon: "🔥", title: "Значок в профиле", text: "Клиенты видят что вы лучший мастер сервиса. Больше доверия = выше конверсия." },
      ].map((item, i) => (
        <div key={i} className="bg-orange-50 rounded-xl px-3.5 py-3">
          <p className="text-[14px] font-bold text-[#333333] leading-snug">{item.icon} {item.title}</p>
          <p className="text-[14px] text-[#333333] leading-snug mt-0.5">{item.text}</p>
        </div>
      ))}
    </div>

    <SectionTitle>Сколько можно заработать в статусе «Топ-мастер»:</SectionTitle>
    <div className="space-y-0.5 pl-2">
      {["8–10 заказов в месяц", "Средний заказ 30 000₽", "Без простоев"].map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-gray-400 text-sm leading-snug shrink-0 mt-px">—</span>
          <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
        </div>
      ))}
    </div>
    <p className="text-[18px] font-bold text-green-700 leading-snug text-center">180 000 — 250 000₽ в месяц</p>
    <p className="text-[14px] font-bold text-green-700 leading-snug text-center">+ бонус 5 000₽ + крупные объекты</p>
    <P>Это реально. Это зарабатывают наши лучшие мастера.</P>

    <SectionTitle>Как следить за прогрессом:</SectionTitle>
    <div className="bg-gray-50 rounded-xl px-3.5 py-3 space-y-1">
      <p className="text-[14px] font-bold text-[#333333] leading-snug mb-1">Откройте кабинет → Профиль → Моя статистика</p>
      <P>Там видно:</P>
      <div className="space-y-0.5 pl-2">
        {[
          "Текущая конверсия",
          "Сколько месяцев подряд конверсия выше 90%",
          "До статуса «Топ-мастер» осталось: X месяцев",
          "Ваш текущий статус",
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-gray-400 text-sm leading-snug shrink-0 mt-px">—</span>
            <p className="text-[14px] text-[#333333] leading-snug">{item}</p>
          </div>
        ))}
      </div>
    </div>

    <SectionTitle>Начните сегодня:</SectionTitle>
    <P>Каждый заказ который вы доводите до оплаты — это шаг к статусу «Топ-мастер».</P>
    <P>Каждая смета отправленная вовремя — это шаг.</P>
    <P>Каждый довольный клиент — это шаг.</P>
    <p className="text-[15px] font-bold text-green-700 leading-snug text-center pt-1">У вас всё получится 💪</p>
  </div>
);

// ─── Sections list ────────────────────────────────────────────────────────────

const SECTIONS = [
  { icon: ICONS.orders,   title: "Как получать заказы",     content: howToGetOrders },
  { icon: ICONS.estimate, title: "Как работает смета",      content: howEstimateWorks },
  { icon: ICONS.prepay,   title: "Предоплата клиента",      content: clientPrepayment },
  { icon: ICONS.unpaid,   title: "Если клиент не оплатил",  content: ifClientDidntPay },
  { icon: ICONS.earn,     title: "Как зарабатывать больше", content: howToEarnMore },
  { icon: ICONS.site,     title: "Правила на объекте",      content: rulesOnSite },
  { icon: ICONS.photo,    title: "Акт и фото",              content: actAndPhoto },
  { icon: ICONS.warranty, title: "Гарантия",                content: warranty },
  { icon: ICONS.bonus,    title: "Бонус для лучших",        content: bonusForBest },
];

// ─── Accordion ────────────────────────────────────────────────────────────────

function AccordionItem({
  icon, title, content, isOpen, onToggle, isLast,
}: {
  icon: React.ReactNode;
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
        className="w-full flex items-center justify-between px-4 py-3.5 bg-white text-left active:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-[15px] text-gray-900">{title}</span>
        </span>
        <ChevronRight
          size={18}
          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-5 pt-1 bg-white">
          {content}
        </div>
      )}

      {!isLast && <div className="h-px bg-gray-100" />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function WorkRulesView() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Link
          href="/cabinet/profile"
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--color-background)] transition-colors text-[var(--color-muted)]"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Правила работы</h1>
      </header>

      <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[var(--color-border)]">
        {SECTIONS.map((section, i) => (
          <AccordionItem
            key={i}
            icon={section.icon}
            title={section.title}
            content={section.content}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(prev => (prev === i ? null : i))}
            isLast={i === SECTIONS.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
