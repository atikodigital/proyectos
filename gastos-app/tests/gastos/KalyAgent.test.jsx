/**
 * KalyAgent orchestrator tests.
 *
 * Strategy:
 *  - live.js: mock → capture the options passed to openLiveSession so tests
 *    can drive onState / onUserTranscript / onToolCall callbacks directly.
 *  - tools.js: mock → executeTool async → {ok:true}, TOOL_DECLARATIONS: []
 *  - api: mock → agentSession resolves with a deterministic session object.
 *  - Fake timers for silence / inactivity.
 *  - localStorage cleared in beforeEach.
 */

import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

// ── Mocks (must appear before the component import) ─────────────────────────

// Capture the last set of options passed to openLiveSession so tests can
// invoke the callbacks manually.
let lastLiveOpts = null;
let lastSession = null;

jest.mock('../../src/gastos/kaly/live.js', () => ({
  openLiveSession: jest.fn((opts) => {
    const session = {
      sendText: jest.fn(),
      sendToolResponse: jest.fn(),
      setMuted: jest.fn(),
      close: jest.fn(),
    };
    lastLiveOpts = opts;
    lastSession = session;
    return session;
  }),
}));

jest.mock('../../src/gastos/kaly/tools.js', () => ({
  executeTool: jest.fn().mockResolvedValue({ ok: true }),
  TOOL_DECLARATIONS: [],
}));

jest.mock('../../src/gastos/api', () => ({
  api: {
    agentSession: jest.fn().mockResolvedValue({
      token: 't',
      model: 'm',
      context: {
        onboarded: false,
        saludoHora: 'dia',
        nombre: '',
        trato: '',
        empresaNombre: 'X',
        resumen: {},
      },
    }),
    kalyAprender: jest.fn().mockResolvedValue({ creados: 0 }),
  },
}));

import { openLiveSession } from '../../src/gastos/kaly/live.js';
import { executeTool } from '../../src/gastos/kaly/tools.js';
import { api } from '../../src/gastos/api';
import KalyAgent from '../../src/gastos/kaly/KalyAgent.jsx';

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  lastLiveOpts = null;
  lastSession = null;
  localStorage.clear();
  sessionStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ── Test 1: first time — auto-start onboarding ───────────────────────────────

test('(1) first time (no localStorage) → auto-start onboarding: agentSession called, openLiveSession called, sendText contains "onboarding"', async () => {
  // No localStorage set — decideAutoStart returns 'onboarding'

  await act(async () => {
    render(<KalyAgent />);
  });

  // agentSession must have been called
  expect(api.agentSession).toHaveBeenCalledTimes(1);

  // openLiveSession must have been called
  expect(openLiveSession).toHaveBeenCalledTimes(1);

  // sendText must have been called with a text that relates to onboarding
  // We use the real instruccionInicial which returns 'Realiza el onboarding completo ahora.'
  expect(lastSession.sendText).toHaveBeenCalledTimes(1);
  const sentText = lastSession.sendText.mock.calls[0][0];
  expect(sentText.toLowerCase()).toContain('onboarding');
});

// ── Test 2: already onboarded + greeted today → auto-start anyway ──────────────────

test('(2) kaly_onboarded=1 + kaly_last_greet=today → auto-starts (greeted today does not prevent auto-start)', async () => {
  // Simulate having onboarded and greeted today
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('kaly_onboarded', '1');
  localStorage.setItem('kaly_last_greet', today);

  await act(async () => {
    render(<KalyAgent />);
  });

  // Auto-start should have happened
  expect(api.agentSession).toHaveBeenCalledTimes(1);
  expect(openLiveSession).toHaveBeenCalledTimes(1);
});

// ── Test 2b: bug real reportado — KalyAgent se remonta al navegar entre pestañas
// (vive dentro de una condición que depende de tab/pending/etc. en GastosApp), y
// cada remontaje repetía el saludo automático ("me saludó 3 veces"). La bandera de
// sessionStorage (memoria de corto plazo) debe evitarlo sin tocar ese layout.

test('(2b) remontar KalyAgent 3 veces en la misma sesión de app solo saluda 1 vez', async () => {
  localStorage.setItem('kaly_onboarded', '1');

  const { unmount: unmount1 } = render(<KalyAgent />);
  await act(async () => { await Promise.resolve(); });
  unmount1();

  const { unmount: unmount2 } = render(<KalyAgent />);
  await act(async () => { await Promise.resolve(); });
  unmount2();

  render(<KalyAgent />);
  await act(async () => { await Promise.resolve(); });

  // Solo el primer montaje debió disparar el saludo automático.
  expect(api.agentSession).toHaveBeenCalledTimes(1);
  expect(openLiveSession).toHaveBeenCalledTimes(1);
});

// ── Test 3: silence timer — onState('listening') then 30s → session.close ───

test('(3) silence: onState("listening") → advance 30000ms → session.close called', async () => {
  await act(async () => {
    render(<KalyAgent />);
  });

  // Wait for auto-start to complete and openLiveSession to be called
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  // Simulate KALY transitioning to 'listening' (finished speaking)
  act(() => {
    lastLiveOpts.onState('listening');
  });

  // Advance past the silence timeout
  act(() => {
    jest.advanceTimersByTime(SILENCE_MS_VALUE);
  });

  expect(lastSession.close).toHaveBeenCalled();
});

