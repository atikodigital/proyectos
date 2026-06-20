import React, { useRef, useState, useEffect } from 'react';
import Orb from './Orb.jsx';
import KalyOrb from './KalyOrb.jsx';
import { buildSalesPrompt, KALY_VOICE } from './prompt.js';
import { Spotlight, MouseSpotlight } from '../components/ui/spotlight.jsx';
import { SplineScene } from '../components/ui/splite.jsx';
import FeatureFan from './FeatureFan.jsx';
import HeroFeatureCards from './HeroFeatureCards.jsx';
import { useMotionValue, useTransform, useSpring, motion, AnimatePresence } from 'framer-motion';

// Mapea el estado de la landing al de la esfera KALY de la app.
const KALY_STATE = { idle: 'off', thinking: 'connecting', listening: 'listening', speaking: 'speaking', muted: 'listening', error: 'error' };
void Orb;
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { openLiveSession } from './live.js';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56927130792';
const PANEL_URL = 'https://gastos.atikodigital.cl/panel/';
// Proxy WS público del backend: el navegador conecta acá y el server pone la API key.
const KALY_WS_URL = 'wss://gastos.atikodigital.cl/api/public/kaly-ws';
const KALY_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
const FEATURES = {
  finanzas: [
    { t: 'Gastos por foto o voz', d: 'Saca la foto de la boleta y la IA la registra con IVA.', familia: 'finanzas', img: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800' },
    { t: 'Match SII + banco', d: 'Concilia tus documentos con el SII y la cartola.', familia: 'finanzas', img: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=800' },
    { t: 'Reportes y flujo de caja', d: 'Mira cómo va el mes sin Excel.', familia: 'finanzas', img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800' },
  ],
  ventas: [
    { t: 'Catálogo por voz/foto', d: 'Dile a KALY "agrega torta a 18 mil" o foto del menú.', familia: 'ventas', img: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=800' },
    { t: 'Pedidos en el chat', d: 'Arma el pedido y genera el PDF para WhatsApp.', familia: 'ventas', img: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800' },
    { t: 'Delivery por comuna', d: 'Cobra el envío según la zona.', familia: 'ventas', img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=800' },
  ],
};
// Frases por las que mostramos las tarjetas aunque el modelo no llame a la tool.
const FEATURE_INTENT = /(caracter[ií]stic|qu[eé]\s+hace|qu[eé]\s+puede|para\s+qu[eé]\s+sirve|funcion|qu[eé]\s+es\s+hash)/i;
// Páginas que rotan en las tarjetas flotantes de la izquierda del Hero.
const FEATURE_PAGES = [
  { familia: 'finanzas', titulo: 'Lleva tus cuentas', items: FEATURES.finanzas },
  { familia: 'ventas', titulo: 'Potencia tus ventas', items: FEATURES.ventas },
];

export default function Hero() {
  const [state, setState] = useState('idle');
  const [level, setLevel] = useState(0);
  const [subtitulo, setSubtitulo] = useState('');
  const [features, setFeatures] = useState(null);
  const [modoTexto, setModoTexto] = useState(false);
  const [texto, setTexto] = useState('');
  const sessionRef = useRef(null);

  const cardRef = useRef(null);
  const chatEndRef = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [isMobile, setIsMobile] = useState(false);
  const [splineReady, setSplineReady] = useState(false);

  // Historial de chat
  const [chatLog, setChatLog] = useState([]);

  // Carga diferida del 3D pesado (Spline ~6 MB): primero pintamos lo liviano
  // (barra, tarjetas, orbe, chat) y el robot entra después, sin bloquear el LCP.
  useEffect(() => {
    const start = () => setSplineReady(true);
    const ric = typeof window !== 'undefined' && window.requestIdleCallback;
    const id = ric ? window.requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200);
    return () => { if (ric && window.cancelIdleCallback) window.cancelIdleCallback(id); else clearTimeout(id); };
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-iniciar la sesión al montar la página
  useEffect(() => {
    iniciar();
    return () => {
      if (sessionRef.current) {
        sessionRef.current.close();
      }
    };
  }, []);

  // Auto-scrollear al final del chat cuando se agregue un mensaje
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  // Cerrar el abanico de características con Escape.
  useEffect(() => {
    if (!features) return;
    const onKey = (e) => { if (e.key === 'Escape') setFeatures(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [features]);

  // Mapeamos el movimiento relativo del mouse a un pequeño desplazamiento para el orbe (anclado a la cabeza)
  const orbX = useTransform(mouseX, [-700, 700], [-35, 35]);
  const orbY = useTransform(mouseY, [-450, 450], [-22, 22]);
  const smoothX = useSpring(orbX, { damping: 25, stiffness: 220 });
  const smoothY = useSpring(orbY, { damping: 25, stiffness: 220 });

  const handleMouseMove = (event) => {
    if (!cardRef.current) return;
    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    const rx = event.clientX - left - width / 2;
    const ry = event.clientY - top - height / 2;
    mouseX.set(rx);
    mouseY.set(ry);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const ui = {
    mostrarFeatures: (familia) => setFeatures(familia === 'todas' ? [...FEATURES.finanzas, ...FEATURES.ventas] : (FEATURES[familia] || [...FEATURES.finanzas, ...FEATURES.ventas])),
    mostrarPlanes: () => document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' }),
    descargarApp: () => window.open(APK_URL, '_blank'),
    abrirWhatsapp: () => window.open(WHATSAPP_URL, '_blank'),
  };

  async function iniciar() {
    if (sessionRef.current) return;
    setState('thinking');
    try {
      const session = openLiveSession({
        wsUrl: KALY_WS_URL, model: KALY_MODEL, voice: KALY_VOICE, systemPrompt: buildSalesPrompt(), tools: TOOL_DECLARATIONS,
        onState: (s) => { setState(s); if (s === 'error') setModoTexto(true); },
        onAudioLevel: (_, rms) => setLevel(Math.min(1, rms * 6)),
        onReady: (sess) => {
          sess.sendText("Hola. Preséntate de forma breve en español chileno y saluda.");
        },
        onToolCall: (fc) => {
          executeTool(fc.name, fc.args || {}, ui);
          sessionRef.current?.sendToolResponse(fc.id, fc.name, { ok: true });
        },
        onAgentTranscript: (t) => {
          setSubtitulo(t);
          setChatLog((prev) => {
            // Si el último mensaje es de KALY, actualizamos su contenido (escritura en tiempo real)
            if (prev.length > 0 && prev[prev.length - 1].role === 'kaly') {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'kaly', text: t };
              return copy;
            } else {
              return [...prev, { role: 'kaly', text: t }];
            }
          });
        },
        onClose: () => { sessionRef.current = null; setState('idle'); },
      });
      sessionRef.current = session;
    } catch (e) { setModoTexto(true); setState('idle'); }
  }

  function enviarTexto(t) {
    const msg = (t || texto).trim(); if (!msg) return;
    // Si el visitante pregunta por las características, mostramos las tarjetas de
    // inmediato (no dependemos de que el modelo de voz llame a la tool).
    if (FEATURE_INTENT.test(msg)) ui.mostrarFeatures('todas');
    setChatLog((prev) => [...prev, { role: 'user', text: msg }]);
    if (sessionRef.current) {
      sessionRef.current.sendText(msg);
    } else {
      // Reintentar iniciar e intentar enviar si la sesión se cayó
      iniciar().then(() => {
        if (sessionRef.current) sessionRef.current.sendText(msg);
      });
    }
    setTexto('');
  }

  return (
    <section 
      id="hero-section"
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="min-h-screen w-full bg-[#f8fafc] text-slate-800 font-mono flex flex-col items-center justify-between px-4 md:px-8 pt-2 pb-4 md:pb-8 relative overflow-hidden"
    >
      {/* Luces de Fondo (Adaptadas a fondo blanco para visualización premium) */}
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20 z-10"
        fill="rgba(14, 165, 233, 0.08)"
      />
      <MouseSpotlight
        className="from-slate-200/40 via-slate-100/10 to-transparent z-10"
        size={500}
      />
      
      {/* Barra superior de información + acciones */}
      <header className="relative z-40 w-full max-w-5xl mx-auto flex items-center justify-between gap-2 bg-white/90 border border-slate-200/80 rounded-2xl px-3 md:px-4 py-2 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-[#0a6e8c] animate-pulse shrink-0"></span>
          <span className="font-bold text-slate-800 font-sans text-sm tracking-tight shrink-0">Hash IA</span>
          <button
            onClick={() => ui.mostrarPlanes()}
            className="hidden sm:inline-flex items-center gap-1 ml-2 text-[11px] font-sans text-slate-500 hover:text-[#0a6e8c] transition-colors"
          >
            Planes desde <span className="font-bold text-slate-700">$0</span>
          </button>
        </div>
        <nav className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <a href={PANEL_URL} target="_blank" rel="noreferrer" className="hidden md:inline-block text-xs font-sans text-slate-600 hover:text-[#0a6e8c] px-2 py-1.5 transition-colors">Iniciar sesión</a>
          <a href={PANEL_URL} target="_blank" rel="noreferrer" className="text-[11px] md:text-xs font-bold font-sans text-[#0a6e8c] border border-[#0a6e8c]/30 rounded-lg px-2.5 py-1.5 hover:bg-sky-50 transition-colors">Crear usuario</a>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-[11px] md:text-xs font-bold font-sans text-white bg-[#0a6e8c] hover:bg-[#085a73] rounded-lg px-2.5 py-1.5 shadow-sm transition-colors">Cotiza con nosotros</a>
        </nav>
      </header>

      {/* Tarjetas flotantes a la izquierda (demo en vivo, no tapan al robot) */}
      <div className="hidden lg:block absolute left-6 xl:left-12 top-1/2 -translate-y-1/2 z-30">
        <HeroFeatureCards pages={FEATURE_PAGES} />
      </div>

      {/* Escena Spline en todo el fondo (Zoom extremo y supersampling de alta definición sin pixelado) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden z-0 flex items-center justify-center">
        <div 
          className="absolute flex items-center justify-center pointer-events-auto"
          style={{
            width: isMobile ? "350vw" : "280vw",
            height: isMobile ? "350vh" : "280vh",
            transform: isMobile ? "translateY(24%)" : "translateY(19%)"
          }}
        >
          {splineReady && (
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full opacity-90"
            />
          )}
        </div>
      </div>

      {/* KalyOrb sobrepuesto en la boca del robot en el fondo */}
      <motion.div 
        className="absolute z-20 pointer-events-none flex flex-col items-center"
        style={{
          top: isMobile ? "59.5%" : "54.5%", // Se alinea dinámicamente con la boca según tamaño
          left: "50%",
          x: smoothX,
          y: smoothY,
          translateX: "-50%",
          translateY: "-50%"
        }}
      >
        <div className="pointer-events-auto flex flex-col items-center scale-[0.78]">
          <KalyOrb 
            state={KALY_STATE[state] || 'off'} 
            audioLevel={level} 
            onTap={iniciar} 
          />
          {state === 'idle' && !sessionRef.current && (
            <p className="text-[9px] text-[#0a6e8c] mt-1.5 bg-white/95 px-3 py-1 rounded-full border border-slate-200 shadow-md backdrop-blur-sm pointer-events-none animate-pulse tracking-wider font-sans uppercase font-bold">
              Toca para hablar
            </p>
          )}
        </div>
      </motion.div>

      {/* Caja de Chat Flotante en la parte inferior */}
      <div className="relative z-30 w-full max-w-[340px] bg-white/95 border border-slate-200/80 rounded-2xl p-2 shadow-lg mb-4 mt-auto">
        <div className="flex gap-2 w-full">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escríbele a KALY…"
            className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#0a6e8c] focus:bg-white transition-all font-sans"
            onKeyDown={(e) => e.key === 'Enter' && enviarTexto()}
          />
          <button
            onClick={() => enviarTexto()}
            className="bg-[#0a6e8c] hover:bg-[#085a73] text-white rounded-xl px-3 py-1.5 text-xs font-bold font-sans transition-all shadow-sm"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Abanico emergente de características */}
      <AnimatePresence>
        {features && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/25 backdrop-blur-md px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFeatures(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Características de Hash IA"
          >
            <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1 px-2">
                <h2 className="text-slate-800 text-base md:text-xl font-bold font-sans">Características de Hash IA</h2>
                <button
                  onClick={() => setFeatures(null)}
                  aria-label="Cerrar"
                  className="rounded-full border border-slate-200 bg-white text-slate-600 w-9 h-9 flex items-center justify-center hover:bg-slate-50 shadow-sm text-lg leading-none"
                >
                  ✕
                </button>
              </div>
              <FeatureFan items={features} />
              <p className="text-center text-[11px] text-slate-400 mt-1 font-sans">Pasa el cursor sobre una tarjeta · toca fuera o Esc para cerrar</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
