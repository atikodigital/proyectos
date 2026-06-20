import React from 'react';
import ScrollBackground from './components/ui/scroll-background.jsx';
import Hero from './kaly/Hero.jsx';
import DosFamilias from './sections/DosFamilias.jsx';
import ComoFunciona from './sections/ComoFunciona.jsx';
import Features from './sections/Features.jsx';
import Planes from './sections/Planes.jsx';
import CtaFinal from './sections/CtaFinal.jsx';
import Footer from './sections/Footer.jsx';

export default function App() {
  return (
    <div className="bg-black text-hud-text min-h-screen">
      <ScrollBackground />
      <Hero />
      <DosFamilias />
      <ComoFunciona />
      <Features />
      <Planes />
      <CtaFinal />
      <Footer />
    </div>
  );
}
