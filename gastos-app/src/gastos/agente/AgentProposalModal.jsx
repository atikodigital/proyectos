import { useEffect, useState } from 'react';

const ORO = '#C9A24B';

export default function AgentProposalModal({ propuesta, onConfirmar, onCancelar }) {
  const campos = (propuesta && propuesta.campos) || [];
  const [valores, setValores] = useState(() => {
    const v = {};
    for (const c of campos) v[c.key] = c.valor;
    return v;
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancelar?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancelar]);

  function set(key, raw, tipo) {
    const valor = tipo === 'numero' ? Number(raw) : raw;
    setValores((p) => ({ ...p, [key]: valor }));
  }

  return (
    <div
      role="dialog"
      aria-label={propuesta?.titulo || 'Propuesta'}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancelar?.(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 4px', fontWeight: 900, color: ORO }}>{propuesta?.titulo}</h3>
        {propuesta?.nota ? <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>{propuesta.nota}</p> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 0' }}>
          {campos.map((c) => (
            <label key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', fontWeight: 700 }}>
              {c.label}
              {c.tipo === 'opciones' ? (
                <select aria-label={c.label} value={valores[c.key]} onChange={(e) => set(c.key, e.target.value, c.tipo)} style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                  {(c.opciones || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  aria-label={c.label}
                  type={c.tipo === 'numero' ? 'number' : 'text'}
                  value={valores[c.key]}
                  onChange={(e) => set(c.key, e.target.value, c.tipo)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              )}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={() => onCancelar?.()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Cancelar</button>
          <button onClick={() => onConfirmar?.({ ...valores })} style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: ORO, color: '#fff', fontWeight: 900 }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
