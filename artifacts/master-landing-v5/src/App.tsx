import Navbar from './components/Navbar';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import WhyPlatform from './components/WhyPlatform';
import TestOrder from './components/TestOrder';
import OneOrder from './components/OneOrder';
import Benefits from './components/Benefits';
import Packages from './components/Packages';
import Earnings from './components/Earnings';
import WhoWeHire from './components/WhoWeHire';
import HowToStart from './components/HowToStart';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="font-['Inter',sans-serif] antialiased bg-[#F8FAFC]">
      <Navbar />
      <Hero />
      <HowItWorks />
      <WhyPlatform />
      <TestOrder />
      <OneOrder />
      <Benefits />
      <Packages />
      <Earnings />
      <WhoWeHire />
      <HowToStart />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
