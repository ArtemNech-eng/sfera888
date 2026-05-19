import Navbar from './components/Navbar';
import Hero from './components/Hero';
import StatsBar from './components/StatsBar';
import Services from './components/Services';
import TrustBlock from './components/TrustBlock';
import HowItWorks from './components/HowItWorks';
import AppDemo from './components/AppDemo';
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
    <div className="font-['Plus_Jakarta_Sans',_system-ui,_sans-serif] antialiased text-[#111827]">
      <Navbar />
      <main>
        <Hero refSlug={refSlug} />
        <StatsBar />
        <Services />
        <TrustBlock />
        <HowItWorks />
        <AppDemo />
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
