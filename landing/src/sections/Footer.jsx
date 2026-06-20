import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-hud-bg text-[#E5E5E5] font-mono px-4 py-10 border-t border-[#FCA311]/10 text-center text-xs">
      <div className="text-[#FCA311] text-sm font-bold">Hash IA</div>
      <div className="mt-1">Un producto de Atiko Digital · Inteligencia artificial para pymes de Chile</div>
      <div className="mt-3 flex gap-4 justify-center">
        <a href="https://wa.me/56927130792" target="_blank" rel="noreferrer" className="hover:text-[#FCA311] transition-colors">WhatsApp</a>
        <a href="https://gastos.atikodigital.cl/panel/HashIA.apk" target="_blank" rel="noreferrer" className="hover:text-[#FCA311] transition-colors">Descargar app</a>
      </div>
      <div className="mt-4 opacity-60">© 2026 Atiko Digital</div>
    </footer>
  );
}
