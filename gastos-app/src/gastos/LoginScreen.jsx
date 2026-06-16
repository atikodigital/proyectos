import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';

export default function LoginScreen({ onLoggedIn }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try { onLoggedIn(await api.login(usuario, password)); }
    catch { setError('No pudimos iniciar sesión. Revisa tu usuario y contraseña.'); }
    finally { setLoading(false); }
  }
  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">{APP_VERSION}</span></h1>
      <label className="text-sm" htmlFor="usuario">Usuario</label>
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
    </form>
  );
}
