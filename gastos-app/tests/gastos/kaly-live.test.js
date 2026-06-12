import { openLiveSession } from '../../src/gastos/kaly/live';

// ── FakeWS ───────────────────────────────────────────────────────────────────

class FakeWS {
  constructor(url) {
    this.url = url;
    this.send = jest.fn();
    this.close = jest.fn();
    // callbacks to be set by openLiveSession
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  // Helper: simulate an incoming message
  receive(obj) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  const fake = new FakeWS('');
  const onState = jest.fn();
  const onToolCall = jest.fn();
  const onUserTranscript = jest.fn();
  const onClose = jest.fn();

  const session = openLiveSession({
    token: 't',
    model: 'm',
    systemPrompt: 'SP',
    tools: [{ name: 'x' }],
    audio: false,
    wsFactory: (url) => { fake.url = url; return fake; },
    onState,
    onToolCall,
    onUserTranscript,
    onClose,
    ...overrides,
  });

  return { fake, session, onState, onToolCall, onUserTranscript, onClose };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('URL contains the ephemeral token as key', () => {
  const { fake } = makeSession();
  expect(fake.url).toContain('key=t');
});

test('on open, sends setup with model, Charon, systemInstruction, tools, inputAudioTranscription', () => {
  const { fake } = makeSession();

  // trigger open
  fake.onopen();

  expect(fake.send).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(fake.send.mock.calls[0][0]);

  expect(sent.setup).toBeDefined();
  expect(sent.setup.model).toBe('models/m');
  expect(sent.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
  expect(sent.setup.systemInstruction.parts[0].text).toBe('SP');
  expect(sent.setup.tools[0].functionDeclarations).toEqual([{ name: 'x' }]);
  expect(sent.setup.inputAudioTranscription).toBeDefined();
});

test('setupComplete message → onState("live")', async () => {
  const { fake, onState } = makeSession();
  fake.onopen();

  fake.receive({ setupComplete: true });

  // give micros time for the async onmessage to settle (audio:false so no actual mic)
  await new Promise((r) => setTimeout(r, 0));

  expect(onState).toHaveBeenCalledWith('live');
});

test('toolCall message → onToolCall called with the functionCall', async () => {
  const { fake, onToolCall } = makeSession();
  fake.onopen();
  fake.receive({ setupComplete: true });
  await new Promise((r) => setTimeout(r, 0));

  const fc = { id: 'id1', name: 'guardar_preferencias', args: { nombre: 'José', trato: 'señor' } };
  fake.receive({ toolCall: { functionCalls: [fc] } });
  await new Promise((r) => setTimeout(r, 0));

  expect(onToolCall).toHaveBeenCalledWith(fc);
});

test('serverContent.inputTranscription → onUserTranscript called with the text', async () => {
  const { fake, onUserTranscript } = makeSession();
  fake.onopen();
  fake.receive({ setupComplete: true });
  await new Promise((r) => setTimeout(r, 0));

  fake.receive({ serverContent: { inputTranscription: { text: 'hola kaly' } } });
  await new Promise((r) => setTimeout(r, 0));

  expect(onUserTranscript).toHaveBeenCalledWith('hola kaly');
});

test('sendToolResponse sends functionResponses', () => {
  const { fake, session } = makeSession();
  fake.onopen();

  session.sendToolResponse('id1', 'guardar_preferencias', { ok: true });

  const last = JSON.parse(fake.send.mock.calls[fake.send.mock.calls.length - 1][0]);
  expect(last.toolResponse.functionResponses).toEqual([
    { id: 'id1', name: 'guardar_preferencias', response: { ok: true } },
  ]);
});

test('close() calls ws.close and fires onClose exactly once', () => {
  const { fake, session, onClose } = makeSession();
  fake.onopen();

  session.close();
  // simulate the ws acknowledging the close
  if (fake.onclose) fake.onclose();

  expect(fake.close).toHaveBeenCalledTimes(1);
  // onClose is fired from ws.onclose handler (cleanup guard ensures it's once)
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('sendText sends clientContent with the text', () => {
  const { fake, session } = makeSession();
  fake.onopen();

  session.sendText('listar mis gastos');

  const last = JSON.parse(fake.send.mock.calls[fake.send.mock.calls.length - 1][0]);
  expect(last.clientContent.turns[0].parts[0].text).toBe('listar mis gastos');
  expect(last.clientContent.turnComplete).toBe(true);
});

test('serverContent.turnComplete without player → onState("listening")', async () => {
  const { fake, onState } = makeSession();
  fake.onopen();
  fake.receive({ setupComplete: true });
  await new Promise((r) => setTimeout(r, 0));

  fake.receive({ serverContent: { turnComplete: true } });
  await new Promise((r) => setTimeout(r, 0));

  expect(onState).toHaveBeenCalledWith('listening');
});

test('interrupted → onState("listening")', async () => {
  const { fake, onState } = makeSession();
  fake.onopen();
  fake.receive({ setupComplete: true });
  await new Promise((r) => setTimeout(r, 0));

  fake.receive({ serverContent: { interrupted: true } });
  await new Promise((r) => setTimeout(r, 0));

  expect(onState).toHaveBeenCalledWith('listening');
});
