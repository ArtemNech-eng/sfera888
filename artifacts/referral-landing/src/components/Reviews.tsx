import { motion } from "framer-motion";
import { Star, Quote } from 'lucide-react';
import SectionHeader from "./SectionHeader";

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
        <Star key={i} size={14} className="text-amber-400" fill="#fbbf24" />
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-sm shadow-sm">
      {initials}
    </div>
  );
}

export default function Reviews() {
  return (
    <section id="reviews" className="py-24 bg-white relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-50/40 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          title="Отзывы клиентов"
          subtitle=""
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-12"
        >
          <div className="inline-flex items-center gap-2 gradient-bg text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg shadow-emerald-500/20">
            <Star size={16} fill="white" />
            Средний рейтинг мастеров: 4.8 / 5
          </div>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {reviews.map((review, i) => (
            <motion.div
              key={review.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="glass rounded-3xl p-6 flex flex-col gap-4 hover:shadow-premium transition-shadow duration-300"
            >
              <div className="flex items-center justify-between">
                <StarRating count={review.rating} />
                <Quote size={20} className="text-emerald-200" />
              </div>
              <p className="text-gray-600 text-sm leading-relaxed flex-1">«{review.text}»</p>
              <div className="border-t border-gray-100 pt-4 flex items-center gap-3">
                <Avatar name={review.name} />
                <div>
                  <p className="text-[#111827] font-bold text-sm">{review.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{review.location} · {review.work}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
