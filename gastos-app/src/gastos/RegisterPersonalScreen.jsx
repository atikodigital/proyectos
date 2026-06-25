import { useState } from 'react';
import { api } from './api';

export default function RegisterPersonalScreen({ onRegistered, onBackToLogin }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sueldo, setSueldo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    const sueldoNum = parseInt(sueldo.replace(/\D/g, ''), 10);
    if (!nombre.trim() || !email.trim() || password.length < 6 || !sueldoNum) {
      setError('Completa todos los campos. La contraseña debe tener al menos 6 caracteres y el sueldo debe ser mayor a 0.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.registerPersonal({ nombre: nombre.trim(), email: email.trim().toLowerCase(), password, sueldo_mensual: sueldoNum, dia_pago: 1 });
      onRegistered(data);
    } catch (err) {
      const msg = err?.body?.error || err?.message || '';
      if (msg === 'email_en_uso') setError('Este correo ya tiene una cuenta. Inicia sesión.');
      else setError('No se pudo crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-h-screen flex flex-col justify-center gap-4 p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-black" style={{ color: '#C9A24B' }}>Hash IA <span className="text-xs font-normal opacity-50">personal</span></h1>
      <p className="text-sm opacity-70">Crea tu cuenta personal gratis y empieza a controlar tus finanzas.</p>

      <label className="text-sm" htmlFor="rp-nombre">Nombre completo</label>
      <input id="rp-nombre" className="rounded-xl bg-black/10 px-4 py-3 border" value={nombre}
        onChange={(e) => setNombre(e.target.value)} autoCapitalize="words" />

      <label className="text-sm" htmlFor="rp-email">Correo</label>
      <input id="rp-email" type="email" className="rounded-xl bg-black/10 px-4 py-3 border" value={email}
        onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />

      <label className="text-sm" htmlFor="rp-pass">Contraseña (mín. 6 caracteres)</label>
      <input id="rp-pass" type="password" className="rounded-xl bg-black/10 px-4 py-3 border" value={password}
        onChange={(e) => setPassword(e.target.value)} />

      <label className="text-sm" htmlFor="rp-sueldo">Sueldo mensual ($CLP)</label>
      <input id="rp-sueldo" inputMode="numeric" placeholder="Ej: 800000" className="rounded-xl bg-black/10 px-4 py-3 border" value={sueldo}
        onChange={(e) => setSueldo(e.target.value)} />

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
