import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';
import KalyAgent from './kaly/KalyAgent.jsx';

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
                   <KalyAgent />
                   <p className="px-2 mb-2 opacity-70">Captura la boleta, factura o comprobante:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
                 </div>
        ) : tab === 'mis' ? (
          <MyExpenses />
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
        <nav className="flex border-t">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? '' : 'opacity-50'}`} style={tab === 'capturar' ? { color: '#C9A24B' } : {}} onClick={() => setTab('capturar')}>Captura</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? '' : 'opacity-50'}`} style={tab === 'mis' ? { color: '#C9A24B' } : {}} onClick={() => setTab('mis')}>Movimientos</button>
          <button className={`flex-1 py-3 font-black ${tab === 'transaccional' ? '' : 'opacity-50'}`} style={tab === 'transaccional' ? { color: '#C9A24B' } : {}} onClick={() => setTab('transaccional')}>Transaccional</button>
          <button className={`flex-1 py-3 font-black`} style={tab === 'match' ? { background: '#b91c1c', color: '#fff' } : { color: '#b91c1c' }} onClick={() => setTab('match')}>Match</button>
        </nav>
      )}
    </div>
  );
}
