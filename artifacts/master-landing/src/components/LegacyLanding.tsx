import { useRef } from 'react';
import Header from './Header';
import Hero from './Hero';
import HowItWorks from './HowItWorks';
import WhyBeneficial from './WhyBeneficial';
import Conditions from './Conditions';
import Earnings from './Earnings';
import WhoWeNeed from './WhoWeNeed';
import Trust from './Trust';
import Principle from './Principle';
import HowToStart from './HowToStart';
import FAQ from './FAQ';
import FinalCTA from './FinalCTA';
import Footer from './Footer';

export default function LegacyLanding() {
  const ctaRef = useRef<HTMLDivElement>(null);

  const scrollToCta = () => {
    ctaRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      <Header onCtaClick={scrollToCta} />
      <Hero onCtaClick={scrollToCta} />
      <HowItWorks />
      <WhyBeneficial />
      <Conditions />
      <Earnings />
      <WhoWeNeed />
      <Trust />
      <Principle />
      <HowToStart />
      <FAQ />
      <div ref={ctaRef}>
        <FinalCTA onCtaClick={scrollToCta} />
      </div>
      <Footer />
    </div>
  );
}
