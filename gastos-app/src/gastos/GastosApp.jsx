import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';
import KalyAgent from './kaly/KalyAgent.jsx';
import PedidoOverlaySetup from './PedidoOverlaySetup.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function fechaCorta(v) { if (!v) return ''; const s = String(v); return s.length >= 10 ? s.slice(0, 10) : s; }
function motivoText(m) {
  if (m === 'folio') return 'es la misma factura/boleta (mismo folio y RUT del proveedor)';
  if (m === 'nro_operacion') return 'es el mismo comprobante (mismo N° de operación)';
  if (m === 'imagen') return 'es exactamente la misma foto';
  if (m === 'monto_fecha_proveedor') return 'coincide el monto, la fecha y el proveedor con otro ya registrado';
  return 'ya existe un movimiento igual registrado';
}

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [matchDoc, setMatchDoc] = useState(null);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function submit(imageBase64, mimeType, override) {
    setBusy(true);
    try {
      const exp = await api.createExpense(imageBase64, mimeType, override);
      if (exp && exp.documento) {
        setMatchDoc(exp.documento);
        setDup(null);
        setTab('match');
        return;
      }
      setPending({ exp, img: imageBase64, mime: mimeType });
      setDup(null);
    }
    catch (e) { if (e && e.status === 409) setDup({ imageBase64, mimeType, info: (e.data && e.data.duplicado) || {} }); }
    finally { setBusy(false); }
  }
  async function onChange(items) {
    const ev = (items || [])[0];
    if (!ev || !ev.imageBase64) return;
    await submit(ev.imageBase64, ev.imageMimeType || 'image/jpeg', false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="font-black" style={{ color: '#C9A24B' }}>Hash IA</span>
        <button className="text-xs opacity-60" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
      </header>
      <main className="flex-1">
        {!pending && !dup && (
          <div className="p-4 bg-slate-50/50 border-b border-slate-200/40">
            <KalyAgent />
          </div>
        )}
        {dup ? (
          <div className="p-6 max-w-sm mx-auto grid gap-3">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>🚫 No lo registré</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm grid gap-2">
              <div><b>Por qué:</b> {motivoText(dup.info && dup.info.motivo)}.</div>
              {dup.info && dup.info.existente ? (
                <div className="opacity-80">Ya estaba registrado{dup.info.existente.fecha ? ' (' + fechaCorta(dup.info.existente.fecha) + ')' : ''}: {dup.info.existente.proveedor || 's/proveedor'} · {clp(dup.info.existente.total)}{dup.info.existente.folio ? ' · folio ' + dup.info.existente.folio : ''}{dup.info.existente.nro_operacion ? ' · N° op ' + dup.info.existente.nro_operacion : ''}.</div>
              ) : null}
              <div>Para no registrar/pagar dos veces, no lo guardé. ¿Registrarlo igual de todas formas?</div>
            </div>
            <button onClick={() => submit(dup.imageBase64, dup.mimeType, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Registrar igual</button>
            <button onClick={() => setDup(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : pending ? (
          <ConfirmScreen expense={pending.exp} photo={{ base64: pending.img, mime: pending.mime }} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando…</div>
               : <div className="p-4">
                   <p className="px-2 mb-2 opacity-70 text-xs font-bold">Captura la boleta, factura o comprobante:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
                 </div>
        ) : tab === 'mis' ? (
          <MyExpenses />
        ) : tab === 'pedidos' ? (
          <PedidoOverlaySetup />
        ) : tab === 'transaccional' ? (
          <div className="p-6 grid gap-2">
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Transaccional</h2>
            <p className="text-sm opacity-70">Regístralo sin imagen: díctame o escríbeme el detalle (monto, RUT, folio…) y yo deduzco si es gasto o ingreso, calculo el IVA y lo registro contigo. Próximamente.</p>
          </div>
        ) : (
          <div className="p-6 grid gap-2">
            <h2 className="text-xl font-black" style={{ color: '#b91c1c' }}>Match</h2>
            {matchDoc ? (
              <p className="text-sm">📄 Detecté {matchDoc === 'cartola' ? 'una cartola bancaria' : 'un libro de compra/venta del SII'}. Aquí se activará la conciliación. Próximamente.</p>
            ) : null}
            <p className="text-sm opacity-70">Conciliación automática: cotejo tus movimientos con el Libro de Compra/Venta del SII y tus cartolas bancarias, incluso pagos masivos (iterando sumas de facturas). Próximamente.</p>
          </div>
        )}
      </main>
      {!pending && !dup && (
        <nav className="flex border-t border-slate-300 bg-white shadow-lg justify-around items-stretch h-14">
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'capturar' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('capturar')}>
            <span>Captura</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'mis' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('mis')}>
            <span>Movimientos</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'transaccional' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('transaccional')}>
            <span>Transaccional</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold border-r border-slate-300 transition-all duration-200 ${tab === 'pedidos' ? 'text-[#C9A24B] bg-slate-50/50' : 'text-neutral-500 opacity-60 hover:opacity-100'}`} onClick={() => setTab('pedidos')}>
            <span>Pedidos</span>
          </button>
          <button className={`flex-1 flex flex-col justify-center items-center text-[10.5px] font-bold transition-all duration-200 ${tab === 'match' ? 'bg-[#b91c1c] text-white font-bold' : 'text-[#b91c1c] opacity-80 hover:opacity-100 hover:bg-red-50/30'}`} onClick={() => setTab('match')}>
            <span>Match</span>
          </button>
        </nav>
      )}
    </div>
  );
}
