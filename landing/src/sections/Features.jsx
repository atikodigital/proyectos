import React from 'react';
import { LocationCard } from '@/components/ui/card-17';

const FEATURES = [
  {
    t: 'OCR de facturas',
    d: 'Fotografía boletas y facturas; la IA extrae monto, IVA, RUT y folio.',
    img: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800',
    url: '#planes'
  },
  {
    t: 'Conciliación SII + banco',
    d: 'Match cruza tus documentos con el SII y la cartola hasta cuadrar.',
    img: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=800',
    url: '#planes'
  },
  {
    t: 'Catálogo por voz y foto',
    d: 'Llena tu catálogo hablándole a KALY o con la foto del menú.',
    img: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800',
    url: '#planes'
  },
  {
    t: 'Pedidos + PDF + delivery',
    d: 'Arma pedidos en el chat, cobra envío por comuna y genera el PDF.',
    img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=800',
    url: '#planes'
  },
  {
    t: 'WhatsApp',
    d: 'Recordatorios y resúmenes directo al WhatsApp del dueño.',
    img: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=800',
    url: '#planes'
  },
];

export default function Features() {
  return (
    <section id="features-section" className="bg-transparent text-hud-text font-mono px-4 py-20 border-t border-[#FCA311]/10">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-white font-bold">Todo lo que hace por ti</h2>
        <p className="text-sm text-[#E5E5E5] mt-2">Funcionalidades avanzadas diseñadas para tu pyme.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-8 max-w-5xl mx-auto" style={{ perspective: "1000px" }}>
        {FEATURES.map((f) => (
          <div key={f.t} className="w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)] max-w-[340px]">
            <LocationCard
              city={f.t}
              address={f.d}
              imageUrl={f.img}
              directionsUrl={f.url}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
