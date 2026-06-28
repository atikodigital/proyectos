import React, { useEffect, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import EvidenceIntake from '../components/EvidenceIntake.jsx';

const GOLD = '#C9A24B';

function desde(p) {
  let base = Math.max(0, Math.round(Number(p.precio_base) || 0));
  for (const g of (p.variantes || [])) {
    const ds = (g.opciones || []).map((o) => Math.round(Number(o.delta) || 0));
    base += ds.length ? Math.min(...ds) : 0;
  }
  return base;
}
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');

export default function ProductosView() {
  const [items, setItems] = useState([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('producto');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [err, setErr] = useState('');
  const [captura, setCaptura] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function cargar() {
    try { setItems(await api.listProducts(true)); } catch (e) { setErr(t('prod.err_cargar')); }
  }
  useEffect(() => { cargar(); }, []);

  async function guardar() {
    setErr('');
    if (!nombre.trim()) { setErr(t('prod.err_falta_nombre')); return; }
    try {
      await api.createProduct({
        nombre: nombre.trim(), tipo,
        precio_base: Number(precio) || 0,
        stock: stock === '' ? null : Number(stock),
      });
      setNombre(''); setPrecio(''); setStock('');
      cargar();
    } catch (e) { setErr(t('prod.err_guardar')); }
  }

  async function onFoto(evs) {
    const ev = (evs || [])[0];
    if (!ev || !ev.imageBase64) return;
    setCaptura(false); setBusy(true); setErr('');
    try {
      const r = await api.catalogExtraer(ev.imageBase64, ev.imageMimeType || 'image/jpeg');
      setPreview(((r && r.productos) || []).map((p) => ({ nombre: p.nombre, precio: p.precio, incluir: true })));
    } catch (e) { setErr(t('prod.err_leer_foto')); }
    finally { setBusy(false); }
  }

  async function crearPreview() {
    const sel = preview.filter((p) => p.incluir).map((p) => ({ nombre: p.nombre, precio: Number(p.precio) || 0 }));
    if (!sel.length) return;
    setBusy(true);
    try { await api.crearProductosBulk(sel); setPreview(null); cargar(); }
    catch (e) { setErr(t('prod.err_crear')); }
    finally { setBusy(false); }
  }

  if (preview) {
    const marcados = preview.filter((p) => p.incluir).length;
    return (
      <div style={{ padding: 12 }}>
        <h2 style={{ color: GOLD, fontWeight: 900 }}>{t('prod.revisa_titulo')}</h2>
        <p style={{ fontSize: 12, opacity: 0.7 }}>{t('prod.revisa_sub')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
          {preview.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={p.incluir} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))} />
              <input value={p.nombre} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} style={{ flex: 2, padding: 8, borderRadius: 8 }} />
              <input type="number" value={p.precio} onChange={(e) => setPreview((xs) => xs.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))} style={{ width: 90, padding: 8, borderRadius: 8 }} />
            </div>
          ))}
          {!preview.length && <div style={{ opacity: 0.6 }}>{t('prod.sin_productos_foto')}</div>}
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
        <button disabled={busy || !marcados} onClick={crearPreview} style={{ width: '100%', background: GOLD, color: '#000', fontWeight: 900, borderRadius: 10, padding: 12, border: 0, opacity: (busy || !marcados) ? 0.5 : 1 }}>{t('prod.crear_n_productos_1')}{marcados}{t('prod.crear_n_productos_2')}</button>
        <button onClick={() => setPreview(null)} style={{ width: '100%', background: 'transparent', color: '#000', marginTop: 8, border: 0, opacity: 0.6 }}>{t('prod.cancelar')}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: GOLD, fontWeight: 900 }}>{t('prod.titulo')}</h2>
        <button onClick={() => setCaptura(true)} style={{ background: '#ffffff14', color: '#000', fontWeight: 800, borderRadius: 10, padding: '8px 12px', border: 0 }}>{t('prod.desde_foto')}</button>
      </div>
      {captura ? (
        <div style={{ margin: '10px 0' }}>
          <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t('prod.foto_instruccion')}</p>
          <EvidenceIntake maxEvidence={1} value={[]} onChange={onFoto} showNativeCapture />
        </div>
      ) : null}
      {busy ? <div style={{ opacity: 0.7, fontSize: 13, margin: '8px 0' }}>{t('prod.leyendo')}</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 16px' }}>
        {items.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', background: '#ffffff10', borderRadius: 12, padding: 10 }}>
            <div>
              <div style={{ fontWeight: 800 }}>{p.nombre}{p.tipo === 'servicio' ? ' · ' + t('prod.servicio') : ''}</div>
              <div style={{ color: GOLD, fontSize: 12 }}>
                {p.tipo === 'servicio' ? clp(p.precio_base) + ' / ' + (p.unidad || t('prod.unidad')) : t('prod.desde') + ' ' + clp(desde(p))}
                {p.stock != null ? ' · 📦 ' + p.stock : ''}
              </div>
            </div>
            <span>{p.activo ? '●' : '○'}</span>
          </div>
        ))}
        {!items.length && <div style={{ opacity: 0.6 }}>{t('prod.vacio')}</div>}
      </div>

      <div style={{ background: '#ffffff08', borderRadius: 12, padding: 12 }}>
        <input placeholder={t('prod.ph_nombre')} value={nombre} onChange={(e) => setNombre(e.target.value)}
          style={{ width: '100%', padding: 9, borderRadius: 8, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }}>
            <option value="producto">{t('prod.opt_producto')}</option>
            <option value="servicio">{t('prod.opt_servicio')}</option>
          </select>
          <input placeholder={t('prod.ph_precio')} type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
            style={{ flex: 1, padding: 9, borderRadius: 8 }} />
          <input placeholder={t('prod.ph_stock')} type="number" value={stock} onChange={(e) => setStock(e.target.value)}
            style={{ flex: 1, padding: 9, borderRadius: 8 }} />
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
        <button onClick={guardar} style={{ background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '10px 16px', border: 0 }}>{t('prod.guardar')}</button>
      </div>
    </div>
  );
}
