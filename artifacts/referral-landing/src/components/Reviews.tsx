const reviews = [
  {
    name: 'Наталья К.',
    location: 'Москва, Хорошёво',
    work: 'Поклейка обоев',
    rating: 5,
    text: 'Мастера нашли буквально за 20 минут. Позвонил, уточнил всё, приехал в день замера. Смета — без сюрпризов. Сделал аккуратно, даже убрал за собой.',
  },
  {
    name: 'Алексей Г.',
    location: 'Санкт-Петербург, Московский р-н',
    work: 'Санузел под ключ',
    rating: 5,
    text: 'Пришёл по рекомендации и сразу получил скидку 10%. Мастер разобрался с планировкой за день, смета была чёткой. Никто не пропал, сделали точно в срок.',
  },
  {
    name: 'Марина С.',
    location: 'Екатеринбург, Ленинский р-н',
    work: 'Шпаклёвка + покраска',
    rating: 5,
    text: 'Долго искала нормального мастера. Здесь оставила заявку вечером — утром уже звонили. Мастер аккуратный, объяснил каждый этап. Очень довольна.',
  },
  {
    name: 'Дмитрий В.',
    location: 'Новосибирск, Центр',
    work: 'Укладка плитки',
    rating: 5,
    text: 'Честно: не верил, что так быстро. Оставил заявку — через 25 минут мастер написал. Плитку уложили ровно, швы одинаковые. Рекомендую.',
  },
  {
    name: 'Ольга Р.',
    location: 'Москва, Бутово',
    work: 'Квартира под ключ',
    rating: 5,
    text: 'Делали ремонт в двушке. Мастер один вёл весь объект — и стены, и плитку, и электрику. Смета совпала с итоговой суммой. Гарантию дали письменно.',
  },
  {
    name: 'Иван Ф.',
    location: 'Краснодар, Прикубанский р-н',
    work: 'Электрика',
    rating: 5,
    text: 'Документы мастера проверили заранее — это важно. Работал быстро и чисто. По рекомендации досталась скидка, что приятно. Порядок.',
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="none">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

export default function Reviews() {
  return (
    <section id="reviews" className="bg-[#F8FAFC] py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Отзывы клиентов
          </h2>
          <div className="inline-flex items-center gap-2 bg-[#E8F9EE] text-[#1a8a3c] text-sm font-semibold px-4 py-2 rounded-full">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#34C759" stroke="none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Средний рейтинг мастеров: 4.8 / 5
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map((review) => (
            <div
              key={review.name}
              className="bg-white rounded-2xl p-6 border border-[#E5E7EB] flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <StarRating count={review.rating} />
              <p className="text-[#374151] text-sm leading-relaxed flex-1">«{review.text}»</p>
              <div className="border-t border-[#F1F5F9] pt-3">
                <p className="text-[#111827] font-semibold text-sm">{review.name}</p>
                <p className="text-[#94A3B8] text-xs mt-0.5">{review.location} · {review.work}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
