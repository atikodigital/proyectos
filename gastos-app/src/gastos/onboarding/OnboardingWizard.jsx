import React, { useEffect, useState } from 'react';
import { api } from '../api';
import ProductosView from '../ProductosView.jsx';

const GOLD = '#C9A24B';
const PASOS = ['Tu negocio', 'Tu catálogo', 'IVA', 'Despacho', '¡Listo!'];

export default function OnboardingWizard({ onDone, onSkip, onIrAlChat, onCrearPedido }) {
  const [i, setI] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState('');
  const [nombre, setNombre] = useState('');
  const [giro, setGiro] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nProductos, setNProductos] = useState(0);
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [haceDelivery, setHaceDelivery] = useState(false);
  const [costoEnvio, setCostoEnvio] = useState('');
  const [gratisDesde, setGratisDesde] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const c = await api.getCompany();
        setNombre(c?.nombre || ''); setGiro(c?.giro || ''); setWhatsapp(c?.owner_whatsapp || '');
        const cfg = await api.getPedidoConfig();
        if (cfg && cfg.pedido_iva_incluido != null) setIvaIncluido(!!cfg.pedido_iva_incluido);
        const prods = await api.listProducts(true);
        setNProductos((prods || []).length);
      } catch (e) { /* sigue con defaults */ }
      setCargando(false);
    })();
  }, []);

  async function guardarNegocio() {
    setErr('');
    if (!nombre.trim()) { setErr('Pon el nombre de tu negocio'); return false; }
    try { await api.updateCompany({ nombre: nombre.trim(), giro: giro.trim(), owner_whatsapp: whatsapp.trim() }); return true; }
    catch (e) { setErr('No pude guardar, reintenta'); return false; }
  }
  async function guardarIva() { try { await api.setPedidoConfig({ pedido_iva_incluido: ivaIncluido }); return true; } catch { setErr('No pude guardar el IVA'); return false; } }
  async function guardarDespacho() {
    try {
      const delivery = haceDelivery
        ? { zonas: [{ id: 'general', nombre: 'Despacho', costo: Math.max(0, Math.round(Number(costoEnvio) || 0)), comunas: [] }], gratis_desde: gratisDesde === '' ? null : Math.max(0, Math.round(Number(gratisDesde) || 0)) }
        : { zonas: [], gratis_desde: null };
      await api.setPedidoConfig({ delivery });
      return true;
    } catch { setErr('No pude guardar el despacho'); return false; }
  }

  async function siguiente() {
    if (i === 0) { if (!(await guardarNegocio())) return; }
    if (i === 1) { try { setNProductos((await api.listProducts(true) || []).length); } catch {} }
    if (i === 2) { if (!(await guardarIva())) return; }
    if (i === 3) { if (!(await guardarDespacho())) return; }
    setI((x) => Math.min(PASOS.length - 1, x + 1));
  }
  async function terminar() { try { await api.updateCompany({ onboarded: true }); } catch {} onDone && onDone(); }

  if (cargando) return <div style={{ padding: 24, color: '#cfeaf3' }}>Cargando…</div>;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', color: '#e7eef2', overflowY: 'auto', zIndex: 50, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Paso {i + 1} de {PASOS.length}</div>
        <button onClick={() => onSkip && onSkip()} style={{ background: 'transparent', color: '#9aa', border: 0 }}>Saltar por ahora</button>
      </div>
      <div style={{ height: 4, background: '#ffffff14', borderRadius: 4, margin: '10px 0 18px' }}>
        <div style={{ width: `${((i + 1) / PASOS.length) * 100}%`, height: '100%', background: GOLD, borderRadius: 4 }} />
      </div>

      {i === 0 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu negocio</h2>
          <input placeholder="Nombre de tu negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inp} />
          <input placeholder="Rubro (ej. pastelería)" value={giro} onChange={(e) => setGiro(e.target.value)} style={inp} />
          <input placeholder="WhatsApp del dueño (569…)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inp} />
        </div>
      )}
      {i === 1 && (
        <div>
          <h2 style={{ color: GOLD }}>Tu catálogo</h2>
          <p style={{ fontSize: 13, opacity: 0.75 }}>Cárgalos por foto, por voz con KALY o a mano. Llevas {nProductos}.</p>
          <ProductosView />
        </div>
      )}
      {i === 2 && (
        <div>
          <h2 style={{ color: GOLD }}>IVA</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} />
            Mis precios YA incluyen IVA
          </label>
          <p style={{ fontSize: 12, opacity: 0.6 }}>Si lo desmarcas, al pedido se le agrega 19%.</p>
        </div>
      )}
      {i === 3 && (
        <div>
          <h2 style={{ color: GOLD }}>Despacho</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={haceDelivery} onChange={(e) => setHaceDelivery(e.target.checked)} /> Hago delivery
          </label>
          {haceDelivery && (
            <div style={{ marginTop: 10 }}>
              <input placeholder="Costo del despacho" type="number" value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} style={inp} />
              <input placeholder="Gratis desde $ (opcional)" type="number" value={gratisDesde} onChange={(e) => setGratisDesde(e.target.value)} style={inp} />
              <p style={{ fontSize: 12, opacity: 0.6 }}>Las zonas por comuna se configuran después en el panel.</p>
            </div>
          )}
        </div>
      )}
      {i === 4 && (
        <div>
          <h2 style={{ color: GOLD }}>¡Listo!</h2>
          <p>Tienes {nProductos} producto(s). IVA {ivaIncluido ? 'incluido' : 'se agrega 19%'}. {haceDelivery ? `Despacho $${Math.round(Number(costoEnvio) || 0)}` : 'Sin despacho'}.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => { terminar(); onIrAlChat && onIrAlChat(); }} style={btnGold}>Ir al Chat</button>
            <button onClick={() => { terminar(); onCrearPedido && onCrearPedido(); }} style={btnOutline}>Crear pedido de prueba</button>
          </div>
        </div>
      )}

      {err ? <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{err}</div> : null}

      {i < 4 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={{ ...btnOutline, opacity: i === 0 ? 0.4 : 1 }}>Atrás</button>
          <button onClick={siguiente} style={btnGold}>Siguiente</button>
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', padding: 11, borderRadius: 8, marginTop: 10, background: '#ffffff10', border: '1px solid #ffffff22', color: '#e7eef2' };
const btnGold = { background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '11px 18px', border: 0 };
const btnOutline = { background: 'transparent', color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 10, padding: '11px 18px' };
