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

export default function App() {
  const goToApp = () => {
    window.location.href = '/master-pwa/';
  };

  return (
    <div className="min-h-screen">
      <Header onCtaClick={goToApp} />
      <main>
        <Hero onCtaClick={goToApp} />
        <Principle />
        <HowItWorks />
        <WhyBeneficial />
        <Earnings />
        <Conditions />
        <WhoWeNeed />
        <HowToStart />
        <FAQ />
        <Trust />
        <FinalCTA onCtaClick={goToApp} />
      </main>
      <Footer />
    </div>
  );
}
