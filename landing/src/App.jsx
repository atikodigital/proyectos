import React from 'react';
import Hero from './kaly/Hero.jsx';
import DosFamilias from './sections/DosFamilias.jsx';
import ComoFunciona from './sections/ComoFunciona.jsx';
import Features from './sections/Features.jsx';
import Planes from './sections/Planes.jsx';
import CtaFinal from './sections/CtaFinal.jsx';
import Footer from './sections/Footer.jsx';

export default function App() {
  return (
    <div className="bg-hud-bg text-hud-text">
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
