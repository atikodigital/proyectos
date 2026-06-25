import { useState } from 'react';
import { api } from './api';

export default function OnboardingPersonal({ company, onDone }) {
  const [step, setStep] = useState(1);
  const [sueldo, setSueldo] = useState(String(company?.sueldo_mensual || ''));
  const [diaPago, setDiaPago] = useState(String(company?.dia_pago || '1'));
  const [loading, setLoading] = useState(false);

  async function goStep2() {
    const sueldoNum = parseInt(sueldo.replace(/\D/g, ''), 10);
    if (!sueldoNum || sueldoNum <= 0) return;
    setLoading(true);
    try {
      await api.updateCompany({ sueldo_mensual: sueldoNum });
      setStep(2);
    } finally { setLoading(false); }
  }

  async function goStep3() {
    const diaNum = parseInt(diaPago, 10);
    if (!diaNum || diaNum < 1 || diaNum > 31) return;
    setLoading(true);
    try {
      await api.updateCompany({ dia_pago: diaNum });
      setStep(3);
    } finally { setLoading(false); }
  }

  async function finish() {
    setLoading(true);
    try {
      await api.updateCompany({ onboarded_at: new Date().toISOString() });
      onDone();
    } finally { setLoading(false); }
  }

  const container = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 20,
    padding: '0 24px',
    maxWidth: 400,
    margin: '0 auto',
  };
  const btn = {
    background: '#C9A24B',
    color: '#000',
    fontWeight: 900,
    fontSize: 16,
    borderRadius: 14,
    padding: '14px 0',
    border: 'none',
    cursor: 'pointer',
    opacity: loading ? 0.5 : 1,
  };
  const input = {
    background: 'rgba(0,0,0,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 18,
    color: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };

  if (step === 1) return (
    <div style={container}>
      <h2 style={{ color: '#C9A24B', fontWeight: 900, fontSize: 22, margin: 0 }}>Paso 1 de 3</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>¿Cuánto es tu sueldo mensual?</p>
      <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>KALY lo usará para calcular cuánto te queda cada mes.</p>
      <input style={input} inputMode="numeric" placeholder="Ej: 800000"
        value={sueldo} onChange={(e) => setSueldo(e.target.value)} />
      <button style={btn} disabled={loading} onClick={goStep2}>
        {loading ? 'Guardando…' : 'Continuar →'}
      </button>
    </div>
  );

  if (step === 2) return (
    <div style={container}>
      <h2 style={{ color: '#C9A24B', fontWeight: 900, fontSize: 22, margin: 0 }}>Paso 2 de 3</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>¿Qué día te depositan el sueldo?</p>
      <select style={{ ...input, fontSize: 16 }} value={diaPago} onChange={(e) => setDiaPago(e.target.value)}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>Día {d}</option>
        ))}
      </select>
      <button style={btn} disabled={loading} onClick={goStep3}>
        {loading ? 'Guardando…' : 'Continuar →'}
      </button>
    </div>
  );

  return (
    <div style={container}>
      <h2 style={{ color: '#7CFC9B', fontWeight: 900, fontSize: 22, margin: 0 }}>¡Listo! 🎉</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>KALY ya sabe tu presupuesto. Registra tu primer gasto y verás cuánto te queda automáticamente.</p>
      <button style={btn} disabled={loading} onClick={finish}>
        {loading ? 'Un momento…' : 'Empezar →'}
      </button>
    </div>
  );
}
