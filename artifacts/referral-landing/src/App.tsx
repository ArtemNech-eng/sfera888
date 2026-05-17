import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Services from './components/Services';
import TrustBlock from './components/TrustBlock';
import HowItWorks from './components/HowItWorks';
import Reviews from './components/Reviews';
import ApplicationForm from './components/ApplicationForm';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import StickyCTA from './components/StickyCTA';
import { useRefSlug } from './hooks/useRefSlug';

export default function App() {
  const refSlug = useRefSlug();

  return (
    <div className="font-[Inter,_system-ui,_sans-serif] antialiased text-[#111827]">
      <Navbar />
      <main>
        <Hero refSlug={refSlug} />
        <Services />
        <TrustBlock />
        <HowItWorks />
        <Reviews />
        <ApplicationForm refSlug={refSlug} />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <StickyCTA />
    </div>
  );
}
