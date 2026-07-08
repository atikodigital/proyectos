import React from 'react';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56927130792';

const PLANES = [
  {
    nombre: 'Free',
    shots: 30,
    precio: '$0',
    sub: 'Para probar Hash IA',
    destacado: false,
    cta: { label: 'Empezar gratis', href: APK_URL },
    incluye: ['Gastos e ingresos por foto o voz', 'Catálogo básico de productos', '1 usuario', 'Soporte por WhatsApp'],
    extraDe: null,
  },
  {
    nombre: 'Básico',
    shots: 100,
    precio: '$9.900',
    sub: 'Para empezar en serio',
    destacado: false,
    cta: { label: 'Descargar la app', href: APK_URL },
    incluye: ['Match con el SII y el banco', 'Reportes y flujo de caja', 'Pedidos en el chat con PDF'],
    extraDe: 'Free',
  },
  {
    nombre: 'Pyme',
    shots: 210,
    precio: '$24.900',
    sub: 'El más elegido',
    destacado: true,
    cta: { label: 'Descargar la app', href: APK_URL },
    incluye: ['Delivery por comuna', 'Varios usuarios', 'Prioridad en el soporte'],
    extraDe: 'Básico',
  },
  {
    nombre: 'Empresa',
    shots: 600,
    precio: '$49.900',
    sub: 'Para alto volumen',
    destacado: false,
    cta: { label: 'Cotiza con nosotros', href: WHATSAPP_URL },
    incluye: ['600 shots al mes', 'Onboarding personalizado', 'Soporte dedicado'],
    extraDe: 'Pyme',
  },
];

function Check() {
  const color = '#FCA311';
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill={color} fillOpacity="0.15" />
      <path d="M6 10.5l2.5 2.5L14 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Planes() {
  return (
    <section id="planes" className="relative bg-[#14213D] text-white px-4 py-20 overflow-hidden border-t border-white/5">
      <div className="text-center mb-3">
        <span className="inline-block text-[11px] uppercase tracking-widest text-[#FCA311] font-bold font-sans">Planes y precios</span>
      </div>
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white font-sans">Encuentra el plan perfecto para tu negocio</h2>
        <p className="text-sm text-[#E5E5E5] mt-3 font-sans">
          Se cobra por <span className="font-bold text-[#FCA311]">shots</span>: 1 shot = 1 imagen interpretada por la IA.
          Todos los planes incluyen <span className="font-semibold text-[#E5E5E5]">cuentas y ventas</span>. Cancela cuando quieras.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#FCA311]/40 bg-[#FCA311]/10 px-4 py-2 text-sm font-semibold text-[#FCA311] font-sans">
          🎁 Empieza con <span className="font-extrabold">14 días de Pyme gratis</span> — 210 shots, sin tarjeta. Al terminar sigues en Free.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto items-stretch">
        {PLANES.map((p) => (
          <div
            key={p.nombre}
            className={`relative flex h-full flex-col rounded-3xl p-6 bg-black/60 backdrop-blur-md font-sans transition-all border ${
              p.destacado
                ? 'border-2 border-[#FCA311] shadow-[0_24px_60px_rgba(252,163,17,0.18)] lg:scale-[1.04]'
                : 'border-white/10 hover:border-white/20 shadow-xl'
            }`}
          >
            {p.destacado && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FCA311] text-black text-[11px] font-extrabold rounded-full px-3 py-1 whitespace-nowrap shadow-md uppercase tracking-wider">
                ★ El más elegido
              </span>
            )}

            <div className="text-lg font-bold text-white">{p.nombre}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{p.sub}</div>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-white tracking-tight">{p.precio}</span>
              <span className="text-xs text-zinc-400">/mes</span>
            </div>
            <div className={`mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold ${p.destacado ? 'bg-[#FCA311]/25 text-[#FCA311]' : 'bg-white/10 text-white'}`}>
              {p.shots} shots / mes
            </div>

            <ul className="mt-5 space-y-2.5 text-sm text-zinc-300 flex-1">
              {p.extraDe && <li className="text-xs font-semibold text-zinc-500">Todo lo de {p.extraDe}, más:</li>}
              {p.incluye.map((it) => (
                <li key={it} className="flex gap-2">
                  <Check />
                  <span>{it}</span>
                </li>
              ))}
            </ul>

            <a
              href={p.cta.href}
              target="_blank"
              rel="noreferrer"
              className={`mt-7 rounded-xl px-4 py-3 text-center text-sm font-bold transition-colors ${
                p.destacado
                  ? 'bg-[#FCA311] text-black hover:bg-[#e08f0d] shadow-sm'
                  : 'border border-[#FCA311]/40 text-[#FCA311] hover:bg-[#FCA311]/10'
              }`}
            >
              {p.cta.label}
            </a>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-zinc-400 mt-10 font-sans">
        ¿Más de 800 shots al mes? <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-[#FCA311] font-semibold hover:underline">Cotiza un plan Enterprise por WhatsApp.</a>
      </p>
    </section>
  );
}
