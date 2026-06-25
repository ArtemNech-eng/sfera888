import Hero from './Hero';
import HowItWorks from './HowItWorks';
import Benefits from './Benefits';
import Conditions from './Conditions';
import Earnings from './Earnings';
import Marketplace from './Marketplace';
import FAQ from './FAQ';
import RegistrationForm from './RegistrationForm';
import FinalCTA from './FinalCTA';

export default function Landing() {
  return (
    <div
      className="min-h-screen text-[#0F172A]"
      style={{ backgroundColor: '#FAFAF7' }}
    >
      <Hero />
      <HowItWorks />
      <Benefits />
      <Conditions />
      <Earnings />
      <Marketplace />
      <FAQ />
      <RegistrationForm />
      <FinalCTA />

      {/* Footer */}
      <footer className="py-10 border-t border-[#EDEAE2]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[#94A3B8] text-sm">
            © {new Date().getFullYear()} Честные Мастера · chestnye-mastera.ru
          </p>
        </div>
      </footer>
    </div>
  );
}
