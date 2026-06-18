import { useState, useRef, useEffect } from 'react';
import { api } from './api';
import VarasVoice from './varas/VarasVoice.jsx';
import { useAgentInteraction } from './agente/AgentInteractionProvider.jsx';

const ORO = '#C9A24B';
const BIENVENIDA = 'Soy VARAS, tu controlador financiero. Pregúntame por tus saldos, deudas, flujo o consumo de insumos.';

export default function VarasChat() {
  const [mensajes, setMensajes] = useState([{ role: 'varas', text: BIENVENIDA }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [accion, setAccion] = useState(null);
  const finRef = useRef(null);
  const { proponer } = useAgentInteraction();

  useEffect(() => {
    const el = finRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, accion]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || busy) return;
    const nuevos = [...mensajes, { role: 'user', text: texto }];
    setMensajes(nuevos);
    setInput('');
    setAccion(null);
    setBusy(true);
    try {
      const historial = nuevos.map((m) => ({ role: m.role === 'varas' ? 'assistant' : 'user', text: m.text }));
      const r = await api.varasChat(historial);
      setMensajes((prev) => [...prev, { role: 'varas', text: (r && r.reply) || '' }]);
      if (r && r.accionPropuesta) setAccion(r.accionPropuesta);
    } catch (_e) {
      setMensajes((prev) => [...prev, { role: 'varas', text: 'No pude procesar eso, intenta de nuevo.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    if (!accion || busy) return;
    setBusy(true);
    try {
      const datos = await proponer({
        titulo: accion.descripcion || 'Confirmar acción',
        accion: accion.tipo,
        campos: Object.entries(accion.args || {}).map(([key, valor]) => ({
          key, label: key, valor: valor == null ? '' : valor,
          tipo: typeof valor === 'number' ? 'numero' : 'texto',
        })),
      });
      if (!datos) { setAccion(null); setBusy(false); return; }
      await api.varasAccion(accion.tipo, { ...accion.args, ...datos });
      setMensajes((prev) => [...prev, { role: 'varas', text: '✓ Hecho.' }]);
      setAccion(null);
    } catch (_e) {
      setMensajes((prev) => [...prev, { role: 'varas', text: 'No pude ejecutar la acción, intenta de nuevo.' }]);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b pb-1">
        <VarasVoice />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 grid gap-2 content-start">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap"
              style={m.role === 'user' ? { background: ORO + '22', color: '#3a2f12' } : { background: 'rgba(0,0,0,0.05)' }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy ? <div className="text-xs opacity-50 px-1">VARAS está pensando…</div> : null}
        {accion ? (
          <div className="rounded-2xl border p-3 text-sm" style={{ borderColor: ORO }}>
            <div className="font-bold mb-2" style={{ color: ORO }}>{accion.descripcion}</div>
            <div className="flex gap-2">
              <button onClick={confirmar} disabled={busy}
                className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
                style={{ background: ORO }}>Confirmar</button>
              <button onClick={() => setAccion(null)} disabled={busy}
                className="text-xs font-bold px-3 py-1.5 rounded-full border opacity-70">Cancelar</button>
            </div>
          </div>
        ) : null}
        <div ref={finRef} />
      </div>
      <div className="shrink-0 p-2 border-t flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Pregúntale a VARAS…"
          className="flex-1 text-sm border rounded-full px-3 py-2"
        />
        <button onClick={enviar} disabled={busy || !input.trim()}
          className="text-sm font-bold px-4 py-2 rounded-full text-white disabled:opacity-40"
          style={{ background: ORO }}>Enviar</button>
      </div>
    </div>
  );
}
