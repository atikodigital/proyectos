import React from 'react';
import { DestinationCard } from '@/components/ui/card-21';

export default function DosFamilias() {
  return (
    <section id="dos-familias-section" className="bg-transparent text-hud-text font-mono px-4 py-20 border-t border-white/5">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl text-white font-bold">Una IA, dos familias</h2>
        <p className="text-sm text-[#E5E5E5] mt-2">Las cuentas y las ventas de tu pyme, en un solo lugar.</p>
      </div>
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 max-w-4xl mx-auto p-4">
        <div className="w-full max-w-[360px] h-[480px]">
          <DestinationCard
            imageUrl="https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800"
            location="Finanzas"
            flag="📊"
            stats="Registra gastos e ingresos por foto o voz, concilia con el SII y bancos, calcula IVA y controla tu flujo de caja al instante."
            href="#planes"
            themeColor="45 90% 40%"
          />
        </div>
        <div className="w-full max-w-[360px] h-[480px]">
          <DestinationCard
            imageUrl="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800"
            location="Ventas"
            flag="🚀"
            stats="Arma catálogos por foto o voz, gestiona pedidos directamente en el chat, calcula delivery por comuna y vende por WhatsApp."
            href="#planes"
            themeColor="37 98% 45%"
          />
        </div>
      </div>
    </section>
  );
}
