import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';
import RegisterScreen from './RegisterScreen';
import RegisterPersonalScreen from './RegisterPersonalScreen';
import { googleDisponible, facebookDisponible, googleNativeLogin, facebookNativeLogin } from './socialAuth';

export default function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'personal'
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Recuperación de contraseña (modal liviano).
  const [olvido, setOlvido] = useState(false);
  const [olvidoIdent, setOlvidoIdent] = useState('');
  const [olvidoMsg, setOlvidoMsg] = useState('');
  const [olvidoEnviando, setOlvidoEnviando] = useState(false);

  if (mode === 'register') {
    return <RegisterScreen onRegistered={onLoggedIn} onBackToLogin={() => setMode('login')} />;
  }

  if (mode === 'personal') {
    return <RegisterPersonalScreen onRegistered={onLoggedIn} onBackToLogin={() => setMode('login')} />;
  }

  async function enviarOlvido() {
    if (olvidoIdent.trim().length < 5) { setOlvidoMsg('Escribe tu correo o WhatsApp.'); return; }
    setOlvidoEnviando(true);
    try { await api.forgotPassword(olvidoIdent.trim()); } catch { /* responde ok igual */ }
    setOlvidoEnviando(false);
    setOlvidoMsg('✅ Si encontramos tu cuenta, te enviamos el link por correo y WhatsApp. Ábrelo para poner tu nueva clave.');
  }

  async function entrarConGoogle() {
    setError(''); setLoading(true);
    try { onLoggedIn(await api.loginGoogle(await googleNativeLogin())); }
    catch { setError('No pudimos entrar con Google. Intenta de nuevo o usa tu correo.'); }
    finally { setLoading(false); }
  }
  async function entrarConFacebook() {
    setError(''); setLoading(true);
    try { onLoggedIn(await api.loginFacebook(await facebookNativeLogin())); }
    catch { setError('No pudimos entrar con Facebook. Intenta de nuevo o usa tu correo.'); }
    finally { setLoading(false); }
  }

  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      // Intentar primero login de empleado (usuario+password); si falla, intentar owner (email+password).
      let data;
      try { data = await api.login(usuario, password); }
      catch (e1) {
        if (usuario.includes('@')) {
          data = await api.loginOwner(usuario, password);
        } else { throw e1; }
      }
      onLoggedIn(data);
    } catch { setError('No pudimos iniciar sesión. Revisa tu usuario/correo y contraseña.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center gap-5 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black text-center" style={{ color: '#C9A24B' }}>
        Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span>
      </h1>

      {/* Selector principal: Empresa vs Persona natural (arriba y visible) */}
      <div>
        <p className="text-sm font-bold text-center mb-3 opacity-80">¿Cómo vas a usar Hash IA?</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setMode('register')}
            aria-label="Crear cuenta de empresa"
            className="rounded-2xl border-2 p-4 flex flex-col items-center gap-1 active:scale-95 transition"
            style={{ borderColor: '#C9A24B' }}>
            <span className="text-3xl" aria-hidden="true">🏢</span>
            <span className="font-black text-sm">Empresa</span>
            <span className="text-[11px] opacity-60 text-center leading-tight">Negocio / Pyme</span>
          </button>
          <button type="button" onClick={() => setMode('personal')}
            aria-label="Crear cuenta personal"
            className="rounded-2xl border-2 p-4 flex flex-col items-center gap-1 active:scale-95 transition"
            style={{ borderColor: '#C9A24B' }}>
            <span className="text-3xl" aria-hidden="true">👤</span>
            <span className="font-black text-sm">Personal</span>
            <span className="text-[11px] opacity-60 text-center leading-tight">Persona natural · gratis</span>
          </button>
        </div>
      </div>

      {/* Separador hacia el login de quien ya tiene cuenta */}
      <div className="flex items-center gap-3 opacity-50">
        <div className="h-px flex-1" style={{ background: 'currentColor' }} />
        <span className="text-xs whitespace-nowrap">¿ya tienes cuenta?</span>
        <div className="h-px flex-1" style={{ background: 'currentColor' }} />
      </div>

      {/* Login para usuarios existentes */}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="text-sm" htmlFor="usuario">Usuario o correo</label>
        <input id="usuario" className="rounded-xl bg-black/10 px-4 py-3 border" value={usuario}
          onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" />
        <label className="text-sm" htmlFor="password">Contraseña</label>
        <div className="relative">
          <input id="password" type={showPass ? 'text' : 'password'} className="rounded-xl bg-black/10 px-4 py-3 border w-full pr-12" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Ocultar' : 'Mostrar'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xl">{showPass ? '🙈' : '👁️'}</button>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="rounded-xl font-black py-3 text-black disabled:opacity-50" style={{ background: '#C9A24B' }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" onClick={() => { setOlvido(true); setOlvidoMsg(''); setOlvidoIdent(usuario); }}
          className="text-xs underline opacity-60 mx-auto mt-1">¿Olvidaste tu contraseña?</button>
      </form>

      {/* Login social nativo — solo en el teléfono */}
      {googleDisponible() && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 opacity-50">
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
            <span className="text-xs whitespace-nowrap">o entra con</span>
            <div className="h-px flex-1" style={{ background: 'currentColor' }} />
          </div>
          <button type="button" onClick={entrarConGoogle} disabled={loading}
            className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: '#fff', color: '#1f1f1f', border: '1px solid #dadce0' }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Continuar con Google
          </button>
          {facebookDisponible() && (
            <button type="button" onClick={entrarConFacebook} disabled={loading}
              className="rounded-xl py-3 font-bold flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: '#1877F2' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.286h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              Continuar con Facebook
            </button>
          )}
        </div>
      )}

      {olvido && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#15171a', border: '1px solid #343535', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 }}>
            <h3 style={{ margin: '0 0 6px', fontWeight: 900, color: '#C9A24B' }}>🔑 Recuperar contraseña</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>Escribe tu correo o WhatsApp y te enviamos un link para crear una nueva clave.</p>
            <input value={olvidoIdent} onChange={(e) => setOlvidoIdent(e.target.value)} autoCapitalize="none"
              placeholder="correo@ejemplo.com o +56 9 1234 5678"
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: 11, border: '1px solid #343535', background: 'rgba(41,42,42,.5)', color: '#e3e2e2' }} />
            {olvidoMsg ? <p style={{ fontSize: 12, marginTop: 8, color: olvidoMsg[0] === '✅' ? '#86efac' : '#ffb4ab' }}>{olvidoMsg}</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setOlvido(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #343535', background: 'transparent', color: '#d0c6ab', fontWeight: 700 }}>Cerrar</button>
              {olvidoMsg[0] !== '✅' && (
                <button type="button" onClick={enviarOlvido} disabled={olvidoEnviando}
                  style={{ flex: 2, padding: 10, borderRadius: 10, border: 0, background: '#C9A24B', color: '#000', fontWeight: 900, opacity: olvidoEnviando ? 0.6 : 1 }}>
                  {olvidoEnviando ? 'Enviando…' : 'Enviar link'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
