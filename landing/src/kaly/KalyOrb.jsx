import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * K.A.L.Y. — esfera celeste audio-reactiva (idéntica a la de la app).
 * Props: { state, audioLevel, onTap }
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
export default function KalyOrb({ state = 'off', audioLevel = 0, onTap }) {
  const isTest =
    typeof process !== 'undefined' &&
    process.env != null &&
    !!process.env.JEST_WORKER_ID;

  const [tick, setTick] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (isTest) return;
    let t0 = performance.now();
    const loop = () => {
      setTick((performance.now() - t0) / 1000);
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isTest]);

  const speaking = state === 'speaking';
  const listening = state === 'listening' || state === 'live';
  const error = state === 'error';
  const idle = state === 'off';

  let color;
  if (error) color = '#ff5a5a';
  else if (state === 'connecting') color = '#8ec9ff';
  else if (speaking) color = '#7ad6ff';
  else if (listening) color = '#4fc3f7';
  else color = '#5ad7ff';

  const lvl = Math.min(1, audioLevel);

  const wavePath = useMemo(() => {
    let d = '';
    const N = 96;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const wobble =
        Math.sin(a * 5 + tick * 3.5) * 7 + Math.sin(a * 11 + tick * 6) * 5;
      const audio = speaking
        ? (21.6 + lvl * 99) * (1 + Math.sin(a * 4 + tick * 14) * 0.5)
        : listening
          ? (14.4 + lvl * 54) * (1 + Math.sin(a * 3 + tick * 7) * 0.3)
          : 0;
      const r = 80 + wobble * (0.6 + lvl * 0.8) + audio;
      d +=
        (i === 0 ? 'M' : 'L') +
        (150 + Math.cos(a) * r).toFixed(2) +
        ' ' +
        (150 + Math.sin(a) * r).toFixed(2);
    }
    return d + ' Z';
  }, [tick, speaking, listening, lvl]);

  const arcPath = (rad, fromDeg, span) => {
    const a1 = ((fromDeg - 90) * Math.PI) / 180;
    const a2 = ((fromDeg + span - 90) * Math.PI) / 180;
    return `M ${150 + Math.cos(a1) * rad} ${150 + Math.sin(a1) * rad} A ${rad} ${rad} 0 ${span > 180 ? 1 : 0} 1 ${150 + Math.cos(a2) * rad} ${150 + Math.sin(a2) * rad}`;
  };

  const baseOpacity = idle ? 0.5 : 1;
  const breathScale = listening ? 1 + Math.sin(tick * 1.8) * 0.06 : 1;
  const breathOpacity = listening ? 0.18 + Math.abs(Math.sin(tick * 1.8)) * 0.12 : 0;

  return (
    <div
      role="button"
      aria-label="Kaly"
      data-state={state}
      onClick={onTap}
      className="flex flex-col items-center cursor-pointer select-none"
    >
      <div className="relative flex items-center justify-center">
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            width: 190,
            height: 190,
            background: 'radial-gradient(circle, #5ad7ff 0%, #0369a1 70%, transparent 100%)',
            opacity:
              (0.15 + lvl * 0.35 + (speaking ? 0.25 : 0) + breathOpacity) * baseOpacity,
            transform: `scale(${(1 + lvl * 0.45) * breathScale})`,
            transition: 'opacity .25s, transform .1s ease-out',
          }}
        />
        <div
          className="absolute rounded-full blur-2xl"
          style={{
            width: 110,
            height: 110,
            background: 'radial-gradient(circle, #7ad6ff 0%, #0ea5e9 70%, transparent 100%)',
            opacity: (0.28 + lvl * 0.5 + (speaking ? 0.15 : 0)) * baseOpacity,
            transform: `scale(${(1 + lvl * 0.25) * breathScale})`,
            transition: 'transform .1s ease-out',
          }}
        />

        <svg width="260" height="260" viewBox="0 0 300 300" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="kaly-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity=".95" />
              <stop offset="30%" stopColor={color} stopOpacity=".85" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </radialGradient>
            <filter id="kaly-glow">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`rotate(${tick * 18} 150 150)`} filter="url(#kaly-glow)">
            {[[0, 60], [100, 30], [160, 80], [280, 40]].map(([f, s], i) => (
              <path key={i} d={arcPath(140, f, s)} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity={idle ? '.4' : '.85'} />
            ))}
            {Array.from({ length: 36 }).map((_, i) => {
              const a = (i * 10 - 90) * (Math.PI / 180);
              const r1 = 144;
              const r2 = i % 3 === 0 ? 150 : 147;
              return (
                <line key={i} x1={150 + Math.cos(a) * r1} y1={150 + Math.sin(a) * r1} x2={150 + Math.cos(a) * r2} y2={150 + Math.sin(a) * r2} stroke={color} strokeWidth={i % 3 === 0 ? 1.4 : 0.8} opacity={i % 3 === 0 ? (idle ? 0.35 : 0.7) : idle ? 0.18 : 0.35} />
              );
            })}
          </g>

          <g transform={`rotate(${-tick * 32} 150 150)`} filter="url(#kaly-glow)">
            {[[0, 25], [50, 90], [180, 35], [240, 70]].map(([f, s], i) => (
              <path key={i} d={arcPath(128, f, s)} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity={idle ? '.3' : '.7'} />
            ))}
          </g>

          <g opacity={idle ? '.1' : '.22'}>
            {[60, 75, 90, 105].map((r, i) => {
              const pts = [];
              for (let k = 0; k < 6; k++) {
                const a = ((k * 60 + (i % 2 ? 30 : 0)) * Math.PI) / 180;
                pts.push(`${150 + Math.cos(a) * r},${150 + Math.sin(a) * r}`);
              }
              return <polygon key={i} points={pts.join(' ')} stroke={color} strokeWidth=".8" fill="none" />;
            })}
          </g>

          <g filter="url(#kaly-glow)">
            <path d={wavePath} stroke={color} strokeWidth="2" fill={color} fillOpacity={idle ? 0.04 : speaking ? 0.18 + lvl * 0.25 : 0.08} />
          </g>

          {(speaking || listening) &&
            Array.from({ length: 64 }).map((_, i) => {
              const a = (i / 64) * Math.PI * 2;
              const seed = Math.sin(i * 1.3 + tick * 8) * 0.5 + 0.5;
              const h = 30 + seed * (50 + lvl * 100);
              const r1 = 60;
              const r2 = r1 + h * (speaking ? lvl + 0.5 : lvl + 0.3);
              return <line key={i} x1={150 + Math.cos(a) * r1} y1={150 + Math.sin(a) * r1} x2={150 + Math.cos(a) * r2} y2={150 + Math.sin(a) * r2} stroke={color} strokeWidth="1.5" opacity={0.5 + seed * 0.5} strokeLinecap="round" />;
            })}

          <circle cx="150" cy="150" r="50" stroke={color} strokeWidth=".6" fill="none" opacity={idle ? '.2' : '.4'} />
          <circle cx="150" cy="150" r="40" stroke={color} strokeWidth=".6" fill="none" opacity={idle ? '.2' : '.4'} />

          <circle cx="150" cy="150" r={20 + lvl * 12 + (speaking ? Math.sin(tick * 9) * 1.5 : Math.sin(tick * 2) * 0.8)} fill="url(#kaly-core)" filter="url(#kaly-glow)" />
          <circle cx="150" cy="150" r={8 + lvl * 6} fill="#fff" opacity={idle ? 0.35 : 0.7 + lvl * 0.3} />

          <g transform={`rotate(${tick * 90} 150 150)`} opacity={idle ? '.25' : '.5'}>
            <line x1="150" y1="150" x2="150" y2="40" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      <span className="font-black text-xs tracking-widest mt-1" style={{ color: '#38bdf8', letterSpacing: '0.15em' }}>Kaly</span>
    </div>
  );
}
