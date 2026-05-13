import Hero from './Hero';
import System from './System';
import Model from './Model';
import Pricing from './Pricing';
import Comparison from './Comparison';
import Earnings from './Earnings';
import WhoWeNeed from './WhoWeNeed';
import HowToStart from './HowToStart';
import FAQ from './FAQ';
import FinalCTA from './FinalCTA';

export default function HonestLanding() {
  return (
    <div className="min-h-screen bg-honest-dark text-white">
      <Hero />
      <System />
      <Model />
      <Pricing />
      <Comparison />
      <Earnings />
      <WhoWeNeed />
      <HowToStart />
      <FAQ />
      <FinalCTA />
    </div>
  );
}