
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import WorkModel from './components/WorkModel';
import Pricing from './components/Pricing';
import Comparison from './components/Comparison';
import Earnings from './components/Earnings';
import WhoWeHire from './components/WhoWeHire';
import MasterBenefits from './components/MasterBenefits';
import HowToStart from './components/HowToStart';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import LiveActivityToast from './components/LiveActivityToast';

const BOT_URL = '/master-pwa/';

function App() {
  return (
    <div className="min-h-screen bg-white text-[#0F172A] overflow-x-hidden">
      <Navbar botUrl={BOT_URL} />

      <main>
        {/* 1. Hero */}
        <Hero botUrl={BOT_URL} />

        {/* 2. Как работает конвейер заказов */}
        <HowItWorks />

        {/* 3. Модель работы: Тест-драйв vs Пакеты */}
        <WorkModel botUrl={BOT_URL} />

        {/* 4. Тарифы / Пакеты заказов */}
        <Pricing botUrl={BOT_URL} />

        {/* 5. Почему это лучше Авито и Профи */}
        <Comparison />

        {/* 6. Что получает мастер внутри */}
        <MasterBenefits />

        {/* 7. Сколько можно зарабатывать */}
        <Earnings />

        {/* 8. Кого мы берём в систему */}
        <WhoWeHire />

        {/* 9. Как подключиться */}
        <HowToStart botUrl={BOT_URL} />

        {/* 10. FAQ */}
        <FAQ />

        {/* 11. Финальный CTA */}
        <FinalCTA botUrl={BOT_URL} />
      </main>

      <Footer botUrl={BOT_URL} />
      <LiveActivityToast />
    </div>
  );
}

export default App;
