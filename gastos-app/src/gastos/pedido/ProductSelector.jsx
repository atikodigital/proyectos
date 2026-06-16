import React, { useMemo, useState } from 'react';
import { linePrice, lineLabel } from './cart';

const GOLD = '#C9A24B';
const clp = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('es-CL');

export default function ProductSelector({ product, onAdd, onCancel }) {
  const initial = useMemo(() => {
    const op = {};
    for (const g of (product.variantes || [])) { if (g.opciones && g.opciones[0]) op[g.id] = g.opciones[0].id; }
    return op;
  }, [product]);
  const [opciones, setOpciones] = useState(initial);
  const [extras, setExtras] = useState([]);
  const [cantidad, setCantidad] = useState(1);
  const sel = { opciones, extras };
  const precio = linePrice(product, sel) * cantidad;

  function toggleExtra(id) { setExtras((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]); }

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ color: GOLD, fontWeight: 900 }}>{product.nombre}</h3>
      {(product.variantes || []).map((g) => (
        <div key={g.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>{g.nombre}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(g.opciones || []).map((o) => (
              <button key={o.id} onClick={() => setOpciones((p) => ({ ...p, [g.id]: o.id }))}
                style={{ padding: '6px 10px', borderRadius: 8, border: 0, fontSize: 12,
                  background: opciones[g.id] === o.id ? GOLD : '#ffffff14', color: opciones[g.id] === o.id ? '#000' : '#fff' }}>
                <span>{o.nombre}</span>{o.delta ? <span> +{clp(o.delta)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
      {(product.extras || []).length ? <div style={{ fontSize: 11, opacity: 0.7, margin: '8px 0 4px' }}>Extras</div> : null}
      {(product.extras || []).map((e) => (
        <label key={e.id} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
          <input type="checkbox" checked={extras.includes(e.id)} onChange={() => toggleExtra(e.id)} />
          {e.nombre} +{clp(e.precio)}
        </label>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Cantidad</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} style={{ border: 0, background: '#ffffff14', color: '#fff', borderRadius: 6, width: 28, height: 28 }}>−</button>
          <b>{cantidad}</b>
          <button onClick={() => setCantidad((c) => c + 1)} style={{ border: 0, background: '#ffffff14', color: '#fff', borderRadius: 6, width: 28, height: 28 }}>+</button>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #ffffff22', paddingTop: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{lineLabel(product, sel)}</span>
        <b style={{ color: GOLD }}>{clp(precio)}</b>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, border: 0, background: '#ffffff14', color: '#fff', fontWeight: 800, borderRadius: 10, padding: 10 }}>Volver</button>
        <button onClick={() => onAdd({ productId: product.id, opciones, extras, cantidad })}
          style={{ flex: 2, border: 0, background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: 10 }}>Agregar al carrito</button>
      </div>
    </div>
  );
}
