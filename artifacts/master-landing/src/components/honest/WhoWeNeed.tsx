import { UserCheck, Code, Palette, PenTool, BarChart3, Globe } from 'lucide-react';

export default function WhoWeNeed() {
  const categories = [
    {
      icon: <Code className="w-8 h-8" />,
      title: 'Разработчики',
      skills: ['Frontend', 'Backend', 'Мобильные приложения', 'CMS-системы'],
    },
    {
      icon: <Palette className="w-8 h-8" />,
      title: 'Дизайнеры',
      skills: ['UI/UX', 'Графический дизайн', 'Веб-дизайн', 'Иллюстрации'],
    },
    {
      icon: <PenTool className="w-8 h-8" />,
      title: 'Копирайтеры',
      skills: ['Тексты для сайтов', 'SEO-статьи', 'Рекламные материалы', 'Транскрибация'],
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: 'Маркетологи',
      skills: ['SEO-оптимизация', 'SMM', 'Контекстная реклама', 'Аналитика'],
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: 'Переводчики',
      skills: ['Технический перевод', 'Литературный перевод', 'Субтитры', 'Локализация'],
    },
    {
      icon: <UserCheck className="w-8 h-8" />,
      title: 'Другие специалисты',
      skills: ['Тестировщики', 'Аналитики', 'Консультанты', 'Поддержка'],
    },
  ];

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-darker to-honest-dark z-0"></div>
      <div className="absolute -right-20 bottom-1/4 w-64 h-64 bg-honest-secondary/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Кто нам </span>
            <span className="text-honest-primary">нужен</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Платформа открыта для мастеров разных специализаций — от начинающих до экспертов.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {categories.map((cat, idx) => (
            <div
              key={idx}
              className="group bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-6 hover:border-honest-primary/30 hover:shadow-honest-glow transition-all"
            >
              <div className="mb-4 inline-flex p-3 bg-honest-dark/60 rounded-xl text-honest-primary">
                {cat.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-4">{cat.title}</h3>
              <ul className="space-y-2">
                {cat.skills.map((skill, i) => (
                  <li key={i} className="flex items-center gap-2 text-honest-light">
                    <div className="w-1.5 h-1.5 bg-honest-primary rounded-full"></div>
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-white mb-6">Требования к мастеру</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-primary/20 rounded">
                  <div className="w-4 h-4 bg-honest-primary rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Портфолио или примеры работ</h4>
                  <p className="text-honest-light text-sm mt-1">Хотя бы 3–5 примеров выполненных проектов</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-primary/20 rounded">
                  <div className="w-4 h-4 bg-honest-primary rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Готовность работать по договору</h4>
                  <p className="text-honest-light text-sm mt-1">Оформление через платформу, никаких дополнительных документов</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-primary/20 rounded">
                  <div className="w-4 h-4 bg-honest-primary rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Ответственность и соблюдение сроков</h4>
                  <p className="text-honest-light text-sm mt-1">Мы ценим репутацию и качество работы</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-white mb-6">Что мы предлагаем взамен</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-accent/20 rounded">
                  <div className="w-4 h-4 bg-honest-accent rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Постоянный поток заказов</h4>
                  <p className="text-honest-light text-sm mt-1">AI‑подбор под ваши навыки и занятость</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-accent/20 rounded">
                  <div className="w-4 h-4 bg-honest-accent rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Юридическая защита</h4>
                  <p className="text-honest-light text-sm mt-1">Договоры, гарантии оплаты, разрешение споров</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-honest-accent/20 rounded">
                  <div className="w-4 h-4 bg-honest-accent rounded-full"></div>
                </div>
                <div>
                  <h4 className="text-white font-semibold">Поддержка и развитие</h4>
                  <p className="text-honest-light text-sm mt-1">Обучение, вебинары, сообщество мастеров</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}