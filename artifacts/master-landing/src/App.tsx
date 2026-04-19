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

const PWA_URL = import.meta.env.VITE_PWA_URL || '/master-pwa/';

export function openBot() {
  const sep = PWA_URL.includes('?') ? '&' : '?';
  window.location.href = `${PWA_URL}${sep}ref=landing`;
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
