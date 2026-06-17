import React, { useRef, useState } from 'react';
import Orb from './Orb.jsx';
import { fetchKalyToken } from './token.js';
import { buildSalesPrompt, KALY_VOICE } from './prompt.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { openLiveSession } from './live.js';

const APK_URL = 'https://gastos.atikodigital.cl/panel/HashIA.apk';
const WHATSAPP_URL = 'https://wa.me/56927130792';
const CHIPS = ['¿Qué es Hash IA?', '¿Cuánto cuesta?', '¿Sirve para mi negocio?', 'Muéstrame las características'];
const FEATURES = {
  finanzas: [
    { t: 'Gastos por foto o voz', d: 'Saca la foto de la boleta y la IA la registra con IVA.' },
    { t: 'Match SII + banco', d: 'Concilia tus documentos con el SII y la cartola.' },
    { t: 'Reportes y flujo de caja', d: 'Mira cómo va el mes sin Excel.' },
  ],
  ventas: [
    { t: 'Catálogo por voz/foto', d: 'Dile a KALY "agrega torta a 18 mil" o foto del menú.' },
    { t: 'Pedidos en el chat', d: 'Arma el pedido y genera el PDF para WhatsApp.' },
    { t: 'Delivery por comuna', d: 'Cobra el envío según la zona.' },
  ],
};

export default function Hero() {
  const [state, setState] = useState('idle');
  const [level, setLevel] = useState(0);
  const [subtitulo, setSubtitulo] = useState('');
  const [features, setFeatures] = useState(null);
  const [modoTexto, setModoTexto] = useState(false);
  const [texto, setTexto] = useState('');
  const sessionRef = useRef(null);

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
      const { token, model } = await fetchKalyToken();
      const session = openLiveSession({
        token, model, voice: KALY_VOICE, systemPrompt: buildSalesPrompt(), tools: TOOL_DECLARATIONS,
        onState: setState, onAudioLevel: (_, rms) => setLevel(Math.min(1, rms * 6)),
        onAgentTranscript: (t) => setSubtitulo(t),
        onToolCall: (fc) => { executeTool(fc.name, fc.args || {}, ui); session.sendToolResponse(fc.id, fc.name, { ok: true }); },
        onClose: () => { sessionRef.current = null; setState('idle'); },
      });
      sessionRef.current = session;
    } catch (e) { setModoTexto(true); setState('idle'); }
  }

  function enviarTexto(t) {
    const msg = (t || texto).trim(); if (!msg) return;
    if (sessionRef.current) sessionRef.current.sendText(msg);
    setTexto('');
  }

  return (
    <section className="min-h-screen bg-hud-bg text-hud-text font-mono flex flex-col items-center justify-center px-4 py-12">
      <h1 className="text-2xl md:text-4xl text-center text-[#cfeaf3] max-w-2xl mb-2">La IA que le lleva las <span className="text-hud-cyan">cuentas</span> y las <span className="text-hud-gold">ventas</span> a tu pyme</h1>
      <p className="text-sm md:text-base text-[#5ab8cc] text-center mb-6">Háblale a KALY. Te cuenta todo sobre Hash IA.</p>

      <button onClick={iniciar} className="group" aria-label="Iniciar conversación con KALY"><Orb state={state} level={level} /></button>
      {state === 'idle' && !sessionRef.current && <p className="text-xs text-[#3a8a9a] mt-2">Toca el orbe para hablar con KALY</p>}
      {subtitulo && <p className="text-sm text-hud-cyan text-center max-w-xl mt-3 min-h-[1.5rem]">{subtitulo}</p>}

      <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-xl">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => (sessionRef.current ? enviarTexto(c) : iniciar())} className="text-xs border border-hud-cyandim text-hud-cyan rounded-full px-3 py-1.5 hover:bg-[#001f2e]">{c}</button>
        ))}
      </div>

      {features && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 max-w-3xl w-full">
          {features.map((f) => (
            <div key={f.t} className="border border-hud-cyandim/40 rounded-lg p-3 bg-hud-panel">
              <div className="text-hud-cyan text-sm font-bold">{f.t}</div>
              <div className="text-[#5ab8cc] text-xs mt-1">{f.d}</div>
            </div>
          ))}
        </div>
      )}

      {modoTexto && (
        <div className="mt-5 w-full max-w-md text-center">
          <p className="text-xs text-hud-gold mb-2">El modo voz no está disponible ahora — escríbele a KALY.</p>
          <div className="flex gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escríbele a KALY…" className="flex-1 bg-hud-panel border border-hud-cyandim rounded px-3 py-2 text-sm text-hud-text" />
            <button onClick={() => enviarTexto()} className="border border-hud-cyan text-hud-cyan rounded px-4">Enviar</button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <a href={APK_URL} target="_blank" rel="noreferrer" className="bg-hud-gold text-black font-bold rounded-lg px-6 py-3 text-center">Descargar la app</a>
        <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="border border-hud-cyan text-hud-cyan rounded-lg px-6 py-3 text-center">Hablar por WhatsApp</a>
      </div>
    </section>
  );
}
