import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * J.A.R.V.I.S. UI — Frontend completo estilo HUD (Iron Man)
 * - Orbe "arc reactor" animado en canvas (anillos, hexágono, núcleo ondulante)
 * - Chat con burbujas USR / J.A.R.V.I.S.
 * - Micrófono (Web Speech API) con guard de HTTPS (fix del error getUserMedia)
 * - TTS opcional vía POST /api/agent/tts
 * - Backend esperado: POST /api/agent/chat  { message, student_id, conversation_history }
 *
 * Uso: <JarvisUI apiBase="" studentId="demo" onClose={() => {}} />
 * IMPORTANTE: el micrófono SOLO funciona en HTTPS o http://localhost.
 */

// Paleta EXACTA de Mark-XXXIX (ui.py, clase C)
const PAL = {
    BG: '#00060a', PANEL: '#010d14', PANEL2: '#010f18',
    BORDER: '#0d3347', BORDER_B: '#1a5c7a',
    PRI: '#00d4ff', PRI_DIM: '#007a99', PRI_GHO: '#001f2e',
    GREEN: '#00ff88', RED: '#ff3355',
    TEXT: '#8ffcff', TEXT_DIM: '#3a8a9a', TEXT_MED: '#5ab8cc',
    WHITE: '#d8f8ff', BAR_BG: '#011520'
};
const CYAN = PAL.PRI;
const CYAN_DIM = 'rgba(0,212,255,0.55)';

