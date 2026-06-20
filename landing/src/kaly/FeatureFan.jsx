// Abanico de tarjetas de características de KALY (framer-motion, tema claro).
// Aparecen en arco sobre el fondo blanco; la del medio queda recta y al pasar
// el cursor la tarjeta se levanta al frente.
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function FeatureFan({ items = [] }) {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const r = () => setW(window.innerWidth);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const n = items.length;
  if (!n) return null;
  const center = (n - 1) / 2;
  const mobile = w < 640;

  // Geometría del abanico según el ancho disponible.
  const spacing = mobile ? Math.min(64, (w - 110) / Math.max(1, n - 1)) : 158;
  const step = mobile ? 6 : 9;      // grados por carta
  const rise = mobile ? 7 : 11;     // px que bajan las cartas de los extremos
  const containerH = mobile ? 330 : 380;

  return (
    <div className="relative w-full" style={{ height: containerH }}>
      {items.map((f, i) => {
        const off = i - center;
        const x = off * spacing;
        const y = Math.pow(Math.abs(off), 2) * rise;
        const rot = off * step;
        const scale = 1 - Math.abs(off) * 0.05;
        const z = 100 - Math.abs(Math.round(off * 2));
        const esVentas = f.familia === 'ventas';
        return (
          <motion.div
            key={f.t || i}
            className="absolute inset-0 m-auto w-[150px] h-[224px] md:w-[188px] md:h-[270px]"
            style={{ zIndex: z }}
            initial={{ opacity: 0, x: 0, y: 90, rotate: 0, scale: 0.5 }}
            animate={{ opacity: 1, x, y, rotate: rot, scale }}
            transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.07 * i }}
            whileHover={{ y: y - 26, rotate: 0, scale: scale * 1.07, zIndex: 200 }}
          >
            <div 
              className="relative flex h-full w-full flex-col justify-between rounded-2xl overflow-hidden border border-slate-200/20 bg-cover bg-center p-4 shadow-[0_12px_40px_rgba(15,23,42,0.25)] text-white bg-slate-900"
              style={{ backgroundImage: f.img ? `url(${f.img})` : 'none' }}
            >
              {/* Dark gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20 z-0" />

              <div className="relative z-10">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider font-sans ${
                    esVentas ? 'text-amber-300 bg-amber-950/80 border border-amber-900/30' : 'text-sky-300 bg-sky-950/80 border border-sky-900/30'
                  }`}
                >
                  {f.familia || 'hash ia'}
                </span>
                <div className="mt-3 text-white text-base md:text-lg font-bold leading-tight font-sans">{f.t}</div>
              </div>
              <div className="relative z-10 text-slate-200 text-xs md:text-sm leading-snug font-sans">{f.d}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
