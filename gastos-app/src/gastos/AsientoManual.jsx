import { useState, useEffect } from 'react';
import { api } from './api';
import { t } from './i18n';

const ORO = '#C9A24B';
function clp(n) { return '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL'); }
function hoy() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _int(v) { const n = Math.round(Number(v) || 0); return n > 0 ? n : 0; }

export default function AsientoManual({ onSaved }) {
  const [cuentas, setCuentas] = useState([]);
  const [fecha, setFecha] = useState(hoy());
  const [glosa, setGlosa] = useState('');
  const [filas, setFilas] = useState([{ cuenta_id: '', debe: '', haber: '' }, { cuenta_id: '', debe: '', haber: '' }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.listCuentasApp().then((r) => setCuentas((r && r.cuentas) || [])).catch(() => setCuentas([])); }, []);

  const sumD = filas.reduce((s, f) => s + _int(f.debe), 0);
  const sumH = filas.reduce((s, f) => s + _int(f.haber), 0);
  const cuadrado = sumD > 0 && sumD === sumH;
  const validas = filas.filter((f) => f.cuenta_id && (_int(f.debe) > 0 || _int(f.haber) > 0));
  const puedeGuardar = cuadrado && validas.length >= 2 && !busy;

  function setFila(i, patch) { setFilas((prev) => prev.map((f, j) => j === i ? { ...f, ...patch } : f)); }
  function addFila() { setFilas((prev) => [...prev, { cuenta_id: '', debe: '', haber: '' }]); }

  async function guardar() {
    setBusy(true); setMsg('');
    try {
      await api.crearAsientoManual({ fecha, glosa, lineas: validas.map((f) => ({ cuenta_id: f.cuenta_id, debe: _int(f.debe), haber: _int(f.haber) })) });
      setMsg(t('prod.asiento_guardado')); setGlosa(''); setFilas([{ cuenta_id: '', debe: '', haber: '' }, { cuenta_id: '', debe: '', haber: '' }]);
      if (onSaved) onSaved();
    } catch (e) { setMsg(t('prod.asiento_err_guardar')); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-3 grid gap-2">
      <h3 className="text-sm font-black" style={{ color: ORO }}>{t('prod.asiento_titulo')}</h3>
      <div className="flex gap-2">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-xs border rounded px-2 py-1" aria-label={t('prod.asiento_fecha')} />
        <input placeholder={t('prod.asiento_glosa')} value={glosa} onChange={(e) => setGlosa(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1" aria-label={t('prod.asiento_glosa')} />
      </div>
      {filas.map((f, i) => (
        <div key={i} className="grid grid-cols-3 gap-1">
          <select aria-label={`cuenta-${i}`} value={f.cuenta_id} onChange={(e) => setFila(i, { cuenta_id: e.target.value })} className="text-xs border rounded px-1 py-1 bg-black/5">
            <option value="">{t('prod.asiento_cuenta_ph')}</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input aria-label={`debe-${i}`} placeholder="Debe" inputMode="numeric" value={f.debe} onChange={(e) => setFila(i, { debe: e.target.value, haber: '' })} className="text-xs border rounded px-1 py-1" />
          <input aria-label={`haber-${i}`} placeholder="Haber" inputMode="numeric" value={f.haber} onChange={(e) => setFila(i, { haber: e.target.value, debe: '' })} className="text-xs border rounded px-1 py-1" />
        </div>
      ))}
      <button onClick={addFila} className="text-xs font-bold opacity-70 text-left">+ línea</button>
      <div className={`text-center text-xs font-black rounded-lg py-1 ${cuadrado ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
        Debe {clp(sumD)} · Haber {clp(sumH)} {cuadrado ? '✓ cuadra' : '⚠ no cuadra'}
      </div>
      <button disabled={!puedeGuardar} onClick={guardar} className="rounded-xl font-black py-2 text-black disabled:opacity-40" style={{ background: ORO }}>Guardar asiento</button>
      {msg ? <div className="text-xs text-center opacity-70">{msg}</div> : null}
    </div>
  );
}
