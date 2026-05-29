import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Stats from './components/Stats';
import HowItWorks from './components/HowItWorks';
import WhatPartnerDoes from './components/WhatPartnerDoes';
import Income from './components/Income';
import WhyBetter from './components/WhyBetter';
import Cabinet from './components/Cabinet';
import WhoFits from './components/WhoFits';
import HowToStart from './components/HowToStart';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

export default function App() {
  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh' }}>
      <Navbar />
      <Hero />
      <Stats />
      <HowItWorks />
      <WhatPartnerDoes />
      <Income />
      <WhyBetter />
      <Cabinet />
      <WhoFits />
      <HowToStart />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
