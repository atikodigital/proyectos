# KALY compacta + texto + silenciar — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `gastos-app/` también existe en `main` — NO tocar eso. Nunca `git add -A`. App bajo `gastos-app/`, jest desde ahí.

**Goal:** KALY compacta: esfera (voz) + barra de texto siempre visible + última respuesta en texto + botón silenciar (no habla pero el mic siempre escucha y responde por texto), global en todos los módulos.

**Architecture:** `live.js` gana `outputAudioTranscription` (texto de lo que KALY dice) y `session.setMuted(bool)` que solo apaga el parlante (el `player` no reproduce si está muteado; el mic sigue). `KalyAgent.jsx` se reescribe compacto: sin recuadro de historial, muestra solo la última respuesta, barra de texto siempre visible, botón 🔇 persistido (localStorage `kaly_muted`), detecta "cállate/silencio" en lo que dices, y arranca callado si está muteado (pero auto-arranca igual).

**Tech Stack:** Capacitor/React/Vite, jest + React Testing Library, TDD. Spec: `docs/superpowers/specs/2026-06-16-kaly-compacta-mute-design.md`.

---

## Task 1: live.js — texto de respuestas + setMuted (parlante)

**Files:**
- Modify: `gastos-app/src/gastos/kaly/live.js`
- Test: `gastos-app/tests/gastos/kaly-live.test.js`

- [ ] **Step 1: Write the failing test** — APPEND these tests al final de `gastos-app/tests/gastos/kaly-live.test.js` (el archivo ya tiene `makeSession`/`FakeWS`):

```js
test('setup incluye outputAudioTranscription (texto de las respuestas de KALY)', () => {
  const { fake } = makeSession();
  fake.onopen();
  const sent = JSON.parse(fake.send.mock.calls[0][0]);
  expect(sent.setup.outputAudioTranscription).toBeDefined();
});

test('serverContent.outputTranscription.text → onAgentTranscript', async () => {
  const onAgentTranscript = jest.fn();
  const { fake } = makeSession({ onAgentTranscript });
  fake.onopen();
  fake.receive({ setupComplete: true });
  await new Promise((r) => setTimeout(r, 0));
  fake.receive({ serverContent: { outputTranscription: { text: 'Hola, soy Kaly' } } });
  await new Promise((r) => setTimeout(r, 0));
  expect(onAgentTranscript).toHaveBeenCalledWith('Hola, soy Kaly');
});

test('session.setMuted existe y es invocable sin romper', () => {
  const { session } = makeSession();
  expect(typeof session.setMuted).toBe('function');
  expect(() => { session.setMuted(true); session.setMuted(false); }).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/kaly-live.test.js`
Expected: FAIL — `outputAudioTranscription` undefined, `onAgentTranscript` not called, `session.setMuted` not a function.

- [ ] **Step 3: Write minimal implementation** in `gastos-app/src/gastos/kaly/live.js`:

(a) En el `setup` (dentro de `ws.onopen`), agregar `outputAudioTranscription: {}` junto a `inputAudioTranscription: {}`:
```js
      inputAudioTranscription: {},
      outputAudioTranscription: {},
```

(b) Declarar el flag `muted` junto a las otras vars (línea ~7, donde está `let closed = false; let micStop = null; let player = null;`):
```js
  let closed = false; let micStop = null; let player = null; let muted = false;
```

(c) Al crear el player (en `setupComplete`), pasarle un lector del flag:
```js
      if (audio) player = createPlayer(onAudioLevel, setState, () => muted);
```

(d) En `onmessage`, después de la línea de `inputTranscription`, manejar la salida:
```js
    if (sc.inputTranscription && sc.inputTranscription.text) onUserTranscript && onUserTranscript(sc.inputTranscription.text);
    if (sc.outputTranscription && sc.outputTranscription.text) opts.onAgentTranscript && opts.onAgentTranscript(sc.outputTranscription.text);
```

(e) En el `return { ... }` de la sesión, agregar `setMuted`:
```js
  return {
    sendText(text) { send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); },
    sendToolResponse(id, name, response) { send({ toolResponse: { functionResponses: [{ id, name, response }] } }); },
    setMuted(m) { muted = !!m; },
    close() { cleanup(); try { ws.close(); } catch (e) {} },
  };
```

