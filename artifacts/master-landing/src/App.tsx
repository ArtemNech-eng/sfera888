import Header from './components/Header';
import Hero from './components/Hero';
import Principle from './components/Principle';
import HowItWorks from './components/HowItWorks';
import WhyBeneficial from './components/WhyBeneficial';
import Earnings from './components/Earnings';
import Conditions from './components/Conditions';
import WhoWeNeed from './components/WhoWeNeed';
import HowToStart from './components/HowToStart';
import FAQ from './components/FAQ';
import Trust from './components/Trust';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

const BOT_URL = import.meta.env.VITE_MAX_BOT_URL || 'https://max.ru/sfera_master';

export function openBot() {
  const url = BOT_URL.includes('?')
    ? `${BOT_URL}&start=landing`
    : `${BOT_URL}?start=landing`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Header onCtaClick={openBot} />
      <main>
        <Hero onCtaClick={openBot} />
        <Principle />
        <HowItWorks />
        <WhyBeneficial />
        <Earnings />
        <Conditions />
        <WhoWeNeed />
        <HowToStart />
        <FAQ />
        <Trust />
        <FinalCTA onCtaClick={openBot} />
      </main>
      <Footer />
    </div>
  );
}
