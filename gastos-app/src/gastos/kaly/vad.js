// VAD por energía (RMS) con "hangover": solo mandamos audio a Gemini cuando hay voz,
// pero seguimos mandando un ratito después de la última voz para no cortar el final de
// las palabras. Baja fuerte el costo de Live (no se paga el silencio/ruido de fondo)
// sin perder nada de lo que el usuario dice.

export function rmsOf(frame) {
  let s = 0;
  for (let i = 0; i < frame.length; i += 1) s += frame[i] * frame[i];
  return Math.sqrt(s / (frame.length || 1));
}

// gate.feed(rms, now) → { send, voiced }
//   voiced: el frame supera el umbral (hay voz).
//   send:   hay que enviarlo (voz, o dentro de la ventana de hangover tras la última voz).
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