// Helper constant — import from logic or use inline value (5000)
const SILENCE_MS_VALUE = 5000;

// ── Test 4: negative transcript → 2.5s → session.close ──────────────────────

test('(4) onUserTranscript("no gracias") → advance 2500ms → session.close called', async () => {
  await act(async () => {
    render(<KalyAgent />);
  });

  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  // First arm the silence timer by entering listening state
  act(() => {
    lastLiveOpts.onState('listening');
  });

  // User says a negative phrase — this clears silence timer and arms 2.5s close
  act(() => {
    lastLiveOpts.onUserTranscript('no gracias');
  });

  // The silence timer should have been cancelled; close not yet called
  expect(lastSession.close).not.toHaveBeenCalled();

  // Advance 2500ms — KALY's goodbye window
  act(() => {
    jest.advanceTimersByTime(2500);
  });

  expect(lastSession.close).toHaveBeenCalled();
});

// ── Test 5: toolCall → executeTool + sendToolResponse ───────────────────────

test('(5) onToolCall({id, name:"guardar_preferencias", args}) → executeTool called + sendToolResponse called', async () => {
  await act(async () => {
    render(<KalyAgent />);
  });

  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  const fc = { id: '1', name: 'guardar_preferencias', args: { nombre: 'José', trato: 'señor' } };

  await act(async () => {
    await lastLiveOpts.onToolCall(fc);
  });

  expect(executeTool).toHaveBeenCalledWith(
    'guardar_preferencias',
    { nombre: 'José', trato: 'señor' },
    expect.objectContaining({ onPrefsSaved: expect.any(Function) }),
  );

  expect(lastSession.sendToolResponse).toHaveBeenCalledWith(
    '1',
    'guardar_preferencias',
    { ok: true },
  );
});

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
  expect(api.agentSession).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(lastSession.setMuted).toHaveBeenCalledWith(true));
});

test('(9) al cerrar con ≥4 turnos → llama api.kalyAprender con la transcripción acumulada', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  act(() => {
    lastLiveOpts.onUserTranscript('atiendo de 9 a 18');
    lastLiveOpts.onAgentTranscript('anotado');
    lastLiveOpts.onUserTranscript('vendo empanadas');
    lastLiveOpts.onAgentTranscript('genial');
  });

  act(() => { lastLiveOpts.onClose(); });

  expect(api.kalyAprender).toHaveBeenCalledTimes(1);
  const arg = api.kalyAprender.mock.calls[0][0];
  expect(Array.isArray(arg.transcripcion)).toBe(true);
  expect(arg.transcripcion.length).toBeGreaterThanOrEqual(4);
});

test('(10) al cerrar con <4 turnos → NO llama api.kalyAprender', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  act(() => {
    lastLiveOpts.onUserTranscript('hola');
    lastLiveOpts.onAgentTranscript('hola, ¿en qué te ayudo?');
  });
  act(() => { lastLiveOpts.onClose(); });

  expect(api.kalyAprender).not.toHaveBeenCalled();
});

test('(11) onToolCall pasa proponer y pedirEvidencia en el ctx de executeTool', async () => {
  await act(async () => { render(<KalyAgent />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));
  const fc = { id: '9', name: 'agregar_producto', args: { nombre: 'X', precio: 1000 } };
  await act(async () => { await lastLiveOpts.onToolCall(fc); });
  expect(executeTool).toHaveBeenCalledWith(
    'agregar_producto',
    { nombre: 'X', precio: 1000 },
    expect.objectContaining({ proponer: expect.any(Function), pedirEvidencia: expect.any(Function) }),
  );
});

test('(12) modo chat: pinta burbujas de usuario (derecha) y de kaly (izquierda)', async () => {
  await act(async () => { render(<KalyAgent chat />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  act(() => {
    lastLiveOpts.onUserTranscript('gasté 5000 en almuerzo');
    lastLiveOpts.onAgentTranscript('Anotado, ¿algo más?');
  });

  const userBubble = screen.getByText('gasté 5000 en almuerzo');
  const kalyBubble = screen.getByText('Anotado, ¿algo más?');
  expect(userBubble).toHaveAttribute('data-role', 'user');
  expect(kalyBubble).toHaveAttribute('data-role', 'kaly');
});

test('(13) modo chat: el saludo por voz queda escrito aunque la sesión de voz se cierre', async () => {
  await act(async () => { render(<KalyAgent chat />); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  // KALY conecta y saluda por voz → llega su transcripción.
  act(() => {
    lastLiveOpts.onState('live');
    lastLiveOpts.onAgentTranscript('Hola, buenos días. ¿En qué trabajamos hoy?');
  });
  expect(screen.getByText(/Hola, buenos días/)).toBeInTheDocument();

  // La sesión de voz se cierra (silencio) → en modo chat el historial NO se borra.
  act(() => { lastLiveOpts.onClose(); });
  expect(screen.getByText(/Hola, buenos días/)).toBeInTheDocument();
});
