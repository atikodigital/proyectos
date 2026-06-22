import { useState } from 'react';
import { api } from './api';
import { APP_VERSION } from './version';

/**
 * Registro de clientes terceros para Hash IA (BSP).
 * Crea company + user owner en backend, devuelve JWT, levanta sesión.
 */
export default function RegisterScreen({ onRegistered, onBackToLogin }) {
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreOwner, setNombreOwner] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [ownerWa, setOwnerWa] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!nombreNegocio.trim()) return setError('Pon el nombre de tu negocio.');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    setLoading(true);
    try {
      const data = await api.register({
        nombre_negocio: nombreNegocio.trim(),
        nombre_owner: nombreOwner.trim() || null,
        email: email.trim().toLowerCase(),
        password,
        owner_whatsapp: ownerWa.trim() || null,
      });
      // Marca primer login para que el wizard se abra automáticamente
      try { localStorage.setItem('hash_first_login', '1'); } catch (_) {}
      onRegistered && onRegistered(data);
    } catch (e2) {
      setError(e2.data && e2.data.error ? e2.data.error : 'No pudimos crear la cuenta. Reintenta en un momento.');
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
        <p className="text-sm opacity-70 mt-1">Crea tu cuenta y conecta tu WhatsApp en 2 minutos.</p>
      </div>

      <label className="text-sm" htmlFor="nombre-negocio">Nombre de tu negocio</label>
      <input id="nombre-negocio" className="rounded-xl bg-black/10 px-4 py-3 border" value={nombreNegocio}
        onChange={(e) => setNombreNegocio(e.target.value)} placeholder="Ej: Pizzería La Plaza" autoFocus />

      <label className="text-sm" htmlFor="nombre-owner">Tu nombre (opcional)</label>
      <input id="nombre-owner" className="rounded-xl bg-black/10 px-4 py-3 border" value={nombreOwner}
        onChange={(e) => setNombreOwner(e.target.value)} placeholder="Cómo te llamas" autoCapitalize="words" />

      <label className="text-sm" htmlFor="email">Correo</label>
      <input id="email" type="email" className="rounded-xl bg-black/10 px-4 py-3 border" value={email}
        onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.cl" autoCapitalize="none" required />

      <label className="text-sm" htmlFor="password">Contraseña (mín 8)</label>
      <div className="relative">
        <input id="password" type={showPass ? 'text' : 'password'} className="rounded-xl bg-black/10 px-4 py-3 border w-full pr-12"
          value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Ocultar' : 'Mostrar'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xl">{showPass ? '🙈' : '👁️'}</button>
      </div>

      <label className="text-sm" htmlFor="owner-wa">WhatsApp del dueño (opcional)</label>
      <input id="owner-wa" type="tel" className="rounded-xl bg-black/10 px-4 py-3 border" value={ownerWa}
        onChange={(e) => setOwnerWa(e.target.value)} placeholder="+56 9 1234 5678" inputMode="tel" />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button type="submit" disabled={loading}
        className="rounded-xl font-black py-3 text-black disabled:opacity-50 mt-2"
        style={{ background: '#C9A24B' }}>
        {loading ? 'Creando cuenta…' : 'Crear cuenta y empezar →'}
      </button>

      <button type="button" onClick={onBackToLogin}
        className="text-sm opacity-70 underline mt-1">
        ¿Ya tienes cuenta? Inicia sesión
      </button>

      <p className="text-xs opacity-50 mt-3 text-center">
        Al crear tu cuenta aceptas los <a href="https://hash.atikodigital.cl/terminos.html" target="_blank" rel="noopener noreferrer" className="underline">Términos</a> y la <a href="https://hash.atikodigital.cl/privacidad.html" target="_blank" rel="noopener noreferrer" className="underline">Política de privacidad</a> de Atiko/Hash IA.
      </p>
    </form>
  );
}