const JarvisUI = ({ apiBase = '', studentId = 'demo', onClose = () => {} }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'J.A.R.V.I.S. operativo. ¿Cómo puedo ayudarle?' }
    ]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [listening, setListening] = useState(false);
    const [voiceOn, setVoiceOn] = useState(true);
    const [errorBanner, setErrorBanner] = useState('');
    const canvasRef = useRef(null);
    const stateRef = useRef('idle'); // idle | listening | thinking | speaking
    const recognitionRef = useRef(null);
    const audioRef = useRef(null);
    const bottomRef = useRef(null);

    useEffect(() => { stateRef.current = thinking ? 'thinking' : listening ? 'listening' : 'idle'; }, [thinking, listening]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    // ================= ORBE ARC-REACTOR (canvas) =================
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const SIZE = 320;
        canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
        canvas.style.width = SIZE + 'px'; canvas.style.height = SIZE + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        let raf;

        const noise = (x) => Math.sin(x * 1.3) * 0.5 + Math.sin(x * 2.7 + 1.4) * 0.3 + Math.sin(x * 4.1 + 2.8) * 0.2;

        const draw = (ts) => {
            raf = requestAnimationFrame(draw);
            const t = ts * 0.001;
            const st = stateRef.current;
            const cx = SIZE / 2, cy = SIZE / 2;
            const speed = st === 'thinking' ? 2.2 : st === 'speaking' ? 1.6 : st === 'listening' ? 1.3 : 0.6;
            ctx.clearRect(0, 0, SIZE, SIZE);

            // Anillos exteriores segmentados (rotan en sentidos opuestos)
            const rings = [
                { r: 132, segs: [[0, 1.1], [1.5, 2.4], [3.1, 4.4], [4.9, 5.9]], w: 1.5, dir: 1 },
                { r: 118, segs: [[0.4, 2.2], [2.9, 3.4], [4.2, 5.6]], w: 2.5, dir: -1 },
                { r: 104, segs: [[0, 0.7], [1.2, 3.3], [3.9, 4.2], [5.0, 6.0]], w: 1, dir: 1 }
            ];
            rings.forEach((ring, ri) => {
                const rot = t * speed * 0.35 * ring.dir + ri;
                ctx.save();
                ctx.translate(cx, cy); ctx.rotate(rot);
                ctx.strokeStyle = CYAN_DIM; ctx.lineWidth = ring.w;
                ctx.shadowColor = CYAN; ctx.shadowBlur = 8;
                ring.segs.forEach(([a, b]) => { ctx.beginPath(); ctx.arc(0, 0, ring.r, a, b); ctx.stroke(); });
                ctx.restore();
            });

            // Punto orbitando
            const oa = t * speed * 0.8;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(oa) * 132, cy + Math.sin(oa) * 132, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = CYAN; ctx.shadowColor = CYAN; ctx.shadowBlur = 12; ctx.fill();

            // Hexagono tenue
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(t * speed * 0.1);
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const x = Math.cos(a) * 88, y = Math.sin(a) * 88;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(0,212,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.restore();

            // Nucleo: blob ondulante con relleno radial + "engranaje" de lineas
            const baseR = st === 'listening' ? 58 : st === 'thinking' ? 70 : 64;
            const wobble = st === 'idle' ? 4 : 8;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.beginPath();
            for (let i = 0; i <= 64; i++) {
                const a = (i / 64) * Math.PI * 2;
                const r = baseR + noise(a * 2 + t * speed) * wobble;
                const x = Math.cos(a) * r, y = Math.sin(a) * r;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, baseR + 10);
            grad.addColorStop(0, 'rgba(224,252,255,0.95)');
            grad.addColorStop(0.25, 'rgba(0,212,255,0.55)');
            grad.addColorStop(0.7, 'rgba(34,99,170,0.25)');
            grad.addColorStop(1, 'rgba(8,20,40,0)');
            ctx.fillStyle = grad;
            ctx.shadowColor = CYAN; ctx.shadowBlur = 30;
            ctx.fill();
            ctx.strokeStyle = 'rgba(186,240,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
            // Lineas radiales internas (textura tipo reactor)
            ctx.strokeStyle = 'rgba(186,240,255,0.18)'; ctx.lineWidth = 1;
            for (let i = 0; i < 36; i++) {
                const a = (i / 36) * Math.PI * 2 + t * speed * 0.2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
                ctx.lineTo(Math.cos(a) * (baseR - 6), Math.sin(a) * (baseR - 6));
                ctx.stroke();
            }
            // Centro brillante
            ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#eafdff'; ctx.shadowBlur = 25; ctx.fill();
            ctx.restore();
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    // ================= TTS =================
    const speak = useCallback(async (text) => {
        if (!voiceOn) return;
        try {
            stateRef.current = 'speaking';
            const res = await fetch(`${apiBase}/api/agent/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: 'onyx' })
            });
            if (!res.ok) return;
            const blob = await res.blob();
            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(URL.createObjectURL(blob));
            audioRef.current = audio;
            audio.onended = () => { stateRef.current = 'idle'; };
            await audio.play();
        } catch { stateRef.current = 'idle'; }
    }, [apiBase, voiceOn]);

    // ================= CHAT =================
    const send = useCallback(async (text) => {
        const msg = (text ?? input).trim();
        if (!msg || thinking) return;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: msg }]);
        setThinking(true);
        try {
            const history = messages.slice(-8).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant', content: m.text
            }));
            const res = await fetch(`${apiBase}/api/agent/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, student_id: studentId, conversation_history: history })
            });
            const data = await res.json();
            const reply = data.response || data.error || 'Señor, hubo una interferencia en mis circuitos. Reintente.';
            setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
            speak(reply);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Señor, no logro contactar al servidor.' }]);
        } finally {
            setThinking(false);
        }
    }, [input, thinking, messages, apiBase, studentId, speak]);

    // ================= MICROFONO (con guard HTTPS — fix getUserMedia) =================
    const toggleMic = useCallback(() => {
        if (listening) {
            recognitionRef.current?.stop();
            setListening(false);
            return;
        }
        // Guard 1: contexto seguro. getUserMedia/SpeechRecognition SOLO existen en HTTPS o localhost.
        if (!window.isSecureContext) {
            setErrorBanner('El micrófono requiere HTTPS (o localhost). Sirve la app con certificado SSL.');
            return;
        }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setErrorBanner('Este navegador no soporta reconocimiento de voz. Usa Chrome.');
            return;
        }
        try {
            const rec = new SR();
            rec.lang = 'es-CL';
            rec.continuous = true;
            rec.interimResults = true;
            rec.onresult = (e) => {
                let finalText = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
                }
                if (finalText.trim()) send(finalText.trim());
            };
            rec.onerror = (e) => {
                if (e.error === 'not-allowed') setErrorBanner('Permiso de micrófono denegado. Actívalo en el navegador.');
                setListening(false);
            };
            rec.onend = () => setListening(false);
            rec.start();
            recognitionRef.current = rec;
            setListening(true);
        } catch (err) {
            setErrorBanner(`No se pudo acceder al micrófono: ${err.message}`);
        }
    }, [listening, send]);

    // ================= UI =================
    return (
        <div style={S.root}>
            <style>{CSS}</style>
            {/* Header */}
            <div style={S.header}>
                <div style={S.titleWrap}>
                    <span style={S.dot} />
                    <span style={S.title}>J.A.R.V.I.S.</span>
                </div>
                <div style={S.headerBtns}>
                    <button className="jv-btn jv-outline" onClick={() => send('Estado del sistema')}>TRANSMIT</button>
                    <button className="jv-btn" style={{ opacity: voiceOn ? 1 : 0.4 }} onClick={() => setVoiceOn(v => !v)} title="Voz">{'🔊'}</button>
                    <button className="jv-btn" onClick={() => setMessages([messages[0]])} title="Limpiar">{'🗑'}</button>
                    <button className="jv-btn jv-close" onClick={onClose}>{'✕'}</button>
                </div>
            </div>

            {/* Orbe */}
            <div style={S.orbWrap}><canvas ref={canvasRef} /></div>

            {/* Chat */}
            <div style={S.chat}>
                {messages.map((m, i) => (
                    <div key={i} style={{ ...S.bubble, ...(m.role === 'user' ? S.bubbleUser : S.bubbleBot) }}>
                        <div style={S.bubbleLabel}>{m.role === 'user' ? 'USR' : 'J.A.R.V.I.S.'}</div>
                        <div style={S.bubbleText}>{m.text}</div>
                    </div>
                ))}
                {thinking && (
                    <div style={{ ...S.bubble, ...S.bubbleBot }}>
                        <div style={S.bubbleLabel}>J.A.R.V.I.S.</div>
                        <div style={S.bubbleText}>Procesando<span className="jv-blink">_</span></div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Banner de error */}
            {errorBanner && (
                <div style={S.errorBanner}>
                    <span>{'⚠'} {errorBanner}</span>
                    <button className="jv-btn" onClick={() => setErrorBanner('')}>{'✕'}</button>
                </div>
            )}

            {/* Input */}
            <div style={S.inputBar}>
                <button className={`jv-mic ${listening ? 'jv-mic-on' : ''}`} onClick={toggleMic}>{'🎤'}</button>
                <input
                    style={S.input}
                    value={input}
                    placeholder="Consulta…"
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button className="jv-send" onClick={() => send()}>{'➤'}</button>
            </div>
        </div>
    );
};

