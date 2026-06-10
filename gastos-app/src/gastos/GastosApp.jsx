import { useState } from 'react';
import { getToken, clearToken } from './session';
import { api } from './api';
import LoginScreen from './LoginScreen.jsx';
import ConfirmScreen from './ConfirmScreen.jsx';
import MyExpenses from './MyExpenses.jsx';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

export default function GastosApp() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState('capturar');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!authed) return <LoginScreen onLoggedIn={() => setAuthed(true)} />;

  async function onChange(items) {
    const ev = (items || [])[0];
    if (!ev || !ev.imageBase64) return;
    setBusy(true);
    try { setPending(await api.createExpense(ev.imageBase64, ev.imageMimeType || 'image/jpeg')); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="font-black" style={{ color: '#C9A24B' }}>Atiko Gastos</span>
        <button className="text-xs opacity-60" onClick={() => { clearToken(); setAuthed(false); }}>Salir</button>
      </header>
      <main className="flex-1">
        {pending ? (
          <ConfirmScreen expense={pending} onDone={() => { setPending(null); setTab('mis'); }} />
        ) : tab === 'capturar' ? (
          busy ? <div className="p-6">Procesando boleta…</div>
               : <div className="p-4"><p className="px-2 mb-2 opacity-70">Captura la boleta o factura:</p>
                   <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture /></div>
        ) : (
          <MyExpenses />
        )}
      </main>
      {!pending && (
        <nav className="flex border-t">
          <button className={`flex-1 py-3 font-black ${tab === 'capturar' ? '' : 'opacity-50'}`} style={tab === 'capturar' ? { color: '#C9A24B' } : {}} onClick={() => setTab('capturar')}>Capturar</button>
          <button className={`flex-1 py-3 font-black ${tab === 'mis' ? '' : 'opacity-50'}`} style={tab === 'mis' ? { color: '#C9A24B' } : {}} onClick={() => setTab('mis')}>Mis gastos</button>
        </nav>
      )}
    </div>
  );
}
