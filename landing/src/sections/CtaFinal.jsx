import React from 'react';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56927130792';

export default function CtaFinal() {
  return (
    <section className="bg-hud-bg text-hud-text font-mono px-4 py-24 border-t border-[#FCA311]/10 text-center">
      <h2 className="text-2xl md:text-3xl text-white max-w-xl mx-auto font-bold">Deja que la IA te lleve las cuentas y las ventas</h2>
      <p className="text-sm text-[#E5E5E5] mt-3">Instálala gratis y prueba con 30 shots. Sin tarjeta.</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
        <a href={APK_URL} target="_blank" rel="noreferrer" className="bg-[#FCA311] hover:bg-[#e08f0d] text-black font-extrabold rounded-lg px-8 py-3.5 transition-all shadow-sm">Descargar la app</a>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="border border-[#FCA311] text-[#FCA311] hover:bg-[#FCA311]/10 font-bold rounded-lg px-8 py-3.5 transition-all">Hablar por WhatsApp</a>
      </div>
    </section>
  );
}
