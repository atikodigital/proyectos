import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-hud-bg text-[#3a8a9a] font-mono px-4 py-10 border-t border-hud-cyandim/10 text-center text-xs">
      <div className="text-hud-cyan text-sm">Hash IA</div>
      <div className="mt-1">Un producto de Atiko Digital · Inteligencia artificial para pymes de Chile</div>
      <div className="mt-3 flex gap-4 justify-center">
        <a href="https://wa.me/56927130792" target="_blank" rel="noreferrer" className="hover:text-hud-cyan">WhatsApp</a>
        <a href="https://gastos.atikodigital.cl/panel/HashIA.apk" target="_blank" rel="noreferrer" className="hover:text-hud-cyan">Descargar app</a>
      </div>
      <div className="mt-4 opacity-60">© 2026 Atiko Digital</div>
    </footer>
  );
}
