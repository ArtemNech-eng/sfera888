import { motion } from "framer-motion";
import SectionHeader from "./SectionHeader";
import { Smartphone, Bell, MessageCircle, CreditCard, Home, ClipboardList, User } from "lucide-react";

const features = [
  {
    icon: Bell,
    title: "Push-уведомления",
    text: "Мастер откликнулся — вы узнаете первым. Никаких пропущенных звонков.",
  },
  {
    icon: MessageCircle,
    title: "Чат с мастером",
    text: "Обсуждайте детали, фото и смету прямо в приложении.",
  },
  {
    icon: CreditCard,
    title: "Оплата по факту",
    text: "Платите только за выполненную работу. Прозрачная смета до старта.",
  },
  {
    icon: Smartphone,
    title: "Всё в телефоне",
    text: "Заявка, чат, смета, оплата — одно приложение, ноль хаоса.",
  },
];

export default function AppDemo() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Ваш заказ в телефоне"
          subtitle="Всё управление ремонтом — в одном месте. Без звонков менеджерам и бумажной волокиты."
        />

        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Features list */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex-1 space-y-6"
          >
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="flex gap-4 p-5 rounded-2xl hover:bg-emerald-50/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
                    <Icon size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-[#111827] font-bold text-lg mb-1">{f.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{f.text}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Phone mockups */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="flex-1 relative flex justify-center"
          >
            <div className="relative">
              {/* Phone 1 - back */}
              <div className="absolute -top-4 -left-8 w-48 sm:w-56 rounded-[2rem] border-8 border-gray-900 shadow-2xl overflow-hidden rotate-[-12deg] opacity-70">
                <div className="bg-emerald-50 aspect-[9/19] flex items-center justify-center">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full gradient-bg mx-auto mb-3 flex items-center justify-center">
                      <Bell size={20} className="text-white" />
                    </div>
                    <div className="text-xs font-bold text-gray-700">Новый отклик</div>
                    <div className="text-[10px] text-gray-400 mt-1">Мастер Игорь готов приступить</div>
                  </div>
                </div>
              </div>

              {/* Phone 2 - front */}
              <div className="relative w-56 sm:w-64 rounded-[2.5rem] border-[10px] border-gray-900 shadow-premium overflow-hidden z-10">
                <div className="bg-white aspect-[9/19] p-4 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center">
                      <Smartphone size={14} className="text-white" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-800">Честный Мастер</div>
                      <div className="text-[9px] text-emerald-500">онлайн</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-gray-100 rounded-xl p-3 text-[10px] text-gray-600">
                      <div className="font-semibold text-gray-800 mb-1">AI Смета готова</div>
                      <div>Обои + шпаклёвка: 22 000 ₽</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-[10px] text-emerald-800 ml-auto max-w-[80%]">
                      Мастер И. подтвердил готовность
                    </div>
                    <div className="bg-gray-100 rounded-xl p-3 text-[10px] text-gray-600">
                      <div className="font-semibold text-gray-800 mb-1">Статус заказа</div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div className="bg-emerald-500 h-1.5 rounded-full w-2/3" />
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-[10px] text-emerald-800 ml-auto max-w-[80%]">
                      <div className="font-semibold text-emerald-900 mb-1">Оплата по факту</div>
                      <div>22 000 ₽ — после приёмки работ</div>
                    </div>
                    {/* Repair photo */}
                    <div className="bg-gray-100 rounded-xl p-2 mt-1">
                      <img
                        src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=80"
                        alt="Фото ремонта"
                        className="rounded-lg w-full h-20 object-cover"
                        loading="lazy"
                      />
                      <div className="text-[9px] text-gray-400 mt-1">Фото ремонта</div>
                    </div>
                  </div>

                  {/* Bottom navigation */}
                  <div className="mt-auto pt-3 border-t border-gray-100 flex justify-around items-center">
                    <Home size={16} className="text-emerald-500" />
                    <ClipboardList size={16} className="text-gray-400" />
                    <MessageCircle size={16} className="text-gray-400" />
                    <User size={16} className="text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Decorative glow */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-64 h-20 bg-emerald-400/20 rounded-full blur-3xl" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
