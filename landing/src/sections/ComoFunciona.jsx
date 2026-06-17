import React from 'react';

const PASOS = [
  { n: '01', t: 'Saca una foto o háblale a KALY', d: 'Una boleta, el menú, o dile "agrega torta a 18 mil". Sin teclear formularios.' },
  { n: '02', t: 'La IA registra y contabiliza', d: 'Lee el documento, calcula el IVA y deja todo ordenado y conciliado.' },
  { n: '03', t: 'Ves reportes o armas pedidos', d: 'Flujo de caja al día, o crea el pedido y mándalo en PDF por WhatsApp.' },
];

export default function ComoFunciona() {
  return (
    <section className="bg-hud-bg text-hud-text font-mono px-4 py-20 border-t border-hud-cyandim/10">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-[#cfeaf3]">Cómo funciona</h2>
        <p className="text-sm text-[#5ab8cc] mt-2">Tres pasos. Nada de Excel.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {PASOS.map((p) => (
          <div key={p.n} className="rounded-2xl border border-hud-cyandim/30 bg-white/[0.03] p-6">
            <div className="text-3xl text-hud-cyan">{p.n}</div>
            <div className="mt-3 text-base text-[#cfeaf3]">{p.t}</div>
            <div className="mt-2 text-sm text-[#5ab8cc]">{p.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
