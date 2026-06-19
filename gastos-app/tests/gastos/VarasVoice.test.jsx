import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

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
  unlockAudio: jest.fn(),
  playTestTone: jest.fn(),
  audioDiag: jest.fn(() => ({ estado: 'running', sampleRate: 48000 })),
}));

jest.mock('../../src/gastos/varas/voice/tools.js', () => ({
  executeVarasVoiceTool: jest.fn().mockResolvedValue({ saldo: 1000 }),
  TOOL_DECLARATIONS: [{ name: 'balance' }],
  ACCION_NAMES: new Set(['marcar_pagado']),
}));

jest.mock('../../src/gastos/api', () => ({
  api: {
    agentSession: jest.fn().mockResolvedValue({ token: 't', model: 'm', context: {} }),
  },
}));

import { openLiveSession } from '../../src/gastos/kaly/live.js';
import { executeVarasVoiceTool } from '../../src/gastos/varas/voice/tools.js';
import { api } from '../../src/gastos/api';
import VarasVoice from '../../src/gastos/varas/VarasVoice.jsx';

beforeEach(() => {
  jest.clearAllMocks();
  lastLiveOpts = null;
  lastSession = null;
});

test('NO auto-arranca al montar (VARAS solo arranca al tocar la esfera)', () => {
  render(<VarasVoice />);
  expect(api.agentSession).not.toHaveBeenCalled();
  expect(openLiveSession).not.toHaveBeenCalled();
});

test('tocar la esfera → connecting → openLiveSession con voz Gacrux', async () => {
  render(<VarasVoice />);
  const orb = screen.getByRole('button', { name: 'VARAS' });
  await act(async () => { fireEvent.click(orb); });

  expect(api.agentSession).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));
  expect(lastLiveOpts.voice).toBe('Gacrux');
  expect(lastLiveOpts.audio).toBe(true);
  expect(typeof lastLiveOpts.systemPrompt).toBe('string');

  // driving state to live
  act(() => { lastLiveOpts.onState('live'); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'VARAS' })).toHaveAttribute('data-state', 'live'));
});

test('toolCall de lectura → executeVarasVoiceTool + sendToolResponse', async () => {
  render(<VarasVoice />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'VARAS' })); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));

  const fc = { id: 'c1', name: 'balance', args: {} };
  await act(async () => { await lastLiveOpts.onToolCall(fc); });

  expect(executeVarasVoiceTool).toHaveBeenCalledWith('balance', {});
  expect(lastSession.sendToolResponse).toHaveBeenCalledWith('c1', 'balance', { saldo: 1000 });
});

test('tocar de nuevo cierra la sesión', async () => {
  render(<VarasVoice />);
  const orb = screen.getByRole('button', { name: 'VARAS' });
  await act(async () => { fireEvent.click(orb); });
  await waitFor(() => expect(openLiveSession).toHaveBeenCalledTimes(1));
  act(() => { lastLiveOpts.onState('live'); });
  await act(async () => { fireEvent.click(orb); });
  expect(lastSession.close).toHaveBeenCalled();
});
