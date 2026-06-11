import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function submit(imageBase64, mimeType, override) {
    setBusy(true);
    try { setPending(await api.createExpense(imageBase64, mimeType, override)); setDup(null); }
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
            <h2 className="text-xl font-black" style={{ color: '#C9A24B' }}>Posible duplicado</h2>
            <div className="rounded-2xl bg-black/5 p-4 border text-sm">
              Esto ya fue registrado{dup.info && dup.info.existente ? ` (${dup.info.existente.proveedor || 's/proveedor'} · ${clp(dup.info.existente.total)})` : ''}. ¿Registrarlo igual?
            </div>
            <button onClick={() => submit(dup.imageBase64, dup.mimeType, true)} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>Registrar igual</button>
            <button onClick={() => setDup(null)} className="rounded-xl font-black py-3 bg-black/10 border">Descartar</button>
          </div>
        ) : pending ? (
          <ConfirmScreen expense={pending} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando…</div>
               : <div className="p-4"><p className="px-2 mb-2 opacity-70">Captura la boleta, factura o comprobante:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture /></div>
        ) : (
          <MyExpenses />
        )}
      </main>
      {!pending && !dup && (
        <nav className="flex border-t">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? '' : 'opacity-50'}`} style={tab === 'capturar' ? { color: '#C9A24B' } : {}} onClick={() => setTab('capturar')}>Capturar</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? '' : 'opacity-50'}`} style={tab === 'mis' ? { color: '#C9A24B' } : {}} onClick={() => setTab('mis')}>Mis movimientos</button>
        </nav>
      )}
    </div>
  );
}