(f) En `createPlayer`, agregar el tercer parámetro `isMuted` y respetarlo: cambiar la firma `export function createPlayer(onLevel, setState) {` por `export function createPlayer(onLevel, setState, isMuted) {`, y al inicio de `push(b64) {` (primera línea dentro de la función) agregar:
```js
    push(b64) {
      if (isMuted && isMuted()) { return; }
      if (ctx && ctx.state === 'suspended') {
```
(Así, muteado: no agenda el audio → no suena; el mic sigue enviando; `turnComplete` → `onDrain` con `pending===0` pasa a 'listening' igual.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/kaly-live.test.js`
Expected: PASS (los anteriores + 3 nuevos).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/kaly/live.js gastos-app/tests/gastos/kaly-live.test.js && git commit -m "feat(kaly): live.js texto de respuestas (outputAudioTranscription) + setMuted (parlante)"
```

---

## Task 2: KalyAgent.jsx — compacta + texto + silenciar

**Files:**
- Modify: `gastos-app/src/gastos/kaly/KalyAgent.jsx` (reescritura del render + handlers; se mantiene toda la lógica de sesión/timers/tools)
- Test: `gastos-app/tests/gastos/KalyAgent.test.jsx` (agregar `setMuted` al mock + 3 tests nuevos)

- [ ] **Step 1: Write the failing test** — en `gastos-app/tests/gastos/KalyAgent.test.jsx`:

(1a) Agregar `setMuted: jest.fn(),` al objeto `session` del mock de live.js (dentro de `jest.mock('../../src/gastos/kaly/live.js', ...)`), quedando:
```js
    const session = {
      sendText: jest.fn(),
      sendToolResponse: jest.fn(),
      setMuted: jest.fn(),
      close: jest.fn(),
    };
```

(1b) APPEND estos 3 tests al final del archivo:
```js
test('(6) la barra "Escribe a Kaly…" está siempre visible (incluso recién montada)', async () => {
  await act(async () => { render(<KalyAgent />); });
  expect(screen.getByPlaceholderText('Escribe a Kaly…')).toBeInTheDocument();
});

test('(7) botón silenciar: togglea y persiste en localStorage + llama session.setMuted', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));
  const btn = screen.getByLabelText('Silenciar Kaly');
  await act(async () => { fireEvent.click(btn); });
  expect(localStorage.getItem('kaly_muted')).toBe('1');
  expect(lastSession.setMuted).toHaveBeenCalledWith(true);
  await act(async () => { fireEvent.click(screen.getByLabelText('Activar voz de Kaly')); });
  expect(localStorage.getItem('kaly_muted')).toBe('0');
  expect(lastSession.setMuted).toHaveBeenCalledWith(false);
});

test('(8) silenciada (kaly_muted=1) igual auto-arranca, pero callada (setMuted(true))', async () => {
  localStorage.setItem('kaly_muted', '1');
  await act(async () => { render(<KalyAgent />); });
  expect(api.agentSession).toHaveBeenCalledTimes(1);     // auto-arranca igual
  await waitFor(() => expect(lastSession.setMuted).toHaveBeenCalledWith(true)); // arranca callada
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx`
Expected: FAIL — no existe el placeholder ni el botón "Silenciar Kaly".

- [ ] **Step 3: Write minimal implementation** — REEMPLAZAR el contenido completo de `gastos-app/src/gastos/kaly/KalyAgent.jsx` por:

```jsx
/* eslint-disable no-undef */
/**
 * Kaly Agent — orquestador de sesión Gemini Live, compacto.
 * Esfera (voz) + barra de texto siempre visible + última respuesta + botón silenciar.
 * state: 'off' | 'connecting' | 'live' | 'listening' | 'speaking' | 'error'
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KalyOrb from './KalyOrb.jsx';
import { openLiveSession } from './live.js';
import { TOOL_DECLARATIONS, executeTool } from './tools.js';
import { buildSystemPrompt, instruccionInicial } from './prompt.js';
import { decideAutoStart, esNegativa, hoyStr, SILENCE_MS, INACTIVITY_MS } from './logic.js';

const LIVE_MODEL_FALLBACK =
  typeof __KALY_LIVE_MODEL__ !== 'undefined'
    ? __KALY_LIVE_MODEL__
    : 'gemini-2.5-flash-native-audio-preview-09-2025';
/* eslint-enable no-undef */

const esSilenciar = (t) => /(c[áa]llate|silencio|no hables|\bcalla\b)/i.test(String(t || ''));

export default function KalyAgent() {
  const [state, setState] = useState('off');
  const [level, setLevel] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [muted, setMutedState] = useState(() => {
    try { return localStorage.getItem('kaly_muted') === '1'; } catch (_) { return false; }
  });

  const sessionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const contextRef = useRef(null);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  function clearSilenceTimer() {
    if (silenceTimerRef.current != null) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }
  function armSilenceTimer(stopFn) {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; stopFn(); }, SILENCE_MS);
  }

  const aplicarMute = useCallback((nv) => {
    setMutedState(nv);
    try { localStorage.setItem('kaly_muted', nv ? '1' : '0'); } catch (_) {}
    if (sessionRef.current && sessionRef.current.setMuted) sessionRef.current.setMuted(nv);
  }, []);

  const stop = useCallback(() => {
    clearSilenceTimer();
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    setState('off');
    setMessages([]);
  }, []);

  const start = useCallback(
    async (motivo) => {
      if (sessionRef.current) return;
      setState('connecting');
      setMessages([{ sender: 'kaly', text: 'Conectando con Kaly...', isSystem: true }]);

      let s;
      try { s = await api.agentSession(); }
      catch (_) {
        setState('error');
        setMessages([{ sender: 'kaly', text: 'Kaly no disponible. Intente más tarde.', isSystem: true }]);
        setTimeout(() => stop(), 3000);
        return;
      }

      contextRef.current = s.context;
      if (motivo === 'onboarding' && s.context && s.context.onboarded) motivo = 'saludo';
      if (s.context && s.context.onboarded) localStorage.setItem('kaly_onboarded', '1');

      const onState = (newState) => {
        setState(newState);
        if (newState === 'listening') armSilenceTimer(stop);
      };
      const onAudioLevel = (_dir, v) => setLevel(v);
      const onUserTranscript = (text) => {
        clearSilenceTimer();
        setMessages((prev) => [...prev, { sender: 'user', text }]);
        if (esSilenciar(text)) { aplicarMute(true); return; }
        if (esNegativa(text)) setTimeout(() => stop(), 2500);
      };
      const onAgentTranscript = (text) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.sender === 'kaly' && !last.isSystem) {
            return [...prev.slice(0, -1), { sender: 'kaly', text: last.text + ' ' + text }];
          }
          return [...prev, { sender: 'kaly', text }];
        });
      };
      const onToolCall = async (fc) => {
        const out = await executeTool(fc.name, fc.args, {
          onPrefsSaved: (p) => {
            contextRef.current = { ...contextRef.current, ...p, onboarded: true };
            localStorage.setItem('kaly_onboarded', '1');
          },
        });
        if (sessionRef.current) sessionRef.current.sendToolResponse(fc.id, fc.name, out);
      };
      const onClose = () => { sessionRef.current = null; setState('off'); setMessages([]); };

      const session = openLiveSession({
        token: s.token,
        model: s.model || LIVE_MODEL_FALLBACK,
        systemPrompt: buildSystemPrompt(s.context),
        tools: TOOL_DECLARATIONS,
        audio: true,
        onState, onAudioLevel, onUserTranscript, onAgentTranscript, onToolCall, onClose,
      });

      sessionRef.current = session;
      if (mutedRef.current && session.setMuted) session.setMuted(true); // arranca callada
      session.sendText(instruccionInicial(s.context, motivo));
      if (motivo === 'saludo') localStorage.setItem('kaly_last_greet', hoyStr());
    },
    [stop, aplicarMute],
  );

  // auto-start on mount (auto-arranca aunque esté muted)
  useEffect(() => {
    const onboarded = localStorage.getItem('kaly_onboarded') === '1';
    const motivo = decideAutoStart({ onboarded });
    if (motivo) start(motivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // inactivity timer
  useEffect(() => {
    function resetInactivity() {
      if (inactivityTimerRef.current != null) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        inactivityTimerRef.current = null;
        setState((current) => { if (current === 'off') setTimeout(() => start('inactividad'), 0); return current; });
      }, INACTIVITY_MS);
    }
    resetInactivity();
    window.addEventListener('click', resetInactivity);
    window.addEventListener('touchstart', resetInactivity);
    return () => {
      if (inactivityTimerRef.current != null) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
      window.removeEventListener('click', resetInactivity);
      window.removeEventListener('touchstart', resetInactivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // cleanup on unmount
  useEffect(() => () => {
    clearSilenceTimer();
    if (inactivityTimerRef.current != null) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
  }, []);

  const handleTap = useCallback(() => {
    if (state === 'off') start('manual'); else stop();
  }, [state, start, stop]);

  const handleSendText = useCallback(async () => {
    const txt = inputText.trim();
    if (!txt) return;
    setInputText('');
    if (!sessionRef.current) { await start('manual'); }
    clearSilenceTimer();
    setMessages((prev) => [...prev, { sender: 'user', text: txt }]);
    if (sessionRef.current) sessionRef.current.sendText(txt);
  }, [inputText, start]);

  const toggleMute = useCallback(() => { aplicarMute(!mutedRef.current); }, [aplicarMute]);

  const ultimaKaly = [...messages].reverse().find((m) => m.sender === 'kaly' && !m.isSystem);

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center pt-2 pb-2 bg-slate-50/50 border border-slate-200/40 rounded-2xl shadow-sm px-4">
      <div className="flex items-center gap-3">
        <KalyOrb state={state} audioLevel={level} onTap={handleTap} />
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Activar voz de Kaly' : 'Silenciar Kaly'}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm border ${muted ? 'bg-[#C9A24B] text-white border-[#C9A24B]' : 'bg-white text-slate-500 border-slate-200'}`}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {state === 'error' ? <p className="text-[10px] text-red-400 mt-1 font-bold">Kaly no disponible</p> : null}
      {muted ? (
        <p className="text-[10px] text-slate-500 mt-1 font-semibold text-center">🔇 En silencio — te respondo por texto. Toca 🔊 para la voz.</p>
      ) : null}

      {ultimaKaly ? (
        <p className="w-full text-[12px] text-sky-800 mt-2 px-3 py-1.5 bg-sky-100 border border-sky-200/50 rounded-xl leading-snug line-clamp-2">
          {ultimaKaly.text}
        </p>
      ) : null}

      <div className="flex items-center gap-2 mt-2 w-full">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
          placeholder="Escribe a Kaly…"
          className="flex-1 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C9A24B] bg-white text-slate-800 font-medium"
        />
        <button
          onClick={handleSendText}
          disabled={!inputText.trim()}
          className="px-3 py-1.5 text-[12px] bg-[#C9A24B] hover:bg-[#b08b3a] disabled:opacity-40 text-white rounded-lg font-black transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/KalyAgent.test.jsx`
