import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ProactividadToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    let vivo = true;
    api.getAgentPrefs()
      .then((p) => { if (vivo) setOn(p?.proactividad !== false); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  function toggle() {
    const nv = !on;
    setOn(nv);
    api.agentPrefs({ proactividad: nv }).catch(() => {});
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a1a1aa', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={toggle} />
      KALY proactiva (te comenta algo útil al saludar)
    </label>
  );
}
