import { useState } from 'react';
import { api } from './api';
import { googleDisponible, facebookDisponible, googleNativeLogin, facebookNativeLogin } from './socialAuth';

export default function RegisterPersonalScreen({ onRegistered, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Paso de ingreso tras crear la cuenta (social o manual), saltable.
  const [incomeStep, setIncomeStep] = useState(false);
  const [incomeVal, setIncomeVal] = useState('');
  const [socialData, setSocialData] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || password.length < 6) {
      setError('Escribe tu correo y una contraseña de al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      // Sin nombre ni ingreso: el ingreso se pide DESPUÉS (saltable).
      const data = await api.registerPersonal({ email: email.trim().toLowerCase(), password });
      if (data && data.needsIncome) { setSocialData(data); setIncomeStep(true); }
      else onRegistered(data);
    } catch (err) {
      const msg = err?.body?.error || err?.message || '';
      if (msg === 'email_en_uso') setError('Este correo ya tiene una cuenta. Inicia sesión.');
      else setError('No se pudo crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function entrarSocial(provider) {
    setError(''); setLoading(true);
    try {
      const token = provider === 'google' ? await googleNativeLogin() : await facebookNativeLogin();
      const data = provider === 'google' ? await api.loginGoogle(token, 'personal') : await api.loginFacebook(token, 'personal');
      if (data && data.needsIncome) { setSocialData(data); setIncomeStep(true); }
      else onRegistered(data);
    } catch {
      setError(`No pudimos entrar con ${provider === 'google' ? 'Google' : 'Facebook'}. Intenta de nuevo o usa tu correo.`);
    } finally { setLoading(false); }
  }

  async function guardarIngreso() {
    const num = parseInt((incomeVal || '').replace(/\D/g, ''), 10);
    if (num) { try { await api.personalIncome(num); } catch { /* igual entra */ } }
    onRegistered(socialData);
  }

  // Paso 2: pedir el ingreso (saltable) tras el registro social.
  if (incomeStep) {
    return (
      <div className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
        <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>¡Bienvenido! 👋</h1>
        <p className="text-sm opacity-70">¿Cuánto ganas al mes? Lo usamos para tu balance. Puedes saltarlo y ponerlo después.</p>
        <label className="text-sm" htmlFor="rp-income">Sueldo o ingresos mensuales ($CLP)</label>
        <input id="rp-income" inputMode="numeric" placeholder="Ej: 800000" className="rounded-xl bg-black/10 px-4 py-3 border" value={incomeVal}
          onChange={(e) => setIncomeVal(e.target.value)} autoFocus />
        <button type="button" onClick={guardarIngreso} className="rounded-xl font-black py-3 text-black" style={{ background: '#C9A24B' }}>
          Guardar
        </button>
        <button type="button" onClick={() => onRegistered(socialData)} className="text-sm opacity-70 underline mt-1">
          Lo configuro después
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">personal</span></h1>
      <p className="text-sm opacity-70">Crea tu cuenta personal y empieza a controlar tus finanzas.</p>

      {googleDisponible() && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => entrarSocial('google')} disabled={loading}
            className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: '#fff', color: '#1f1f1f', border: '1px solid #dadce0' }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continuar con Google
          </button>
          {facebookDisponible() && (
            <button type="button" onClick={() => entrarSocial('facebook')} disabled={loading}
              className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white"
              style={{ background: '#1877F2' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.286h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              Continuar con Facebook
            </button>
          )}
          <div className="flex items-center gap-3 opacity-50">
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
            <span className="text-xs whitespace-nowrap">o con tu correo</span>
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
          </div>
        </div>
      )}

      <label className="text-sm" htmlFor="rp-email">Correo</label>
      <input id="rp-email" type="email" className="rounded-xl bg-black/10 px-4 py-3 border" value={email}
        onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />

      <label className="text-sm" htmlFor="rp-pass">Contraseña (mín. 6 caracteres)</label>
      <input id="rp-pass" type="password" className="rounded-xl bg-black/10 px-4 py-3 border" value={password}
        onChange={(e) => setPassword(e.target.value)} />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button type="submit" disabled={loading} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>
        {loading ? 'Creando cuenta…' : 'Crear mi cuenta'}
      </button>
      <button type="button" onClick={onBackToLogin} className="text-sm opacity-80 underline mt-1">
        Ya tengo cuenta
      </button>
    </form>
  );
}
