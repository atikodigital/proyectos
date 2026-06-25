import EvidenceIntake from '../../components/EvidenceIntake.jsx';

const ORO = '#C9A24B';

export default function EvidenceCaptureOverlay({ motivo, agente, onCapturar, onCancelar }) {
  function onChange(items) {
    const first = Array.isArray(items) && items[0];
    if (first) onCapturar?.(first);
  }
  const lead = agente ? `${agente} te pide` : 'Para continuar, adjunta';
  return (
    <div role="dialog" aria-label="Adjuntar documento" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, position: 'relative' }}>
        <button
          type="button"
          onClick={() => onCancelar?.()}
          aria-label="Cerrar"
          style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 20, lineHeight: '1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
        <h3 style={{ margin: '0 8px 8px 0', fontWeight: 900, color: ORO, paddingRight: 28 }}>Adjunta un documento</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569' }}>{lead}: {motivo}</p>
        <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => onCancelar?.()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
