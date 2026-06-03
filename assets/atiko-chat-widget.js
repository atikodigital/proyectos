/* ═══════════════════════════════════════════════════════════════
   ATIKO · KAI Widget — J.A.R.V.I.S. + Energy Arcs + Voice
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const _base = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://agent.atikodigital.cl';
  const CONFIG = {
    apiUrl:       `${_base}/api/chat`,
    ttsUrl:       `${_base}/api/chat/tts`,
    ttsStreamUrl: `${_base}/api/chat/tts/stream`,
    showAfterMs: 1800,
    sttLang: 'es-CL',
    ttsLang: 'es-CL',
  };

  if (document.getElementById('atiko-kai-root')) return;

  let sessionId = null, isOpen = false, isTyping = false;
  let isListening = false, isSpeaking = false;
  let sphereState = 'idle'; // idle | listening | thinking | speaking
  try { sessionId = sessionStorage.getItem('atiko_session') || null; } catch(e){}

  /* ── Google Fonts ── */
  if (!document.querySelector('link[href*="Orbitron"]')) {
    const lnk = document.createElement('link');
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(lnk);
  }

  /* ── CSS ── */
  const css = document.createElement('style');
  css.textContent = `
    #atiko-kai-root {
      position:fixed; bottom:24px; right:24px; z-index:99999;
      display:flex; flex-direction:column; align-items:flex-end; gap:12px;
    }
    #atiko-kai-win {
      width:360px; height:min(590px, calc(100vh - 110px));
      background:linear-gradient(180deg,#03060f 0%,#050d1a 65%,#030810 100%);
      border:1px solid rgba(0,180,255,.22);
      box-shadow:0 0 60px rgba(0,150,255,.1),inset 0 0 60px rgba(0,80,180,.04);
      display:flex; flex-direction:column;
      transform-origin:bottom right;
      transform:scale(.9) translateY(16px); opacity:0; pointer-events:none;
      transition:transform .35s cubic-bezier(.34,1.4,.64,1),opacity .25s;
      overflow:hidden; position:relative; border-radius:2px;
      font-family:'Share Tech Mono',monospace;
    }
    #atiko-kai-win.open { transform:scale(1) translateY(0); opacity:1; pointer-events:all; }
    #atiko-kai-win::after {
      content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
      background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,100,200,.012) 4px);
    }
    /* HEADER */
    #atiko-kai-hdr {
      flex-shrink:0; z-index:5; position:relative;
      background:rgba(2,8,20,.95); border-bottom:1px solid rgba(0,180,255,.18);
      padding:10px 14px; display:flex; align-items:center; justify-content:space-between;
    }
    .kai-hdr-left { display:flex; align-items:center; gap:8px; }
    .kai-status-dot {
      width:7px; height:7px; border-radius:50%;
      background:#00c8ff; box-shadow:0 0 8px #00c8ff,0 0 16px rgba(0,200,255,.4);
      animation:kai-pulse 2.5s ease-in-out infinite; flex-shrink:0;
    }
    @keyframes kai-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.75)}}
    .kai-title {
      font-family:'Orbitron',monospace; font-size:12px; font-weight:700;
      letter-spacing:.28em; color:#00c8ff;
      text-shadow:0 0 12px rgba(0,200,255,.7);
    }
    .kai-hdr-btns { display:flex; align-items:center; gap:6px; }
    .kai-hdr-btn {
      width:28px; height:28px; border:1px solid rgba(0,180,255,.2);
      background:transparent; color:rgba(0,200,255,.5);
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:all .2s; border-radius:2px;
    }
    .kai-hdr-btn:hover{border-color:rgba(0,200,255,.6);color:#00c8ff;box-shadow:0 0 8px rgba(0,200,255,.2);}
    #atiko-kai-close:hover{border-color:#ff4444;color:#ff4444;box-shadow:0 0 8px rgba(255,68,68,.3);}
    #atiko-kai-tts.muted{color:rgba(0,200,255,.2);}
    /* ORB */
    #atiko-kai-orb-area {
      flex-shrink:0; z-index:2; position:relative;
      display:flex; flex-direction:column; align-items:center;
      padding:14px 0 8px;
      background:linear-gradient(180deg,rgba(0,30,80,.3) 0%,transparent 100%);
      border-bottom:1px solid rgba(0,180,255,.1);
    }
    #atiko-kai-canvas-orb { display:block; }
    .kai-orb-label {
      font-family:'Orbitron',monospace; font-size:7.5px;
      letter-spacing:.3em; color:rgba(0,200,255,.35); margin-top:5px;
    }
    /* MSGS */
    #atiko-kai-msgs {
      flex:1; overflow-y:auto; padding:12px 14px 8px;
      display:flex; flex-direction:column; gap:12px;
      position:relative; z-index:2;
      scrollbar-width:thin; scrollbar-color:rgba(0,180,255,.2) transparent;
    }
    #atiko-kai-msgs::-webkit-scrollbar{width:3px;}
    #atiko-kai-msgs::-webkit-scrollbar-thumb{background:rgba(0,180,255,.2);}
    .kai-msg-bot-wrap{display:flex;flex-direction:column;gap:3px;}
    .kai-msg-label{font-size:8px;letter-spacing:.22em;color:rgba(0,200,255,.4);padding-left:2px;}
    .kai-msg-bot-bubble {
      background:rgba(0,20,60,.65); border:1px solid rgba(0,180,255,.2);
      border-left:2px solid rgba(0,200,255,.65); border-radius:0 8px 8px 8px;
      padding:9px 13px; font-size:12.5px; line-height:1.65; color:#c8e8ff;
      white-space:pre-wrap; word-break:break-word;
    }
    .kai-msg-user-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
    .kai-msg-label-usr{font-size:8px;letter-spacing:.22em;color:rgba(0,200,255,.3);padding-right:2px;}
    .kai-msg-user-bubble {
      background:rgba(0,40,100,.5); border:1px solid rgba(0,180,255,.25);
      border-right:2px solid rgba(0,200,255,.55); border-radius:8px 0 8px 8px;
      padding:9px 13px; font-size:12.5px; line-height:1.65; color:#d8eeff;
      max-width:88%; white-space:pre-wrap; word-break:break-word;
    }
    #atiko-kai-typing{display:flex;flex-direction:column;gap:3px;}
    .kai-typing-inner {
      display:flex; align-items:center; gap:10px;
      background:rgba(0,20,60,.65); border:1px solid rgba(0,180,255,.2);
      border-left:2px solid rgba(0,200,255,.65); border-radius:0 8px 8px 8px; padding:9px 14px;
    }
    .kai-typing-bars{display:flex;gap:3px;align-items:flex-end;}
    .kai-typing-bars span{width:3px;background:#00c8ff;border-radius:2px;animation:kai-bar 1s ease-in-out infinite;}
    .kai-typing-bars span:nth-child(1){height:6px;animation-delay:0s}
    .kai-typing-bars span:nth-child(2){height:12px;animation-delay:.15s}
    .kai-typing-bars span:nth-child(3){height:8px;animation-delay:.3s}
    .kai-typing-bars span:nth-child(4){height:14px;animation-delay:.45s}
    .kai-typing-bars span:nth-child(5){height:6px;animation-delay:.6s}
    @keyframes kai-bar{0%,100%{opacity:.3;transform:scaleY(.5)}50%{opacity:1;transform:scaleY(1)}}
    .kai-typing-text{font-size:9px;letter-spacing:.2em;color:rgba(0,200,255,.4);}
    /* FOOTER */
    #atiko-kai-foot {
      flex-shrink:0; z-index:5; position:relative;
      background:rgba(2,8,20,.96); border-top:1px solid rgba(0,180,255,.14);
      padding:10px 12px 12px;
    }
    #atiko-kai-input-row{display:flex;align-items:flex-end;gap:7px;}
    #atiko-kai-mic {
      width:36px; height:36px; flex-shrink:0;
      background:rgba(0,40,100,.3); border:1px solid rgba(0,180,255,.3);
      border-radius:50%; color:rgba(0,200,255,.6); cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:all .25s;
    }
    #atiko-kai-mic:hover{background:rgba(0,80,180,.4);color:#00c8ff;box-shadow:0 0 12px rgba(0,200,255,.2);}
    #atiko-kai-mic.listening{
      background:rgba(255,50,50,.2);border-color:rgba(255,100,100,.6);
      color:#ff6060;animation:kai-mic-pulse 0.9s ease-in-out infinite;
    }
    @keyframes kai-mic-pulse{0%,100%{box-shadow:0 0 10px rgba(255,60,60,.3)}50%{box-shadow:0 0 22px rgba(255,60,60,.6)}}
    #atiko-kai-input {
      flex:1; background:rgba(0,20,60,.4);
      border:1px solid rgba(0,180,255,.2); border-bottom:1px solid rgba(0,200,255,.4);
      border-radius:18px; color:#c8e8ff;
      font-family:'Share Tech Mono',monospace; font-size:12px;
      padding:8px 14px; resize:none; outline:none;
      min-height:36px; max-height:80px; line-height:1.5; transition:border-color .2s;
    }
    #atiko-kai-input::placeholder{color:rgba(0,200,255,.25);font-size:11px;}
    #atiko-kai-input:focus{border-color:rgba(0,200,255,.4);box-shadow:0 0 0 1px rgba(0,200,255,.07);}
    #atiko-kai-send {
      width:36px; height:36px; flex-shrink:0;
      background:rgba(0,100,200,.25); border:1px solid rgba(0,180,255,.35);
      border-radius:50%; color:#00c8ff; cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:all .2s;
    }
    #atiko-kai-send:hover:not(:disabled){background:rgba(0,150,255,.35);box-shadow:0 0 16px rgba(0,200,255,.35);}
    #atiko-kai-send:disabled{opacity:.3;cursor:not-allowed;}
    .kai-foot-meta{
      display:flex;justify-content:space-between;margin-top:6px;
      font-size:8px;letter-spacing:.14em;color:rgba(0,200,255,.2);
    }
    .kai-foot-meta a{color:rgba(0,200,255,.3);text-decoration:none;transition:color .2s;}
    .kai-foot-meta a:hover{color:#00c8ff;}
    /* BUBBLE */
    #atiko-kai-bubble {
      background:rgba(3,8,20,.95); border:1px solid rgba(0,180,255,.3);
      border-left:2px solid #00c8ff; border-radius:0 8px 8px 8px;
      padding:9px 14px; max-width:220px;
      opacity:0; transform:translateY(8px); transition:all .3s ease;
      pointer-events:none; cursor:pointer; box-shadow:0 0 24px rgba(0,150,255,.12);
    }
    #atiko-kai-bubble.show{opacity:1;transform:translateY(0);pointer-events:all;}
    .kai-bbl-label{font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:.25em;color:rgba(0,200,255,.45);display:block;margin-bottom:3px;}
    .kai-bbl-text{font-family:'Orbitron',monospace;font-size:10px;color:#a0d4ff;line-height:1.4;}
    /* FAB — estilo original */
    #atiko-kai-fab {
      width:58px; height:58px; cursor:pointer; position:relative;
      display:flex; align-items:center; justify-content:center;
      background:#04080d; border:1px solid rgba(90,215,255,.35);
      box-shadow:0 0 18px rgba(90,215,255,.15),0 4px 20px rgba(0,0,0,.8);
      transition:box-shadow .3s;
    }
    #atiko-kai-fab:hover{box-shadow:0 0 28px rgba(90,215,255,.3),0 4px 20px rgba(0,0,0,.8);}
    #atiko-kai-canvas-fab{display:block;border-radius:50%;}
    #atiko-kai-badge{
      position:absolute;top:2px;right:2px;width:10px;height:10px;
      background:#ff6b35;border:1px solid #04080d;border-radius:50%;
      box-shadow:0 0 8px rgba(255,107,53,.7);display:none;
    }
    #atiko-kai-badge.show{display:block;}
    @media(max-width:420px){
      #atiko-kai-win{width:calc(100vw - 24px);}
      #atiko-kai-root{right:12px;bottom:16px;}
    }
  `;
  document.head.appendChild(css);

  /* ── HTML ── */
  const root = document.createElement('div');
  root.id = 'atiko-kai-root';
  root.innerHTML = `
    <div id="atiko-kai-win">
      <div id="atiko-kai-hdr">
        <div class="kai-hdr-left">
          <div class="kai-status-dot"></div>
          <span class="kai-title">K A I</span>
        </div>
        <div class="kai-hdr-btns">
          <button class="kai-hdr-btn" id="atiko-kai-tts" title="Voz on/off">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 5h2l3-3v10L4 9H2V5z" stroke="currentColor" stroke-width="1.2"/>
              <path d="M10 4.5a3 3 0 010 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="kai-hdr-btn" id="atiko-kai-clear" title="Limpiar">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M5 3V2h2v1M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="kai-hdr-btn" id="atiko-kai-close">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5"/>
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="atiko-kai-orb-area">
        <canvas id="atiko-kai-canvas-orb" width="180" height="180"></canvas>
        <span class="kai-orb-label">KAI · ATIKO DIGITAL · ONLINE</span>
      </div>
      <div id="atiko-kai-msgs"></div>
      <div id="atiko-kai-foot">
        <div id="atiko-kai-input-row">
          <button id="atiko-kai-mic" title="Hablar">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="4.5" y="1" width="5" height="7" rx="2.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M2 7a5 5 0 0010 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <line x1="7" y1="12" x2="7" y2="14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>
          <textarea id="atiko-kai-input" rows="1" placeholder="Consulta..."></textarea>
          <button id="atiko-kai-send">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M14 8L2 2l2.5 6L2 14l12-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="kai-foot-meta">
          <span>ATIKO DIGITAL v1.0</span>
          <a href="https://wa.me/56927130792?text=Hola%20Atiko" target="_blank">WA +56 9 2713 0792</a>
        </div>
      </div>
    </div>
    <div id="atiko-kai-bubble">
      <span class="kai-bbl-label">// KAI ONLINE</span>
      <div class="kai-bbl-text">IA activa — ¿en qué te ayudo?</div>
    </div>
    <div id="atiko-kai-fab">
      <canvas id="atiko-kai-canvas-fab" width="58" height="58"></canvas>
      <div id="atiko-kai-badge"></div>
    </div>
  `;
  document.body.appendChild(root);

  /* ══════════════════════════════════════════════════════
     CANVAS — J.A.R.V.I.S. HUD (grid · rings · scanner · particles · waveform)
  ══════════════════════════════════════════════════════ */

  // Particle + pulse state (module-level, updated each frame in drawOrb)
  let jParticles = [];

  /* ── FAB (58×58) ─── minimal JARVIS orb ── */
  function drawFab(canvas, t, state) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;
    const isSpeaking = state === 'speaking';
    const isListening = state === 'listening';
    const isThinking  = state === 'thinking';
    const sc = W / 280;
    const pri = isSpeaking ? '#00d4ff' : isListening ? '#00ff88' : isThinking ? '#ffcc00' : '#00d4ff';
    const priRgb = isSpeaking ? '0,212,255' : isListening ? '0,255,136' : isThinking ? '255,204,0' : '0,212,255';
    const lvl = isSpeaking ? 0.55+Math.sin(t*5)*0.15 : isListening ? 0.4+Math.sin(t*7)*0.15 : isThinking ? 0.3+Math.sin(t*4)*0.12 : 0.12+Math.sin(t*1.8)*0.05;

    ctx.clearRect(0, 0, W, H);

    // Halo glow
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, W*0.48);
    grd.addColorStop(0, `rgba(${priRgb},${0.1+lvl*0.2})`);
    grd.addColorStop(0.6, `rgba(${priRgb},${0.02+lvl*0.05})`);
    grd.addColorStop(1, `rgba(${priRgb},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, W*0.48, 0, Math.PI*2); ctx.fill();

    // Spinning arc rings
    [[t*0.314, W*0.46, [[0,60],[100,30],[160,80],[280,40]], 0.7, 1.5],
     [-t*0.559, W*0.40, [[0,25],[50,90],[180,35],[240,70]], 0.5, 1.1]
    ].forEach(([angle, r, segs, alpha, lw]) => {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(angle); ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha;
      segs.forEach(([f, s]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r*sc*4, (f-90)*Math.PI/180, (f+s-90)*Math.PI/180);
        ctx.strokeStyle = pri; ctx.lineWidth = lw*sc*4; ctx.stroke();
      });
      ctx.globalAlpha = 1; ctx.restore();
    });

    // Waveform ring
    ctx.globalAlpha = 0.8; ctx.beginPath();
    for (let i = 0; i < 64; i++) {
      const a = (i/64)*Math.PI*2 - Math.PI/2;
      const w = Math.sin(a*5+t*3)*4 + Math.sin(a*11+t*5)*2.5;
      const r = W*0.26 + w*(0.6+lvl*0.6)*sc*4;
      const x = cx + Math.cos(a)*r, y = cy + Math.sin(a)*r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = pri; ctx.lineWidth = 1.8*sc*4;
    ctx.fillStyle = `rgba(${priRgb},0.06)`; ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;

    // Scanner line
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t*1.571); ctx.translate(-cx, -cy);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - W*0.46);
    ctx.strokeStyle = pri; ctx.lineWidth = 1.5*sc*4; ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();

    // Core orb
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W*0.13);
    cg.addColorStop(0, '#fff'); cg.addColorStop(0.3, pri); cg.addColorStop(1, `rgba(${priRgb},0)`);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, W*0.13, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(cx, cy, W*0.04 + lvl*W*0.025, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ── ORB grande (180×180) — JARVIS HUD completo ── */
  function drawOrb(canvas, t, state) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;
    const R  = Math.min(W, H) * 0.44;
    const spk = state === 'speaking';
    const lst = state === 'listening';
    const thk = state === 'thinking';
    const PRI = '#00d4ff', ORG = '#ff6b00', YEL = '#ffcc00', GRN = '#00ff88';

    ctx.clearRect(0, 0, W, H);

    // ── 1. Fondo ─────────────────────────────────────────
    ctx.fillStyle = '#000a0f'; ctx.fillRect(0, 0, W, H);

    // ── 2. Grid de puntos (más visible) ──────────────────
    for (let x = 6; x < W; x += 9) {
      for (let y = 6; y < H; y += 9) {
        const d = Math.hypot(x-cx, y-cy);
        const a = d < R ? 0.14 : 0.055;
        ctx.fillStyle = `rgba(0,212,255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI*2); ctx.fill();
      }
    }

    // ── 3. Anillo externo sólido ─────────────────────────
    ctx.beginPath(); ctx.arc(cx, cy, R*0.97, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 1.8; ctx.stroke();

    // ── 4. Halo (6 círculos concéntricos) ────────────────
    const haloI = spk ? 0.6 : lst ? 0.45 : thk ? 0.35 : 0.15;
    const halo  = haloI + Math.sin(t*(spk?5:lst?7:1.5))*0.1;
    [0.75, 0.63, 0.51, 0.41, 0.33, 0.26].forEach((rf, i) => {
      const a = halo * (1 - i/6) * 0.35;
      ctx.beginPath(); ctx.arc(cx, cy, R*rf, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(0,212,255,${a})`; ctx.lineWidth = 1; ctx.stroke();
    });

    // ── 5. Pulse rings ────────────────────────────────────
    const pSpd = spk ? 55 : lst ? 40 : 20;
    for (let i = 0; i < 3; i++) {
      const r = ((t*pSpd + i*(R/3)*1.1) % (R*1.12));
      if (r < 1) continue;
      const a = (1 - r/(R*1.12)) * (spk ? 0.45 : 0.18);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(0,212,255,${a})`; ctx.lineWidth = 1; ctx.stroke();
    }

    // ── 6. Arcos giratorios (3 anillos, líneas gruesas) ──
    const aSpeeds = spk ? [1.8,-1.2,2.5] : [0.6,-0.4,1.0];
    [
      { r:R*0.91, segs:[[0,55],[90,35],[160,75],[270,45]], alpha:0.88, lw:2.5 },
      { r:R*0.76, segs:[[0,30],[60,80],[175,42],[245,65]], alpha:0.65, lw:2.0 },
      { r:R*0.60, segs:[[15,45],[95,55],[195,35],[305,50]], alpha:0.42, lw:1.4 },
    ].forEach((def, ri) => {
      ctx.save();
      ctx.translate(cx,cy); ctx.rotate(t*aSpeeds[ri]*0.314); ctx.translate(-cx,-cy);
      ctx.globalAlpha = def.alpha;
      def.segs.forEach(([f,s]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, def.r, (f-90)*Math.PI/180, (f+s-90)*Math.PI/180);
        ctx.strokeStyle = (ri===1&&thk) ? YEL : PRI;
        ctx.lineWidth = def.lw; ctx.stroke();
      });
      ctx.globalAlpha = 1; ctx.restore();
    });

    // ── 7. Tick marks (60 marcas, 3 tamaños) ─────────────
    ctx.save(); ctx.translate(cx, cy);
    for (let i = 0; i < 60; i++) {
      const ang = (i/60)*Math.PI*2 - Math.PI/2;
      const maj = i%15===0, med = i%5===0;
      const r1 = R * (maj ? 0.80 : med ? 0.87 : 0.92);
      const r2 = R * 0.97;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang)*r1, Math.sin(ang)*r1);
      ctx.lineTo(Math.cos(ang)*r2, Math.sin(ang)*r2);
      ctx.strokeStyle = maj ? 'rgba(0,212,255,0.85)' : med ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.15)';
      ctx.lineWidth = maj ? 2 : med ? 1 : 0.5; ctx.stroke();
    }
    ctx.restore();

    // ── 8. Scanner primario (cyan, con barrido) ───────────
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*1.571); ctx.translate(-cx,-cy);
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R*0.93);
    ctx.strokeStyle = PRI; ctx.lineWidth = 2; ctx.stroke();
    // rastro de barrido
    const sweep = ctx.createConicalGradient ? null : (() => {
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R*0.93);
      sg.addColorStop(0, 'rgba(0,212,255,0.08)');
      sg.addColorStop(1, 'rgba(0,212,255,0)');
      return sg;
    })();
    if (sweep) { ctx.fillStyle = sweep; ctx.beginPath(); ctx.arc(cx,cy,R*0.93,(-Math.PI/2)-0.4,-Math.PI/2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.restore();

    // Scanner secundario (naranja)
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(-t*0.87+1.05); ctx.translate(-cx,-cy);
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx, cy - R*0.73);
    ctx.strokeStyle = ORG; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();

    // ── 9. Crosshair ─────────────────────────────────────
    ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = PRI;
    ctx.lineWidth = 0.7; ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy);
    ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R);
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.restore();

    // ── 10. Patrón hexagonal central (firma JARVIS) ───────
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.12);
    const hexR = R * 0.29;
    // hexágono exterior
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i/6)*Math.PI*2; const hx = Math.cos(a)*hexR, hy = Math.sin(a)*hexR;
      i===0 ? ctx.moveTo(hx,hy) : ctx.lineTo(hx,hy);
    }
    ctx.strokeStyle = 'rgba(0,212,255,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    // hexágono interior
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i/6)*Math.PI*2; const hx = Math.cos(a)*hexR*0.55, hy = Math.sin(a)*hexR*0.55;
      i===0 ? ctx.moveTo(hx,hy) : ctx.lineTo(hx,hy);
    }
    ctx.strokeStyle = 'rgba(0,212,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // radios del hexágono
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*hexR, Math.sin(a)*hexR);
      ctx.strokeStyle = 'rgba(0,212,255,0.2)'; ctx.lineWidth = 0.8; ctx.stroke();
      // punto en cada vértice
      ctx.beginPath(); ctx.arc(Math.cos(a)*hexR, Math.sin(a)*hexR, 2.5, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,212,255,0.7)'; ctx.fill();
    }
    ctx.restore();

    // ── 11. Corner brackets (más grandes y gruesos) ───────
    const bS = 16, bG = 6;
    ctx.strokeStyle = 'rgba(0,212,255,0.65)'; ctx.lineWidth = 2;
    [[bG,bG,1,1],[W-bG,bG,-1,1],[bG,H-bG,1,-1],[W-bG,H-bG,-1,-1]].forEach(([x,y,dx,dy]) => {
      ctx.beginPath();
      ctx.moveTo(x+dx*bS, y); ctx.lineTo(x,y); ctx.lineTo(x, y+dy*bS);
      ctx.stroke();
    });

    // ── 12. Partículas (speaking) ─────────────────────────
    if (spk && Math.random() < 0.32) {
      const ang = Math.random()*Math.PI*2, rS = R*0.28;
      jParticles.push({
        x: cx+Math.cos(ang)*rS, y: cy+Math.sin(ang)*rS,
        vx: Math.cos(ang)*(1+Math.random()*2.5),
        vy: Math.sin(ang)*(1+Math.random()*2.5)-0.4,
        life: 1.0,
      });
    }
    jParticles = jParticles
      .map(p => ({...p, x:p.x+p.vx, y:p.y+p.vy, vx:p.vx*0.96, vy:p.vy*0.96, life:p.life-0.026}))
      .filter(p => p.life > 0);
    jParticles.forEach(p => {
      ctx.globalAlpha = p.life * 0.9;
      ctx.fillStyle = PRI;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── 13. Core central (multicapa, muy luminoso) ────────
    const intens = spk ? 0.9+Math.sin(t*5)*0.08 : lst ? 0.65+Math.sin(t*7)*0.14
      : thk ? 0.5+Math.sin(t*4)*0.12 : 0.25+Math.sin(t*1.5)*0.06;
    // capas de glow
    for (let i = 5; i >= 0; i--) {
      const r = R*0.24*(1+i*0.38);
      const a = intens*(1-i/6)*0.28;
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.fillStyle = `rgba(0,212,255,${a})`; ctx.fill();
    }
    // gradiente del core
    const cg = ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.26);
    cg.addColorStop(0, `rgba(255,255,255,${intens})`);
    cg.addColorStop(0.12, `rgba(180,245,255,${intens*0.92})`);
    cg.addColorStop(0.35, `rgba(0,212,255,${intens*0.65})`);
    cg.addColorStop(0.75, `rgba(0,80,200,${intens*0.18})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx,cy,R*0.26,0,Math.PI*2); ctx.fill();
    // punto central blanco
    ctx.beginPath(); ctx.arc(cx,cy, 3+intens*6, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${intens})`; ctx.fill();

    // ── 14. Waveform (32 barras dinámicas) ───────────────
    const nB = 32, bW = 2, bG2 = 1.8;
    const totBW = nB*(bW+bG2)-bG2;
    const bX0 = cx - totBW/2, bCY = H*0.91;
    const maxH = spk ? 11 : 3;
    for (let i = 0; i < nB; i++) {
      const bx = bX0 + i*(bW+bG2);
      const fr = spk ? (3+i*0.18)*t*0.28+i*0.45 : 1.2*t+i*0.3;
      const h = Math.max(1.5, Math.abs(Math.sin(fr))*maxH + 1.2);
      ctx.fillStyle = `rgba(0,212,255,${spk?0.92:0.35})`;
      ctx.fillRect(bx, bCY - h/2, bW, h);
    }

    // ── 15. HUD labels + data stream ─────────────────────
    const stCol = spk?PRI : lst?GRN : thk?YEL : 'rgba(0,212,255,0.3)';
    ctx.font = '6.5px "Share Tech Mono",monospace';
    ctx.fillStyle = 'rgba(0,212,255,0.38)'; ctx.textAlign = 'left';  ctx.fillText('SYS', 8, 13);
    ctx.fillStyle = stCol;                  ctx.textAlign = 'right'; ctx.fillText(state.toUpperCase(), W-7, 13);
    ctx.font = '5.5px "Share Tech Mono",monospace';
    ctx.fillStyle = 'rgba(0,212,255,0.22)';
    ctx.textAlign = 'left';  ctx.fillText(`${(t*100%100|0).toString().padStart(3,'0')}ms`, 8, H-7);
    ctx.textAlign = 'right'; ctx.fillText('KAI·v2', W-7, H-7);
    ctx.textAlign = 'left';
  }

  /* ── Animation loop ── */
  const canvasOrb = document.getElementById('atiko-kai-canvas-orb');
  const canvasFab = document.getElementById('atiko-kai-canvas-fab');
  let t0 = performance.now();
  function animate() {
    const t = (performance.now()-t0)/1000;
    drawOrb(canvasOrb, t, sphereState);
    drawFab(canvasFab, t, sphereState==='listening'?'listening':sphereState==='thinking'?'thinking':sphereState==='error'?'error':'idle');
    requestAnimationFrame(animate);
  }
  animate();

  /* ══════════════════════════════════════════════════════
     TTS — PCM streaming (Web Audio API) → blob fallback → Web Speech
  ══════════════════════════════════════════════════════ */
  let ttsEnabled = true;
  const ttsBtn = document.getElementById('atiko-kai-tts');
  let currentAudio = null;
  let audioCtx = null;
  let speakAborted = false;

  function getAudioCtx() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioCtx;
  }

  function stopAudio() {
    speakAborted = true;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    window.speechSynthesis && window.speechSynthesis.cancel();
    sphereState = 'idle';
  }

  // Reproduce chunks PCM 24kHz 16-bit mono en tiempo real
  async function playPcmStream(readableStream) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch(e) { throw e; } }

    const reader = readableStream.getReader();
    let leftover = new Uint8Array(0);
    let nextTime = ctx.currentTime + 0.08;
    let lastSrc = null;

    try {
      while (!speakAborted) {
        const { done, value } = await reader.read();
        if (done || speakAborted) break;

        const merged = new Uint8Array(leftover.length + value.length);
        merged.set(leftover, 0); merged.set(value, leftover.length);

        const numSamples = Math.floor(merged.length / 2);
        if (numSamples > 0) {
          const usedLen = numSamples * 2;
          const view = new DataView(merged.buffer, 0, usedLen);
          const f32 = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; i++) {
            f32[i] = view.getInt16(i * 2, true) / 32768.0; // little-endian PCM → float
          }
          const buf = ctx.createBuffer(1, numSamples, 24000);
          buf.copyToChannel(f32, 0);
          const src = ctx.createBufferSource();
          src.buffer = buf; src.connect(ctx.destination);
          const when = Math.max(nextTime, ctx.currentTime + 0.005);
          src.start(when);
          nextTime = when + buf.duration;
          lastSrc = src;
          leftover = merged.length > usedLen
            ? new Uint8Array(merged.buffer, usedLen, merged.length - usedLen)
            : new Uint8Array(0);
        } else {
          leftover = merged;
        }
      }
      // Esperar a que termine el último chunk
      if (!speakAborted && lastSrc) {
        const wait = (nextTime - ctx.currentTime) * 1000 + 200;
        if (wait > 0) {
          await new Promise(r => {
            const tmr = setTimeout(r, wait);
            lastSrc.onended = () => { clearTimeout(tmr); r(); };
          });
        }
      }
    } finally {
      reader.cancel().catch(() => {});
      if (!speakAborted) sphereState = 'idle';
    }
  }

  async function speak(text) {
    if (!ttsEnabled) return;
    const clean = text.replace(/<[^>]+>/g,'').replace(/\n/g,' ').trim().substring(0, 400);
    if (!clean) return;

    stopAudio();
    speakAborted = false;
    sphereState = 'speaking';

    // 1️⃣ PCM streaming — primera palabra suena sin esperar el archivo completo
    try {
      const res = await fetch(CONFIG.ttsStreamUrl, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({text: clean, voice: 'nova'}),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok && res.body) { await playPcmStream(res.body); return; }
    } catch(e) { /* fallback */ }

    if (speakAborted) return;

    // 2️⃣ Blob MP3 (si el streaming falla)
    try {
      const res = await fetch(CONFIG.ttsUrl, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({text: clean, voice: 'nova'}),
        signal: AbortSignal.timeout(14000),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (speakAborted) return;
        const url = URL.createObjectURL(blob);
        currentAudio = new Audio(url);
        currentAudio.onended = currentAudio.onerror = () => { sphereState='idle'; URL.revokeObjectURL(url); };
        await currentAudio.play(); return;
      }
    } catch(e) { /* fallback */ }

    if (speakAborted) return;

    // 3️⃣ Web Speech API
    if (!window.speechSynthesis) { sphereState='idle'; return; }
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = CONFIG.ttsLang; utter.rate = 1.05; utter.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang.startsWith('es'));
    if (esVoice) utter.voice = esVoice;
    utter.onend = utter.onerror = () => { sphereState = 'idle'; };
    window.speechSynthesis.speak(utter);
  }

  ttsBtn.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsBtn.classList.toggle('muted', !ttsEnabled);
    if (!ttsEnabled) stopAudio();
  });

  /* ══════════════════════════════════════════════════════
     STT — continuo con auto-restart
  ══════════════════════════════════════════════════════ */
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = document.getElementById('atiko-kai-mic');
  let recognition = null;
  let interimText = '';

  if (SpeechRec) {
    recognition = new SpeechRec();
    recognition.lang = CONFIG.sttLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      interimText = interim;
      if (final.trim()) {
        // Enviar texto final al agente
        input.value = final.trim();
        sendMsg();
      } else if (interim) {
        input.value = interim;
        input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,80)+'px';
      }
    };

    recognition.onend = () => {
      // Auto-restart si seguimos en modo escucha
      if (isListening) {
        try { recognition.start(); } catch(e) {}
      } else {
        sphereState = 'idle';
        mic.classList.remove('listening');
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return; // ignorar silencio
      isListening = false; mic.classList.remove('listening'); sphereState = 'idle';
    };

    mic.addEventListener('click', () => {
      if (isListening) {
        isListening = false; recognition.stop();
        mic.classList.remove('listening'); sphereState = 'idle';
      } else {
        isListening = true; mic.classList.add('listening'); sphereState = 'listening';
        input.value = '';
        try { recognition.start(); } catch(e) {
          isListening=false; mic.classList.remove('listening'); sphereState='idle';
        }
      }
    });
  } else {
    mic.style.opacity = '0.3';
    mic.addEventListener('click', () => addBot('Reconocimiento de voz no disponible. Usa Chrome o Edge.'));
  }

  /* ── Helpers ── */
  const msgs   = document.getElementById('atiko-kai-msgs');
  const input  = document.getElementById('atiko-kai-input');
  const send   = document.getElementById('atiko-kai-send');
  const bubble = document.getElementById('atiko-kai-bubble');
  const badge  = document.getElementById('atiko-kai-badge');
  const win    = document.getElementById('atiko-kai-win');
  const fab    = document.getElementById('atiko-kai-fab');
  const close  = document.getElementById('atiko-kai-close');
  const clearBtn = document.getElementById('atiko-kai-clear');

  function ts() { const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`; }

  function addBot(text) {
    const w=document.createElement('div'); w.className='kai-msg-bot-wrap';
    w.innerHTML=`<span class="kai-msg-label">KAI // ${ts()}</span><div class="kai-msg-bot-bubble">${text.replace(/\n/g,'<br>')}</div>`;
    msgs.appendChild(w); msgs.scrollTop=msgs.scrollHeight;
    speak(text);
  }
  function addUser(text) {
    const safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const w=document.createElement('div'); w.className='kai-msg-user-wrap';
    w.innerHTML=`<span class="kai-msg-label-usr">USR // ${ts()}</span><div class="kai-msg-user-bubble">${safe}</div>`;
    msgs.appendChild(w); msgs.scrollTop=msgs.scrollHeight;
  }
  function showTyping() {
    const el=document.createElement('div'); el.id='atiko-kai-typing';
    el.innerHTML=`<span class="kai-msg-label">KAI</span><div class="kai-typing-inner"><div class="kai-typing-bars"><span></span><span></span><span></span><span></span><span></span></div><span class="kai-typing-text">PROCESANDO</span></div>`;
    msgs.appendChild(el); msgs.scrollTop=msgs.scrollHeight;
  }
  function hideTyping() { const el=document.getElementById('atiko-kai-typing'); if(el) el.remove(); }

  function openChat() {
    isOpen=true; win.classList.add('open');
    bubble.classList.remove('show'); badge.classList.remove('show');
    if (!msgs.children.length) addBot('KAI operativo. ¿En qué te puedo ayudar?');
    setTimeout(()=>input.focus(),300);
  }
  function closeChat() {
    isOpen=false; win.classList.remove('open');
    if (isListening) { isListening=false; try{recognition&&recognition.stop();}catch(e){} }
    stopAudio();
  }

  async function sendMsg() {
    const text=input.value.trim();
    if (!text||isTyping) return;
    input.value=''; input.style.height='auto';
    send.disabled=true; isTyping=true; sphereState='thinking';
    addUser(text); showTyping();
    try {
      const res=await fetch(CONFIG.apiUrl,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text,sessionId}),
      });
      const data=await res.json();
      if (!res.ok) throw new Error(data.error||'Error');
      sessionId=data.sessionId;
      try{sessionStorage.setItem('atiko_session',sessionId);}catch(e){}
      hideTyping(); addBot(data.reply);
    } catch(err) {
      hideTyping(); sphereState='error';
      addBot('ERROR DE CONEXIÓN\n\nContacto directo:\n+56 9 2713 0792\natikodigital@gmail.com');
      setTimeout(()=>sphereState='idle',2000);
    }
    isTyping=false; send.disabled=false;
    if (!isListening) input.focus();
  }

  fab.addEventListener('click', ()=>isOpen?closeChat():openChat());
  close.addEventListener('click', closeChat);
  clearBtn.addEventListener('click', ()=>{
    msgs.innerHTML=''; sessionId=null;
    try{sessionStorage.removeItem('atiko_session');}catch(e){}
    addBot('KAI operativo. ¿En qué te puedo ayudar?');
  });
  bubble.addEventListener('click', openChat);
  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}});
  input.addEventListener('input', ()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,80)+'px';});

  setTimeout(()=>{
    if(!isOpen){
      bubble.classList.add('show'); badge.classList.add('show');
      setTimeout(()=>bubble.classList.remove('show'),7000);
    }
  }, CONFIG.showAfterMs);

})();
