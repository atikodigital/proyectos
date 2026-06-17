import React from 'react';

const FEATURES = [
  { t: 'OCR de facturas', d: 'Fotografía boletas y facturas; la IA extrae monto, IVA, RUT y folio.' },
  { t: 'Conciliación SII + banco', d: 'Match cruza tus documentos con el SII y la cartola hasta cuadrar.' },
  { t: 'Catálogo por voz y foto', d: 'Llena tu catálogo hablándole a KALY o con la foto del menú.' },
  { t: 'Pedidos + PDF + delivery', d: 'Arma pedidos en el chat, cobra envío por comuna y genera el PDF.' },
  { t: 'WhatsApp', d: 'Recordatorios y resúmenes directo al WhatsApp del dueño.' },
];

export default function Features() {
  return (
    <section className="bg-hud-bg text-hud-text font-mono px-4 py-20 border-t border-hud-cyandim/10">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-[#cfeaf3]">Todo lo que hace por ti</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-xl border border-hud-cyandim/30 bg-white/[0.03] p-5">
            <div className="text-hud-cyan text-sm font-bold">{f.t}</div>
            <div className="text-[#5ab8cc] text-sm mt-1">{f.d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