const S = {
    root: {
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(1200px 800px at 50% -10%, #012433 0%, #00060a 55%, #000305 100%)',
        color: CYAN, fontFamily: "'Share Tech Mono','Courier New',monospace", zIndex: 9999,
        backgroundImage: 'linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)',
        backgroundSize: '48px 48px'
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(0,212,255,0.15)' },
    titleWrap: { display: 'flex', alignItems: 'center', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: CYAN, boxShadow: `0 0 12px ${CYAN}` },
    title: { fontSize: 22, letterSpacing: 6, color: '#8ffcff', textShadow: `0 0 14px ${CYAN_DIM}` },
    headerBtns: { display: 'flex', gap: 8, alignItems: 'center' },
    orbWrap: { display: 'flex', justifyContent: 'center', padding: '6px 0 0' },
    chat: { flex: 1, overflowY: 'auto', padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 },
    bubble: { maxWidth: '82%', borderRadius: 14, padding: '12px 16px', border: '1px solid #0d3347', background: 'rgba(1,13,20,0.85)', backdropFilter: 'blur(3px)' },
    bubbleBot: { alignSelf: 'flex-start' },
    bubbleUser: { alignSelf: 'flex-end', background: 'rgba(1,15,24,0.9)' },
    bubbleLabel: { fontSize: 11, letterSpacing: 3, color: '#3a8a9a', marginBottom: 6 },
    bubbleText: { fontSize: 17, lineHeight: 1.5, color: '#d8f8ff' },
    errorBanner: {
        margin: '0 14px 10px', padding: '12px 14px', borderRadius: 12,
        border: '1px solid rgba(255,51,85,0.55)', background: 'rgba(60,12,18,0.6)',
        color: '#ff8099', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 14
    },
    inputBar: { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px 18px' },
    input: {
        flex: 1, background: '#010f18', border: '1px solid #0d3347',
        borderRadius: 14, padding: '14px 16px', color: '#d8f8ff', fontSize: 16, outline: 'none',
        fontFamily: 'inherit'
    }
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
.jv-btn { background: rgba(1,21,32,0.9); border: 1px solid #0d3347; color: #5ab8cc;
  border-radius: 10px; padding: 8px 10px; cursor: pointer; font-family: inherit; font-size: 14px; }
.jv-btn:hover { border-color: #1a5c7a; box-shadow: 0 0 10px rgba(0,212,255,0.25); }
.jv-outline { letter-spacing: 3px; padding: 8px 14px; }
.jv-close { border-color: rgba(255,51,85,0.55); color: #ff8099; }
.jv-mic { width: 54px; height: 54px; border-radius: 50%; background: rgba(1,21,32,0.95);
  border: 1px solid #0f4060; color: #5ab8cc; font-size: 20px; cursor: pointer; }
.jv-mic-on { border-color: #00d4ff; box-shadow: 0 0 18px rgba(0,212,255,0.6); animation: jvpulse 1.2s infinite; }
.jv-send { width: 48px; height: 48px; border-radius: 12px; background: rgba(1,21,32,0.95);
  border: 1px solid #0f4060; color: #5ab8cc; font-size: 18px; cursor: pointer; }
.jv-blink { animation: jvblink 0.9s steps(1) infinite; }
@keyframes jvpulse { 0%,100% { box-shadow: 0 0 10px rgba(0,212,255,0.4);} 50% { box-shadow: 0 0 24px rgba(0,212,255,0.8);} }
@keyframes jvblink { 50% { opacity: 0; } }
`;

export default JarvisUI;
