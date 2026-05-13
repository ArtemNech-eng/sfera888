import { useRef } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Principle from './components/Principle';
import HowItWorks from './components/HowItWorks';
import WhyBeneficial from './components/WhyBeneficial';
import Earnings from './components/Earnings';
import Conditions from './components/Conditions';
import WhoWeNeed from './components/WhoWeNeed';
import HowToStart from './components/HowToStart';
import RegistrationForm from './components/RegistrationForm';
import FAQ from './components/FAQ';
import Trust from './components/Trust';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

export default function App() {
  const formRef = useRef<HTMLElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen">
      <Header onCtaClick={scrollToForm} />
      <main>
        <Hero onCtaClick={scrollToForm} />
        <Principle />
        <HowItWorks />
        <WhyBeneficial />
        <Earnings />
        <Conditions />
        <WhoWeNeed />
        <HowToStart />
        <RegistrationForm ref={formRef} />
        <FAQ />
        <Trust />
        <FinalCTA onCtaClick={scrollToForm} />
      </main>
      <Footer />
    </div>
  );
}
