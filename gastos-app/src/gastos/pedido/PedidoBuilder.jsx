import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { cartTotal, costoEnvioLocal, linePrice } from './cart';
import ProductSelector from './ProductSelector';

const GOLD = '#C9A24B';
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');
function abrir(url) { try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; } }

export default function PedidoBuilder({ channel, contact, onClose }) {
  const [productos, setProductos] = useState([]);
  const [cfg, setCfg] = useState({ iva_incluido: true });
  const [sel, setSel] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [entrega, setEntrega] = useState('retiro');
  const [direccion, setDireccion] = useState('');
  const [comunas, setComunas] = useState([]);
  const [comuna, setComuna] = useState('');
  const [pedido, setPedido] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.listProducts().then((p) => setProductos(Array.isArray(p) ? p : [])).catch(() => setProductos([]));
    api.getPedidoConfig().then(setCfg).catch(() => {});
    api.comunas().then((r) => setComunas(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  function addLinea(l) {
    const product = productos.find((p) => p.id === l.productId);
    setLineas((xs) => [...xs, { ...l, product }]);
    setSel(null);
  }
  const total = cartTotal(lineas.map((l) => ({ product: l.product, sel: { opciones: l.opciones, extras: l.extras }, cantidad: l.cantidad })), cfg);

  const subtotalProductos = lineas.reduce((s, l) => s + linePrice(l.product, { opciones: l.opciones, extras: l.extras }) * l.cantidad, 0);
  const env = (entrega === 'despacho' && comuna) ? costoEnvioLocal(cfg.delivery, comuna, subtotalProductos) : null;
  const envioCosto = env && env.ok ? env.costo : 0;
  const totalConEnvio = total + envioCosto;

  async function generar() {
    setErr('');
    try {
      const r = await api.pedidoFromCatalog({
        channel, contact: { name: contact },
        lineas: lineas.map((l) => ({ productId: l.productId, opciones: l.opciones, extras: l.extras, cantidad: l.cantidad })),
        entrega, direccion: entrega === 'despacho' ? direccion : null,
        comuna: entrega === 'despacho' ? comuna : null,
      });
      setPedido({ id: r.pedido && r.pedido.id, text: r.text || '', waUrl: r.waUrl || ('https://wa.me/?text=' + encodeURIComponent(r.text || '')) });
    } catch (e) { setErr('No pude generar el pedido.'); }
  }

  if (pedido) {
    return (
      <div style={{ padding: 12 }}>
        <h3 style={{ color: GOLD, fontWeight: 900 }}>Pedido listo</h3>
        <textarea value={pedido.text} onChange={(e) => setPedido({ ...pedido, text: e.target.value, waUrl: 'https://wa.me/?text=' + encodeURIComponent(e.target.value) })}
          rows={10} style={{ width: '100%', borderRadius: 12, padding: 10 }} />
        <button onClick={() => abrir(pedido.waUrl)} style={{ width: '100%', border: 0, background: '#16A34A', color: '#fff', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>Enviar por WhatsApp</button>
        {pedido.id ? (
          <button onClick={() => api.pedidoPdfAbrir(pedido.id)} style={{ width: '100%', border: 0, background: '#ffffff14', color: '#fff', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>📄 PDF</button>
        ) : null}
        <button onClick={onClose} style={{ width: '100%', border: 0, background: 'transparent', color: '#fff', opacity: 0.6, marginTop: 8 }}>Cerrar</button>
      </div>
    );
  }

  if (sel) return <ProductSelector product={sel} onAdd={addLinea} onCancel={() => setSel(null)} />;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: GOLD, fontWeight: 900 }}>Arma el pedido</h3>
        <button onClick={onClose} style={{ border: 0, background: 'transparent', color: '#fff', opacity: 0.6 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>Elige del catálogo</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {productos.map((p) => (
          <button key={p.id} onClick={() => setSel(p)} style={{ textAlign: 'left', border: 0, background: '#ffffff10', color: '#fff', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800 }}>{p.nombre}</span>
            <span style={{ color: GOLD, fontSize: 12 }}>›</span>
          </button>
        ))}
        {!productos.length && <div style={{ opacity: 0.6, fontSize: 13 }}>No hay productos. Cárgalos en "Productos".</div>}
      </div>

      {lineas.length ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Carrito</div>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span>{l.product && l.product.nombre} ×{l.cantidad}</span>
              <button onClick={() => setLineas((xs) => xs.filter((_, j) => j !== i))} style={{ border: 0, background: 'transparent', color: '#ff6b6b' }}>quitar</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            <button onClick={() => setEntrega('retiro')} style={{ flex: 1, border: 0, borderRadius: 8, padding: 8, fontSize: 12, background: entrega === 'retiro' ? GOLD : '#ffffff14', color: entrega === 'retiro' ? '#000' : '#fff' }}>Retiro</button>
            <button onClick={() => setEntrega('despacho')} style={{ flex: 1, border: 0, borderRadius: 8, padding: 8, fontSize: 12, background: entrega === 'despacho' ? GOLD : '#ffffff14', color: entrega === 'despacho' ? '#000' : '#fff' }}>Despacho</button>
          </div>
          {entrega === 'despacho' ? (
            <>
              <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: 8, marginBottom: 8 }} />
              <select aria-label="Comuna de despacho" value={comuna} onChange={(e) => setComuna(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                <option value="">Comuna…</option>
                {comunas.map((g) => (
                  <optgroup key={g.region} label={g.region}>
                    {g.comunas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              {comuna ? (
                env && env.ok
                  ? <div style={{ fontSize: 12, opacity: 0.8 }}>Envío: {env.gratis ? 'Gratis' : clp(env.costo)}</div>
                  : <div style={{ fontSize: 12, color: '#ff6b6b' }}>No tienes envío a esa comuna.</div>
              ) : null}
            </>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #ffffff22', paddingTop: 8 }}>
            <span style={{ opacity: 0.7 }}>Total</span><b style={{ color: GOLD, fontSize: 18 }}>{clp(totalConEnvio)}</b>
          </div>
          {err ? <div style={{ color: '#ff6b6b', fontSize: 13 }}>{err}</div> : null}
          <button onClick={generar} style={{ width: '100%', border: 0, background: GOLD, color: '#000', fontWeight: 900, borderRadius: 12, padding: 12, marginTop: 8 }}>Generar pedido</button>
        </div>
      ) : null}
    </div>
  );
}
