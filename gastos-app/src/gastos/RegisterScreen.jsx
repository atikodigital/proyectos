import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';
import { t } from './i18n';

/**
 * Registro de clientes terceros para Hash IA (BSP).
 * Solo pide correo + contraseña; el nombre del negocio, WhatsApp, etc. se piden
 * DESPUÉS de entrar (OnboardingWizard), igual que cuando entras con Google/Facebook.
 */
export default function RegisterScreen({ onRegistered, onBackToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError(t('reg.err_pass8'));
    setLoading(true);
    try {
      // Sin nombre del negocio: lo pide el OnboardingWizard tras entrar.
      const data = await api.register({ email: email.trim().toLowerCase(), password });
      // Marca primer login para que el wizard se abra automáticamente
      try { localStorage.setItem('hash_first_login', '1'); } catch (_) {}
      onRegistered && onRegistered(data);
    } catch (e2) {
      setError(e2.data && e2.data.error ? e2.data.error : t('reg.err_generico'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-3 p-6 max-w-sm mx-auto">
      <div>
        <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>
          Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span>
        </h1>
        <p className="text-sm opacity-70 mt-1">{t('app.tagline_negocio')}</p>
      </div>

      <label className="text-sm" htmlFor="email">{t('reg.correo')}</label>
      <input id="email" type="email" className="rounded-xl bg-black/10 px-4 py-3 border" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.cl" autoCapitalize="none" autoFocus required />

      <label className="text-sm" htmlFor="password">{t('reg.password_min')}</label>
      <div className="relative">
        <input id="password" type={showPass ? 'text' : 'password'} className="rounded-xl bg-black/10 px-4 py-3 border w-full pr-12"
          value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Ocultar' : 'Mostrar'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xl">{showPass ? '🙈' : '👁️'}</button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button type="submit" disabled={loading}
        className="rounded-xl font-black py-3 text-black disabled:opacity-50 mt-2"
        style={{ background: '#C9A24B' }}>
        {loading ? t('reg.creando') : t('reg.crear_empezar')}
      </button>

      <button type="button" onClick={onBackToLogin}
        className="text-sm opacity-70 underline mt-1">
        {t('reg.ya_tengo')}
      </button>

      <p className="text-xs opacity-50 mt-3 text-center">
        {t('reg.acepto')} <a href="https://hash.atikodigital.cl/terminos.html" target="_blank" rel="noopener noreferrer" className="underline">{t('reg.terminos')}</a> {t('reg.y_la')} <a href="https://hash.atikodigital.cl/privacidad.html" target="_blank" rel="noopener noreferrer" className="underline">{t('reg.privacidad')}</a> · Atiko/Hash IA.
      </p>
    </form>
  );
}
