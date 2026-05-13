import { ArrowRight, CheckCircle, Package, Clock } from 'lucide-react';

export default function System() {
  return (
    <section className="relative py-20 sm:py-28">
      {/* Neon separator */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4 text-center">
          Принцип конвейера: <span className="text-[#38BDF8]">взял → сделал → взял новый</span>
        </h2>

        <p className="text-[#94A3B8] text-center max-w-3xl mx-auto mb-12 text-lg">
          Мы не позволяем мастерам браться за 5 объектов и срывать сроки.
          По умолчанию: 1 активный заказ в одни руки.
        </p>

        {/* Flow visualization */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-2 mb-12">
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-[#111827] border border-[#34F5A3]/20 backdrop-blur-sm">
            <Package className="w-6 h-6 text-[#34F5A3]" />
            <span className="text-[#F8FAFC] font-medium">Взял объект</span>
          </div>
          <ArrowRight className="w-6 h-6 text-[#34F5A3] hidden sm:block" />
          <div className="sm:hidden w-[1px] h-6 bg-[#34F5A3]/30" />
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-[#111827] border border-[#38BDF8]/20 backdrop-blur-sm">
            <Clock className="w-6 h-6 text-[#38BDF8]" />
            <span className="text-[#F8FAFC] font-medium">Сделал</span>
          </div>
          <ArrowRight className="w-6 h-6 text-[#38BDF8] hidden sm:block" />
          <div className="sm:hidden w-[1px] h-6 bg-[#38BDF8]/30" />
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-[#111827] border border-[#FACC15]/20 backdrop-blur-sm">
            <CheckCircle className="w-6 h-6 text-[#FACC15]" />
            <span className="text-[#F8FAFC] font-medium">Закрыл</span>
          </div>
          <ArrowRight className="w-6 h-6 text-[#FACC15] hidden sm:block" />
          <div className="sm:hidden w-[1px] h-6 bg-[#FACC15]/30" />
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-[#111827] border border-[#34F5A3]/20 backdrop-blur-sm">
            <Package className="w-6 h-6 text-[#34F5A3]" />
            <span className="text-[#F8FAFC] font-medium">Получил следующий</span>
          </div>
        </div>

        {/* Info card */}
        <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-[#111827]/60 border border-[#34F5A3]/10 backdrop-blur-sm">
          <p className="text-[#94A3B8] text-center leading-relaxed">
            Так система остаётся управляемой, клиенты довольны, а сильные мастера работают без простоев.
          </p>
          <p className="text-[#34F5A3] text-center mt-3 font-medium">
            Для лучших мастеров с высокой конверсией лимит может быть увеличен до двух объектов одновременно.
          </p>
        </div>
      </div>
    </section>
  );
}
