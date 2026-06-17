import React, { useEffect, useRef } from 'react';

const CY = '#19C3FF', CY_DIM = '#0a6e8c', GOLD = '#C9A24B';
const LABEL = { idle: 'EN ESPERA', listening: 'ESCUCHANDO', speaking: 'HABLANDO', thinking: 'PENSANDO', muted: 'EN SILENCIO' };

export default function Orb({ state = 'idle', level = 0 }) {
  const ref = useRef(null);
  const st = useRef({ rings: [0, 120, 240], scan: 0, scan2: 180, halo: 55, tick: 0, level: 0 });

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let raf;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { const s = cv.clientWidth; cv.width = s * dpr; cv.height = s * dpr; };
    resize(); window.addEventListener('resize', resize);

    const draw = () => {
      const s = st.current; s.tick++;
      const speaking = state === 'speaking', muted = state === 'muted';
      s.level += ((level || 0) - s.level) * 0.25;
      const targetHalo = muted ? 18 : speaking ? 120 + s.level * 90 : 55 + s.level * 40;
      s.halo += (targetHalo - s.halo) * 0.18;
      const sp = speaking ? [1.3, -0.9, 2.0] : [0.55, -0.35, 0.9];
      s.rings = s.rings.map((r, i) => (r + sp[i]) % 360);
      s.scan = (s.scan + (speaking ? 3 : 1.3)) % 360;
      s.scan2 = (s.scan2 - (speaking ? 2 : 0.75) + 360) % 360;

      const W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, fw = Math.min(W, H);
      const col = muted ? '#ff3366' : CY;

      for (let x = 0; x < W; x += 48 * dpr) for (let y = 0; y < H; y += 48 * dpr) { ctx.fillStyle = 'rgba(25,195,255,0.05)'; ctx.fillRect(x, y, 1, 1); }

      const rFace = fw * 0.30;
      for (let i = 0; i < 10; i++) {
        const r = rFace * (1.8 - i * 0.08), a = Math.max(0, s.halo * 0.0035 * (1 - i / 10));
        ctx.beginPath(); ctx.strokeStyle = `rgba(25,195,255,${a})`; ctx.lineWidth = 1.5 * dpr; ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      const rings = [[0.48, 3, 115, 78], [0.40, 2, 78, 55], [0.32, 1, 56, 40]];
      rings.forEach(([rf, w, arc, gap], idx) => {
        const rr = fw * rf, base = s.rings[idx]; ctx.strokeStyle = col; ctx.globalAlpha = Math.min(1, s.halo / 120 * (1 - idx * 0.18)); ctx.lineWidth = w * dpr;
        let ang = base; while (ang < base + 360) { ctx.beginPath(); ctx.arc(cx, cy, rr, ang * Math.PI / 180, (ang + arc) * Math.PI / 180); ctx.stroke(); ang += arc + gap; }
      });
      ctx.globalAlpha = 1;
      const sr = fw * 0.50, ex = speaking ? 75 : 44;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.arc(cx, cy, sr, s.scan * Math.PI / 180, (s.scan + ex) * Math.PI / 180); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(cx, cy, sr, s.scan2 * Math.PI / 180, (s.scan2 + ex) * Math.PI / 180); ctx.stroke(); ctx.globalAlpha = 1;

      const tOut = fw * 0.497, tIn = fw * 0.474; ctx.strokeStyle = 'rgba(25,195,255,0.55)'; ctx.lineWidth = 1 * dpr;
      for (let d = 0; d < 360; d += 10) { const rad = d * Math.PI / 180, inn = d % 30 === 0 ? tIn : tIn + 6 * dpr; ctx.beginPath(); ctx.moveTo(cx + tOut * Math.cos(rad), cy - tOut * Math.sin(rad)); ctx.lineTo(cx + inn * Math.cos(rad), cy - inn * Math.sin(rad)); ctx.stroke(); }

      const chR = fw * 0.51, gapH = fw * 0.16; ctx.strokeStyle = `rgba(25,195,255,${s.halo / 110})`; ctx.lineWidth = 1 * dpr;
      [[-chR, 0, -gapH, 0], [gapH, 0, chR, 0], [0, -chR, 0, -gapH], [0, gapH, 0, chR]].forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(cx + x1, cy + y1); ctx.lineTo(cx + x2, cy + y2); ctx.stroke(); });

      const bl = 24 * dpr, hw = fw / 2; ctx.strokeStyle = 'rgba(25,195,255,0.8)'; ctx.lineWidth = 2 * dpr;
      [[-hw, -hw, 1, 1], [hw, -hw, -1, 1], [-hw, hw, 1, -1], [hw, hw, -1, -1]].forEach(([bx, by, dx, dy]) => { ctx.beginPath(); ctx.moveTo(cx + bx, cy + by); ctx.lineTo(cx + bx + dx * bl, cy + by); ctx.moveTo(cx + bx, cy + by); ctx.lineTo(cx + bx, cy + by + dy * bl); ctx.stroke(); });

      const orbR = fw * 0.20; const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR);
      grd.addColorStop(0, muted ? 'rgba(255,51,102,0.55)' : `rgba(25,195,255,${0.35 + s.level * 0.4})`);
      grd.addColorStop(1, 'rgba(0,20,30,0)'); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = col; ctx.font = `${13 * dpr}px "Share Tech Mono", monospace`; ctx.textAlign = 'center';
      ctx.fillText('KALY', cx, cy + 5 * dpr);
      ctx.fillStyle = col; ctx.font = `${11 * dpr}px "Share Tech Mono", monospace`;
      ctx.fillText('● ' + (LABEL[state] || 'EN ESPERA'), cx, cy + fw * 0.40);
      ctx.fillStyle = 'rgba(25,195,255,0.5)'; ctx.font = `${9 * dpr}px "Share Tech Mono", monospace`;
      ctx.fillText('IA · GEMINI LIVE · ES-CL', cx, cy + fw * 0.40 + 18 * dpr);

      const N = 32, bw = fw * 0.012, wy = cy + fw * 0.46, wx0 = cx - (N * bw) / 2;
      for (let i = 0; i < N; i++) {
        let h; if (muted) h = 2; else if (speaking) h = 3 + Math.random() * (8 + s.level * 26); else h = 3 + 2 * Math.sin(s.tick * 0.09 + i * 0.6);
        ctx.fillStyle = h > 12 ? CY : CY_DIM; ctx.fillRect(wx0 + i * bw, wy - h * dpr, (bw - 1) * dpr, h * dpr);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [state, level]);

  return <canvas ref={ref} aria-label="KALY" style={{ width: '100%', maxWidth: 460, aspectRatio: '1 / 1', display: 'block', margin: '0 auto' }} />;
}
