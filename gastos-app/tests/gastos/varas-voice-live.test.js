import { openLiveSession } from '../../src/gastos/kaly/live';

class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.send = jest.fn();
    this.close = jest.fn();
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }
}

function setupVoz(voice) {
  const fake = new FakeWS('');
  const opts = {
    token: 't',
    model: 'm',
    systemPrompt: 'SP',
    tools: [{ name: 'x' }],
    audio: false,
    wsFactory: (url) => { fake.url = url; return fake; },
  };
  if (voice !== undefined) opts.voice = voice;
  openLiveSession(opts);
  return fake;
}

test('voice:"Gacrux" → el setup enviado al onopen incluye voiceName:"Gacrux"', () => {
  const fake = setupVoz('Gacrux');
  fake.onopen();
  const sent = JSON.parse(fake.send.mock.calls[0][0]);
  expect(sent.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Gacrux');
});

test('sin voice → el setup usa "Charon" por defecto (KALY intacto)', () => {
  const fake = setupVoz();
  fake.onopen();
  const sent = JSON.parse(fake.send.mock.calls[0][0]);
  expect(sent.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
});
