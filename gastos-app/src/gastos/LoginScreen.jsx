import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';
import RegisterScreen from './RegisterScreen';
import RegisterPersonalScreen from './RegisterPersonalScreen';

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
