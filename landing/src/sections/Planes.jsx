import React from 'react';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';

const PLANES = [
  { nombre: 'Free', shots: 30, precio: '$0', sub: 'Para probar Hash IA', destacado: false },
  { nombre: 'Básico', shots: 100, precio: '$9.900', sub: 'Para empezar en serio', destacado: false },
  { nombre: 'Pyme', shots: 250, precio: '$24.900', sub: 'El más elegido', destacado: true },
  { nombre: 'Empresa', shots: 800, precio: '$49.900', sub: 'Para alto volumen', destacado: false },
];

export default function Planes() {
  return (
    <section id="planes" className="relative bg-hud-bg text-hud-text font-mono px-4 py-20 overflow-hidden">
      <style>{`@keyframes hud-spin{to{transform:rotate(360deg)}}`}</style>
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-[#cfeaf3]">Encuentra el plan perfecto para tu <span className="text-hud-cyan">negocio</span></h2>
        <p className="text-sm text-[#5ab8cc] mt-2">Se cobra por <span className="text-hud-gold">shots</span>: 1 shot = 1 imagen interpretada por la IA.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
        {PLANES.map((p) => (
          <div key={p.nombre} className="relative">
            {p.destacado && (
              <div className="pointer-events-none absolute -inset-6 flex items-center justify-center" aria-hidden="true">
                <div className="w-56 h-56 rounded-full opacity-60 blur-2xl" style={{ background: 'conic-gradient(from 0deg,#19C3FF,#0a6e8c,#1430a0,#19C3FF)', animation: 'hud-spin 7s linear infinite' }} />
              </div>
            )}
            <div className={`relative h-full rounded-2xl p-6 backdrop-blur-sm flex flex-col ${p.destacado ? 'border border-hud-cyan bg-white/[0.06]' : 'border border-hud-cyandim/30 bg-white/[0.03]'}`}>
              {p.destacado && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-hud-cyan text-black text-[11px] font-bold rounded-full px-3 py-0.5 whitespace-nowrap">El más elegido</span>}
              <div className="text-xl text-[#cfeaf3]">{p.nombre}</div>
              <div className="text-xs text-[#5ab8cc] mt-0.5">{p.sub}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl text-[#eaf6fb]">{p.precio}</span>
                <span className="text-xs text-[#5ab8cc]">/mes</span>
              </div>
              <div className="mt-1 text-sm text-hud-cyan">{p.shots} shots / mes</div>
              <a href={APK_URL} target="_blank" rel="noreferrer" className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-bold ${p.destacado ? 'bg-hud-gold text-black' : 'border border-hud-cyandim text-hud-cyan hover:bg-[#001f2e]'}`}>Descargar la app</a>
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-[#3a8a9a] mt-8">¿Más de 800 movimientos al mes? Cotiza un plan Enterprise por WhatsApp.</p>
    </section>
  );
}
