// K.A.L.Y. — esfera celeste audio-reactiva (clon vanilla de la de hash.atikodigital.cl
// / la app: landing/src/kaly/KalyOrb.jsx). SVG animado por requestAnimationFrame.
// createKalyOrb(el, { size, onTap }) → { setState, setLevel, destroy }
// state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'

function colorFor(state) {
  if (state === 'error') return '#ff5a5a';
  if (state === 'connecting') return '#8ec9ff';
  if (state === 'speaking') return '#7ad6ff';
  if (state === 'listening' || state === 'live') return '#4fc3f7';
  return '#5ad7ff';
}

function arcPath(rad, fromDeg, span) {
  const a1 = ((fromDeg - 90) * Math.PI) / 180;
  const a2 = ((fromDeg + span - 90) * Math.PI) / 180;
  return `M ${(150 + Math.cos(a1) * rad).toFixed(2)} ${(150 + Math.sin(a1) * rad).toFixed(2)} A ${rad} ${rad} 0 ${span > 180 ? 1 : 0} 1 ${(150 + Math.cos(a2) * rad).toFixed(2)} ${(150 + Math.sin(a2) * rad).toFixed(2)}`;
}

function renderSVG(state, tick, lvl) {
  const speaking = state === 'speaking';
  const listening = state === 'listening' || state === 'live';
  const idle = state === 'off';
  const color = colorFor(state);

  // Contorno audio-reactivo (96 puntos)
  let d = ''; const N = 96;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const wobble = Math.sin(a * 5 + tick * 3.5) * 7 + Math.sin(a * 11 + tick * 6) * 5;
    const audio = speaking
      ? (21.6 + lvl * 99) * (1 + Math.sin(a * 4 + tick * 14) * 0.5)
      : listening
        ? (14.4 + lvl * 54) * (1 + Math.sin(a * 3 + tick * 7) * 0.3)
        : 0;
    const r = 80 + wobble * (0.6 + lvl * 0.8) + audio;
    d += (i === 0 ? 'M' : 'L') + (150 + Math.cos(a) * r).toFixed(2) + ' ' + (150 + Math.sin(a) * r).toFixed(2);
  }
  d += ' Z';

  // Grupo rotatorio externo
  let g1 = `<g transform="rotate(${(tick * 18).toFixed(2)} 150 150)" filter="url(#korb-glow)">`;
  [[0, 60], [100, 30], [160, 80], [280, 40]].forEach(([f, s]) => {
    g1 += `<path d="${arcPath(140, f, s)}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="${idle ? '.4' : '.85'}"/>`;
  });
  for (let i = 0; i < 36; i++) {
    const a = (i * 10 - 90) * (Math.PI / 180);
    const r1 = 144; const r2 = i % 3 === 0 ? 150 : 147;
    g1 += `<line x1="${(150 + Math.cos(a) * r1).toFixed(2)}" y1="${(150 + Math.sin(a) * r1).toFixed(2)}" x2="${(150 + Math.cos(a) * r2).toFixed(2)}" y2="${(150 + Math.sin(a) * r2).toFixed(2)}" stroke="${color}" stroke-width="${i % 3 === 0 ? 1.4 : 0.8}" opacity="${i % 3 === 0 ? (idle ? 0.35 : 0.7) : (idle ? 0.18 : 0.35)}"/>`;
  }
  g1 += '</g>';

  // Grupo rotatorio interno (sentido opuesto)
  let g2 = `<g transform="rotate(${(-tick * 32).toFixed(2)} 150 150)" filter="url(#korb-glow)">`;
  [[0, 25], [50, 90], [180, 35], [240, 70]].forEach(([f, s]) => {
    g2 += `<path d="${arcPath(128, f, s)}" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="${idle ? '.3' : '.7'}"/>`;
  });
  g2 += '</g>';

  // Hexágonos concéntricos
  let g3 = `<g opacity="${idle ? '.1' : '.22'}">`;
  [60, 75, 90, 105].forEach((r, i) => {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 + (i % 2 ? 30 : 0)) * Math.PI) / 180;
      pts.push(`${(150 + Math.cos(a) * r).toFixed(2)},${(150 + Math.sin(a) * r).toFixed(2)}`);
    }
    g3 += `<polygon points="${pts.join(' ')}" stroke="${color}" stroke-width=".8" fill="none"/>`;
  });
  g3 += '</g>';

  // Contorno
  const wave = `<g filter="url(#korb-glow)"><path d="${d}" stroke="${color}" stroke-width="2" fill="${color}" fill-opacity="${idle ? 0.04 : speaking ? (0.18 + lvl * 0.25).toFixed(3) : 0.08}"/></g>`;

  // Barras de frecuencia (hablando/escuchando)
  let bars = '';
  if (speaking || listening) {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const seed = Math.sin(i * 1.3 + tick * 8) * 0.5 + 0.5;
      const h = 30 + seed * (50 + lvl * 100);
      const r1 = 60; const r2 = r1 + h * (speaking ? lvl + 0.5 : lvl + 0.3);
      bars += `<line x1="${(150 + Math.cos(a) * r1).toFixed(2)}" y1="${(150 + Math.sin(a) * r1).toFixed(2)}" x2="${(150 + Math.cos(a) * r2).toFixed(2)}" y2="${(150 + Math.sin(a) * r2).toFixed(2)}" stroke="${color}" stroke-width="1.5" opacity="${(0.5 + seed * 0.5).toFixed(3)}" stroke-linecap="round"/>`;
    }
  }

  const rings = `<circle cx="150" cy="150" r="50" stroke="${color}" stroke-width=".6" fill="none" opacity="${idle ? '.2' : '.4'}"/><circle cx="150" cy="150" r="40" stroke="${color}" stroke-width=".6" fill="none" opacity="${idle ? '.2' : '.4'}"/>`;

  const coreR = (20 + lvl * 12 + (speaking ? Math.sin(tick * 9) * 1.5 : Math.sin(tick * 2) * 0.8)).toFixed(2);
  const core = `<circle cx="150" cy="150" r="${coreR}" fill="url(#korb-core)" filter="url(#korb-glow)"/><circle cx="150" cy="150" r="${(8 + lvl * 6).toFixed(2)}" fill="#fff" opacity="${idle ? 0.35 : (0.7 + lvl * 0.3).toFixed(3)}"/>`;

  const sweep = `<g transform="rotate(${(tick * 90).toFixed(2)} 150 150)" opacity="${idle ? '.25' : '.5'}"><line x1="150" y1="150" x2="150" y2="40" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></g>`;

  const defs = `<defs>
    <radialGradient id="korb-core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".95"/>
      <stop offset="30%" stop-color="${color}" stop-opacity=".85"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="korb-glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  return defs + g1 + g2 + g3 + wave + bars + rings + core + sweep;
}

export function createKalyOrb(el, { size = 150, onTap } = {}) {
  const base = 260; const scale = size / base;
  const h1 = Math.round(190 * scale), h2 = Math.round(110 * scale);
  const b1 = Math.round(40 * scale), b2 = Math.round(26 * scale);
  el.innerHTML = `
    <div class="korb-wrap" style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none">
      <div class="korb-h1" style="position:absolute;border-radius:50%;filter:blur(${b1}px);width:${h1}px;height:${h1}px;background:radial-gradient(circle,#5ad7ff 0%,#0369a1 70%,transparent 100%);transition:opacity .25s,transform .1s ease-out"></div>
      <div class="korb-h2" style="position:absolute;border-radius:50%;filter:blur(${b2}px);width:${h2}px;height:${h2}px;background:radial-gradient(circle,#7ad6ff 0%,#0ea5e9 70%,transparent 100%);transition:transform .1s ease-out"></div>
      <svg class="korb-svg" width="${size}" height="${size}" viewBox="0 0 300 300" style="overflow:visible;position:relative;z-index:1"></svg>
    </div>`;
  const wrap = el.querySelector('.korb-wrap');
  const svg = el.querySelector('.korb-svg');
  const halo1 = el.querySelector('.korb-h1');
  const halo2 = el.querySelector('.korb-h2');
  if (onTap) wrap.onclick = onTap;

  let state = 'off'; let level = 0; let smooth = 0; let raf = null; let t0 = null; let lastDraw = 0;

  function frame(ts) {
    if (t0 == null) t0 = ts;
    const tick = (ts - t0) / 1000;
    smooth += (level - smooth) * 0.25;
    if (ts - lastDraw >= 32) { // ~30fps: suficiente y liviano
      lastDraw = ts;
      const lvl = Math.min(1, smooth);
      const speaking = state === 'speaking';
      const listening = state === 'listening' || state === 'live';
      const idle = state === 'off';
      const baseOp = idle ? 0.5 : 1;
      const breathScale = listening ? 1 + Math.sin(tick * 1.8) * 0.06 : 1;
      const breathOp = listening ? 0.18 + Math.abs(Math.sin(tick * 1.8)) * 0.12 : 0;
      halo1.style.opacity = ((0.15 + lvl * 0.35 + (speaking ? 0.25 : 0) + breathOp) * baseOp).toFixed(3);
      halo1.style.transform = `scale(${((1 + lvl * 0.45) * breathScale).toFixed(3)})`;
      halo2.style.opacity = ((0.28 + lvl * 0.5 + (speaking ? 0.15 : 0)) * baseOp).toFixed(3);
      halo2.style.transform = `scale(${((1 + lvl * 0.25) * breathScale).toFixed(3)})`;
      svg.innerHTML = renderSVG(state, tick, lvl);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setState(s) { state = s || 'off'; },
    setLevel(v) { level = Math.max(0, Math.min(1, v || 0)); },
    destroy() { if (raf != null) cancelAnimationFrame(raf); },
  };
}
