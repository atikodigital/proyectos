import { useState, useEffect } from 'react';
import { api } from './api';
import { t } from './i18n';

function fmt(n) {
  if (n == null) return '$0';
  return '$' + Number(n).toLocaleString('es-CL');
}

export default function BalanceCard() {
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    api.personalResumen().then(setResumen).catch(() => {});
  }, []);

  if (!resumen) return null;

  const pct = Math.min(100, Math.round(resumen.porcentaje_gastado || 0));
  const disponibleNeg = (resumen.disponible ?? 0) < 0;

  return (
    <div style={{
      margin: '8px 0 4px',
      background: 'linear-gradient(135deg,#0b2a18,#0f3a20)',
      borderRadius: 12,
      padding: 14,
      border: '1px solid #1a4a28',
    }}>
      <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
        {t('exp.balance.te_quedan')}
      </div>
      <div style={{ color: disponibleNeg ? '#ff6b6b' : '#7CFC9B', fontSize: 26, fontWeight: 900, marginBottom: 2 }}>
        {fmt(resumen.disponible)}
      </div>
      <div style={{ color: '#666', fontSize: 10, marginBottom: 8 }}>
        {t('exp.balance.de')} {fmt(resumen.sueldo_mensual)} · {t('exp.balance.gaste')} {fmt(resumen.gastado_mes)}
      </div>
      <div style={{ height: 5, background: '#0d1f14', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#E7C46B,#c8962a)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: 9, marginBottom: resumen.categorias?.length ? 10 : 0 }}>
        <span>{pct}% {t('exp.balance.gastado')}</span>
        <span>{resumen.dias_restantes_mes} {t('exp.balance.dias_restantes')}</span>
      </div>
      {resumen.categorias && resumen.categorias.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {resumen.categorias.slice(0, 3).map((c) => (
            <div key={c.nombre} style={{ flex: 1, background: '#0a1f10', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ color: '#888', fontSize: 9 }}>{c.nombre}</div>
              <div style={{ color: '#E7C46B', fontSize: 11, fontWeight: 700 }}>
                {c.total >= 1000 ? `$${Math.round(c.total / 1000)}k` : fmt(c.total)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
