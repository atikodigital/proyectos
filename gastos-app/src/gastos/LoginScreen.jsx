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

  if (mode === 'register') {
    return <RegisterScreen onRegistered={onLoggedIn} onBackToLogin={() => setMode('login')} />;
  }

  if (mode === 'personal') {
    return <RegisterPersonalScreen onRegistered={onLoggedIn} onBackToLogin={() => setMode('login')} />;
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
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span></h1>
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
      <button type="button" onClick={() => setMode('register')}
        className="text-sm opacity-80 underline mt-1">
        ¿No tienes cuenta? Crea una en 2 minutos
      </button>
      <button type="button" onClick={() => setMode('personal')}
        className="text-sm opacity-60 underline">
        ¿Persona natural? Crea tu cuenta gratis
      </button>
    </form>
  );
}
