import React, { useEffect, useState } from 'react';
import { api } from './api';

const GOLD = '#C9A24B';
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

export default function MemoriaKalyView() {
  const [items, setItems] = useState([]);
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo] = useState('negocio');
  const [err, setErr] = useState('');

  async function cargar() { try { setItems(await api.kalyMemorias()); } catch (e) { setErr('No pude cargar la memoria'); } }
  useEffect(() => { cargar(); }, []);

  async function agregar() {
    if (!contenido.trim()) return;
    try { await api.kalyRecordar({ tipo, contenido: contenido.trim() }); setContenido(''); cargar(); }
    catch (e) { setErr('No se pudo guardar'); }
  }
  async function borrar(id) { try { await api.kalyBorrarMemoria(id); cargar(); } catch (e) { setErr('No se pudo borrar'); } }

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ color: GOLD, fontWeight: 900 }}>Memoria de KALY</h2>
      <p style={{ fontSize: 13, opacity: 0.7 }}>Lo que KALY sabe de tu negocio. Puedes añadir o borrar.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
        {items.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, background: '#ffffff10', borderRadius: 10, padding: 10 }}>
            <div><span style={{ color: GOLD, fontSize: 11 }}>{m.tipo}</span><div>{m.contenido}</div></div>
            <button onClick={() => borrar(m.id)} style={{ background: 'transparent', color: '#ff6b6b', border: 0 }}>Borrar</button>
          </div>
        ))}
        {!items.length && <div style={{ opacity: 0.6 }}>Todavía no hay nada. Háblale a KALY o agrega algo aquí.</div>}
      </div>
      <div style={{ background: '#ffffff08', borderRadius: 12, padding: 12 }}>
        <input placeholder="¿Qué quieres que KALY recuerde?" value={contenido} onChange={(e) => setContenido(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ flex: 1, padding: 9, borderRadius: 8 }}>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={agregar} style={{ background: GOLD, color: '#000', fontWeight: 800, borderRadius: 10, padding: '9px 16px', border: 0 }}>Agregar</button>
        </div>
        {err ? <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 8 }}>{err}</div> : null}
      </div>
    </div>
  );
}
