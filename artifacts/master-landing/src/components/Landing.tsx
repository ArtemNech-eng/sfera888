import Hero from './Hero';
import System from './System';
import Conditions from './Conditions';
import Comparison from './Comparison';
import Tools from './Tools';
import Earnings from './Earnings';
import Selection from './Selection';
import HowToStart from './HowItWorks';
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
      <System />
      <Conditions />
      <Comparison />
      <Tools />
      <Earnings />
      <Selection />
      <HowToStart />
      <FAQ />
      <RegistrationForm />
      <FinalCTA />

      {/* Footer */}
      <footer className="py-10 border-t border-[#EDEAE2] bg-[#FAFAF7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[#0F172A] font-semibold mb-2">
            Честный Мастер · IT-платформа для мастеров
          </p>
          <p className="text-[#94A3B8] text-sm mb-4">
            © {new Date().getFullYear()} Все права защищены
          </p>
          <a
            href="/master-pwa/login"
            className="text-[#D9342B] text-sm font-medium hover:underline"
          >
            Войти в приложение →
          </a>
        </div>
      </footer>
    </div>
  );
}
