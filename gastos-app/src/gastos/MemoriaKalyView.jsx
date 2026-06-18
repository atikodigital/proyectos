import React, { useEffect, useState } from 'react';
import { api } from './api';

const GOLD = '#C9A24B';
const DARK_BORDER = 'rgba(255, 255, 255, 0.08)';
const TIPOS = ['negocio', 'dueño', 'preferencia', 'hecho'];

const TIPO_COLORS = {
  negocio: { bg: 'rgba(201, 162, 75, 0.12)', text: '#C9A24B' },
  dueño: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10B981' },
  preferencia: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3B82F6' },
  hecho: { bg: 'rgba(139, 92, 246, 0.12)', text: '#8B5CF6' }
};

export default function MemoriaKalyView() {
  const [items, setItems] = useState([]);
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo] = useState('negocio');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setItems(await api.kalyMemorias());
    } catch (e) {
      setErr('No pude cargar la memoria');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function agregar() {
    if (!contenido.trim()) return;
    setErr('');
    try {
      await api.kalyRecordar({ tipo, contenido: contenido.trim() });
      setContenido('');
      cargar();
    } catch (e) {
      setErr('No se pudo guardar');
    }
  }

  async function borrar(id) {
    setErr('');
    try {
      await api.kalyBorrarMemoria(id);
      cargar();
    } catch (e) {
      setErr('No se pudo borrar');
    }
  }

  return (
    <div style={{
      padding: '24px 16px',
      maxWidth: '680px',
      margin: '0 auto',
      fontFamily: "'Inter', sans-serif",
      color: '#f4f4f5',
    }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          color: GOLD,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 900,
          fontSize: '28px',
          margin: '0 0 8px 0',
          background: 'linear-gradient(135deg, #f0e2bf 0%, #C9A24B 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em'
        }}>
          Memoria de KALY
        </h2>
        <p style={{ fontSize: '14px', color: '#a1a1aa', margin: 0 }}>
          La base de conocimiento de tu asistente de ventas. Lo que KALY recuerde guiará sus respuestas con los clientes.
        </p>
      </div>

      {/* Formulario de Adición */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${DARK_BORDER}`,
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '24px',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
      }}>
        <h4 style={{
          margin: '0 0 12px 0',
          fontSize: '12px',
          fontWeight: 600,
          color: '#a1a1aa',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Agregar nuevo hecho
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <textarea
            placeholder="Ej: Aceptamos transferencias y tarjetas. Despachamos solo los viernes."
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${DARK_BORDER}`,
              color: '#f4f4f5',
              fontSize: '14px',
              fontFamily: "'Inter', sans-serif",
              resize: 'none',
              transition: 'all 0.2s',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${DARK_BORDER}`,
                  color: '#f4f4f5',
                  fontSize: '14px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t} style={{ background: '#121215' }}>
                    Tipo: {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={agregar}
              style={{
                background: GOLD,
                color: '#000',
                fontWeight: 700,
                borderRadius: '12px',
                padding: '10px 20px',
                border: 0,
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              Guardar Hecho
            </button>
          </div>
        </div>
        {err && (
          <div style={{
            color: '#ef4444',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            marginTop: '12px',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            {err}
          </div>
        )}
      </div>

      {/* Lista de Hechos en Memoria */}
      <h3 style={{
        color: GOLD,
        fontFamily: "'Outfit', sans-serif",
        fontSize: '16px',
        fontWeight: 700,
        margin: '0 0 12px 0'
      }}>
        Hechos aprendidos ({items.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {cargando ? (
          <div style={{ color: '#a1a1aa', textAlign: 'center', padding: '24px' }}>Cargando memoria...</div>
        ) : items.map((m) => {
          const colInfo = TIPO_COLORS[m.tipo] || { bg: 'rgba(255,255,255,0.08)', text: '#a1a1aa' };
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${DARK_BORDER}`,
                borderRadius: '12px',
                padding: '14px',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{
                  display: 'inline-block',
                  background: colInfo.bg,
                  color: colInfo.text,
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px'
                }}>
                  {m.tipo}
                </span>
                <div style={{ fontSize: '14px', lineHeight: '1.5', color: '#e4e4e7' }}>{m.contenido}</div>
              </div>
              <button
                onClick={() => borrar(m.id)}
                style={{
                  background: 'transparent',
                  color: '#ef4444',
                  border: 0,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'background 0.2s'
                }}
              >
                Eliminar
              </button>
            </div>
          );
        })}

        {!cargando && !items.length && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'rgba(255, 255, 255, 0.01)',
            border: `1px dashed ${DARK_BORDER}`,
            borderRadius: '12px',
            color: '#71717a',
            fontSize: '14px'
          }}>
            KALY aún no tiene hechos en su memoria. ¡Agrega el primero arriba!
          </div>
        )}
      </div>
    </div>
  );
}
