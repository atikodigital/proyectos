import { useState } from 'react';
import { api } from './api';
import { t } from './i18n';

export default function OnboardingPersonal({ company, onDone }) {
  const [step, setStep] = useState(1);
  const [sueldo, setSueldo] = useState(String(company?.sueldo_mensual || ''));
  const [diaPago, setDiaPago] = useState(String(company?.dia_pago || '1'));
  const [idioma, setIdioma] = useState(company?.idioma || 'es');
  const [loading, setLoading] = useState(false);

  async function goStep2() {
    const sueldoNum = parseInt(sueldo.replace(/\D/g, ''), 10);
    if (!sueldoNum || sueldoNum <= 0) return;
    setLoading(true);
    try {
      await api.updateCompany({ sueldo_mensual: sueldoNum, idioma });
      try { localStorage.setItem('hash_idioma', idioma); } catch (_) {}
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
      <h2 style={{ color: '#C9A24B', fontWeight: 900, fontSize: 22, margin: 0 }}>{t('onb.paso1_titulo')}</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>{t('onb.sueldo_q')}</p>
      <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>{t('onb.sueldo_help')}</p>
      <input style={input} inputMode="numeric" placeholder="Ej: 800000"
        value={sueldo} onChange={(e) => setSueldo(e.target.value)} />
      <label style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Idioma / Language</label>
      <select style={{ ...input, fontSize: 16 }} value={idioma} onChange={(e) => setIdioma(e.target.value)}>
        <option value="es">Español</option>
        <option value="en">English</option>
        <option value="pt">Português</option>
      </select>
      <button style={btn} disabled={loading} onClick={goStep2}>
        {loading ? t('onb.guardando') : t('onb.continuar')}
      </button>
    </div>
  );

  if (step === 2) return (
    <div style={container}>
      <h2 style={{ color: '#C9A24B', fontWeight: 900, fontSize: 22, margin: 0 }}>{t('onb.paso2_titulo')}</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>{t('onb.dia_pago_q')}</p>
      <select style={{ ...input, fontSize: 16 }} value={diaPago} onChange={(e) => setDiaPago(e.target.value)}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{t('onb.dia')} {d}</option>
        ))}
      </select>
      <button style={btn} disabled={loading} onClick={goStep3}>
        {loading ? t('onb.guardando') : t('onb.continuar')}
      </button>
    </div>
  );

  return (
    <div style={container}>
      <h2 style={{ color: '#7CFC9B', fontWeight: 900, fontSize: 22, margin: 0 }}>{t('onb.listo_personal')}</h2>
      <p style={{ opacity: 0.7, margin: 0 }}>{t('onb.listo_personal_sub')}</p>
      <button style={btn} disabled={loading} onClick={finish}>
        {loading ? t('onb.un_momento') : t('onb.empezar')}
      </button>
    </div>
  );
}
