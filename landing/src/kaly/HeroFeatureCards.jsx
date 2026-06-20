// Tarjetas que emergen solas a la izquierda del Hero, "demostrando" la info de
// Hash IA sin tapar al robot. Van rotando entre familias (cuentas / ventas).
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HeroFeatureCards({ pages = [] }) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (pages.length < 2) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages.length), 5200);
    return () => clearInterval(id);
  }, [pages.length]);

  if (!pages.length) return null;
  const cur = pages[page];
  const esVentas = cur.familia === 'ventas';

  return (
    <div className="w-[250px] select-none pointer-events-none">
      <div className="flex items-center gap-2 mb-2 pl-1">
        <span className={`h-1.5 w-1.5 rounded-full ${esVentas ? 'bg-amber-500' : 'bg-[#0a6e8c]'} animate-pulse`} />
        <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold font-sans">{cur.titulo}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          className="flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {cur.items.map((f, i) => (
            <motion.div
              key={f.t}
              initial={{ opacity: 0, x: -44, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 150, damping: 17 }}
              className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-md p-3.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
            >
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider font-sans ${
                  esVentas ? 'text-amber-600 bg-amber-50 border border-amber-100' : 'text-[#0a6e8c] bg-sky-50 border border-sky-100'
                }`}
              >
                {f.familia}
              </span>
              <div className="mt-1.5 text-slate-800 text-sm font-bold leading-tight font-sans">{f.t}</div>
              <div className="mt-1 text-slate-500 text-[11px] leading-snug font-sans">{f.d}</div>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-1.5 mt-3 pl-1">
        {pages.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === page ? 'w-5 bg-[#0a6e8c]' : 'w-1.5 bg-slate-300'}`} />
        ))}
      </div>
    </div>
  );
}
