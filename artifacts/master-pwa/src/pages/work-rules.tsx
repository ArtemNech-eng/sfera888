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
    <P>
      Клиент который не хочет платить предоплату — обычно проблемный.
      Экономит на всём. Будет торговаться по цене работы. Может затянуть финальную оплату.
    </P>

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
      {[
        "Отправили смету",
        "Клиент не оплатил 24 часа",
        "Мы даём вам новую заявку",
        "Вы едете на новый замер",
      ].map((step, i) => (
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
      Одна и та же система.{"\n"}Один зарабатывает 250 000₽. Другой 50 000₽.{"\n"}Разница не в руках — разница в конверсии.
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
      <p className="text-[14px] font-bold text-[#333333] leading-snug">
        Как вы работаете на объекте — так клиент запоминает всю компанию.
      </p>
      <p className="text-[14px] font-bold text-[#333333] leading-snug mt-1">
        Хорошая работа = хороший отзыв = больше заказов для вас.
      </p>
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
        ["Уберите за собой: вынесите мусор, уберите остатки материалов, протрите пол"],
        ["Покажите результат клиенту"],
        ["Убедитесь что клиент доволен"],
        ["Сделайте фото ПОСЛЕ (3–5 фото)"],
        ["Заполните акт в приложении"],
        ["Попросите клиента подписать акт"],
      ].map(([item], i) => (
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

const SECTIONS: Section[] = [
  { emoji: "📋", title: "Как получать заказы", content: howToGetOrders },
  { emoji: "📱", title: "Как работает смета", content: howEstimateWorks },
  { emoji: "💰", title: "Предоплата клиента", content: clientPrepayment },
  { emoji: "⏳", title: "Если клиент не оплатил", content: ifClientDidntPay },
  { emoji: "📈", title: "Как зарабатывать больше", content: howToEarnMore },
  { emoji: "🔨", title: "Правила на объекте", content: rulesOnSite },
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
