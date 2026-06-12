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

// ── Test 2: already onboarded + greeted today → no auto-start; tap starts manually ──

test('(2) kaly_onboarded=1 + kaly_last_greet=today → no auto-start; tap orb → starts (agentSession called)', async () => {
  // Simulate having onboarded and greeted today
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('kaly_onboarded', '1');
  localStorage.setItem('kaly_last_greet', today);

  await act(async () => {
    render(<KalyAgent />);
  });

  // No auto-start should have happened
  expect(api.agentSession).not.toHaveBeenCalled();
  expect(openLiveSession).not.toHaveBeenCalled();

  // Tap the orb (state is 'off') → manual start
  const btn = screen.getByRole('button', { name: 'K.A.L.Y.' });
  await act(async () => {
    fireEvent.click(btn);
  });

  expect(api.agentSession).toHaveBeenCalledTimes(1);
  expect(openLiveSession).toHaveBeenCalledTimes(1);
});

// ── Test 3: silence timer — onState('listening') then 5s → session.close ────

test('(3) silence: onState("listening") → advance 5000ms → session.close called', async () => {
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