Expected: PASS (tests 1-5 originales + 6,7,8). Nota: el test (3) original (silencio→close) y el (4) (negativa→close) siguen pasando porque `onState('listening')` arma el timer y `esNegativa` sigue igual.

Si el test (3) fallara por el cambio de `onState` (ahora más corto), revisar que `onState('listening')` siga llamando `armSilenceTimer(stop)` — está incluido.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/kaly/KalyAgent.jsx gastos-app/tests/gastos/KalyAgent.test.jsx && git commit -m "feat(kaly): KalyAgent compacto + texto + botón silenciar (mic siempre escucha)"
```

---

## Task 3: Verificación final (suite + build)

**Files:** (sin cambios; verificación)

- [ ] **Step 1: Suite app completa**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest`
Expected: PASS — incluye KalyAgent, kaly-live, GastosApp (que renderiza KalyAgent), sin regresiones.

- [ ] **Step 2: Build de la app**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npm run build`
Expected: build OK sin errores.

---

## Notas de despliegue (NO en este plan; con el usuario después)
- App: recompilar APK (`npm run build && npx cap sync android && gradlew assembleDebug`) con bump de versión + subir con `upload-apk-wt.js`.
- (Solo cambia la app; no hay deploy de backend.)

## Self-review (hecho)
- **Cobertura del spec:** outputAudioTranscription + onAgentTranscript ✅(T1); setMuted parlante (mic sigue) ✅(T1); quitar recuadro de historial ✅(T2 render sin la caja `h-28`); última respuesta 1-2 líneas ✅(`ultimaKaly` + `line-clamp-2`); barra siempre visible ✅(fuera del `state!=='off'`); escribir con KALY off la arranca ✅(`handleSendText` await start); muted persistido localStorage ✅; botón 🔇/🔊 sin reiniciar sesión (setMuted) ✅; detectar "cállate/silencio" ✅(`esSilenciar` en onUserTranscript); aviso de silencio ✅; auto-arranca aunque muted, callada (setMuted(true)) ✅; mic siempre escucha ✅ (no se toca startMic). Global ✅ (KalyAgent ya es global en GastosApp).
- **Sin placeholders:** código completo (live.js diffs + KalyAgent.jsx completo).
- **Consistencia:** `setMuted(bool)` definido en T1 y usado en T2 (session.setMuted); mock de test (T2) agrega `setMuted: jest.fn()`; `onAgentTranscript` emitido por live.js (T1) y consumido por KalyAgent (T2); placeholder exacto `"Escribe a Kaly…"` igual en componente y test; labels `"Silenciar Kaly"`/`"Activar voz de Kaly"` iguales en componente y test.
