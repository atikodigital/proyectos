import React from 'react';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56927130792';

export default function CtaFinal() {
  return (
    <section className="bg-hud-bg text-hud-text font-mono px-4 py-24 border-t border-hud-cyandim/10 text-center">
      <h2 className="text-2xl md:text-3xl text-[#cfeaf3] max-w-xl mx-auto">Deja que la IA te lleve las cuentas y las ventas</h2>
      <p className="text-sm text-[#5ab8cc] mt-3">Instálala gratis y prueba con 30 shots. Sin tarjeta.</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
        <a href={APK_URL} target="_blank" rel="noreferrer" className="bg-hud-gold text-black font-bold rounded-lg px-8 py-3.5">Descargar la app</a>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="border border-hud-cyan text-hud-cyan rounded-lg px-8 py-3.5">Hablar por WhatsApp</a>
      </div>
    </section>
  );
}
