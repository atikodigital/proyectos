// VAD por energía (RMS) con "hangover": solo mandamos audio a Gemini cuando hay voz,
// pero seguimos un ratito después de la última voz para no cortar el final de las
// palabras. Baja fuerte el costo de Live (no se paga el silencio) sin perder nada.

export function rmsOf(frame) {
  let s = 0;
  for (let i = 0; i < frame.length; i += 1) s += frame[i] * frame[i];
  return Math.sqrt(s / (frame.length || 1));
}

export function createVadGate({ threshold = 0.01, hangoverMs = 800 } = {}) {
  let lastVoiced = -Infinity;
  return {
    feed(rms, now) {
      const voiced = rms >= threshold;
      if (voiced) lastVoiced = now;
      const send = voiced || (now - lastVoiced) <= hangoverMs;
      return { send, voiced };
    },
    lastVoicedAt() { return lastVoiced; },
  };
}
