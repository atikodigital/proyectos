import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';
import { googleDisponible, facebookDisponible, googleNativeLogin, facebookNativeLogin } from './socialAuth';
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

  async function entrarSocial(provider) {
    setError(''); setLoading(true);
    try {
      const token = provider === 'google' ? await googleNativeLogin() : await facebookNativeLogin();
      const data = provider === 'google' ? await api.loginGoogle(token, 'negocio') : await api.loginFacebook(token, 'negocio');
      try { localStorage.setItem('hash_first_login', '1'); } catch (_) {}
      onRegistered && onRegistered(data);
    } catch {
      setError(provider === 'google' ? t('login.err_google') : t('login.err_facebook'));
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-3 p-6 max-w-sm mx-auto">
      <div>
        <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>
          Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span>
        </h1>
        <p className="text-sm opacity-70 mt-1">{t('app.tagline_negocio')}</p>
      </div>

      {googleDisponible() && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => entrarSocial('google')} disabled={loading}
            className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: '#fff', color: '#1f1f1f', border: '1px solid #dadce0' }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {t('login.google')}
          </button>
          {facebookDisponible() && (
            <button type="button" onClick={() => entrarSocial('facebook')} disabled={loading}
              className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-white"
              style={{ background: '#1877F2' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.286h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              {t('login.facebook')}
            </button>
          )}
          <div className="flex items-center gap-3 opacity-50">
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
            <span className="text-xs whitespace-nowrap">{t('regp.o_con_correo')}</span>
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
          </div>
        </div>
      )}

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
