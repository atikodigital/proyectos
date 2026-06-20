import React from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Camera, Sparkles, TrendingUp } from 'lucide-react';

const PASOS = [
  { 
    n: '01', 
    t: '01. Saca foto o habla', 
    d: 'Saca la foto de una boleta, el menú, o dile "agrega torta a 18 mil". Olvídate de los formularios.',
    icon: Camera,
    href: '#planes'
  },
  { 
    n: '02', 
    t: '02. IA procesa y registra', 
    d: 'La IA lee el documento al instante, calcula el IVA y deja todo conciliado con el SII.',
    icon: Sparkles,
    href: '#planes'
  },
  { 
    n: '03', 
    t: '03. Reportes o pedidos', 
    d: 'Revisa tu flujo de caja al día o genera el PDF del pedido listo para despachar por WhatsApp.',
    icon: TrendingUp,
    href: '#planes'
  },
];

export default function ComoFunciona() {
  return (
    <section id="como-funciona-section" className="bg-transparent text-hud-text font-mono px-4 py-20 border-t border-hud-cyandim/10">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-white font-bold">Cómo funciona</h2>
        <p className="text-sm text-[#E5E5E5] mt-2">Tres pasos interactivos. Cuentas al día sin planillas.</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-8 max-w-5xl mx-auto">
        {PASOS.map((p) => (
          <GlassCard
            key={p.n}
            title={p.t}
            description={p.d}
            icon={p.icon}
            href={p.href}
          />
        ))}
      </div>
    </section>
  );
}
