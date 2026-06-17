import React from 'react';

const FAMILIAS = [
  { nombre: 'Hash IA · Finanzas', color: 'cyan', items: ['Registra gastos e ingresos por foto o por voz', 'Calcula el IVA solo', 'Match: concilia con el SII y la cartola del banco', 'Reportes y flujo de caja al día'] },
  { nombre: 'Hash IA · Ventas', color: 'gold', items: ['Arma tu catálogo por voz o por foto', 'Crea pedidos en el chat', 'Cobra delivery por comuna', 'Genera el PDF del pedido para WhatsApp'] },
];

export default function DosFamilias() {
  return (
    <section className="bg-hud-bg text-hud-text font-mono px-4 py-20">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-[#cfeaf3]">Una IA, dos familias</h2>
        <p className="text-sm text-[#5ab8cc] mt-2">Las cuentas y las ventas de tu pyme, en un solo lugar.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {FAMILIAS.map((f) => {
          const accent = f.color === 'gold' ? 'text-hud-gold border-hud-gold/40' : 'text-hud-cyan border-hud-cyandim/40';
          const dot = f.color === 'gold' ? 'text-hud-gold' : 'text-hud-cyan';
          return (
            <div key={f.nombre} className={`rounded-2xl border ${accent.split(' ')[1]} bg-white/[0.03] p-6`}>
              <div className={`text-lg ${dot}`}>{f.nombre}</div>
              <ul className="mt-4 space-y-2">
                {f.items.map((it) => (
                  <li key={it} className="flex gap-2 text-sm text-[#cfeaf3]"><span className={dot}>›</span>{it}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
