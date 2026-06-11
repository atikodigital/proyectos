import React from "react";
import { AbsoluteFill, Sequence, Img, Audio, OffthreadVideo, staticFile, interpolate, useCurrentFrame } from "remotion";

const FPS = 30;
const msToFrames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

// Subtítulos karaoke: muestra el chunk activo y resalta la palabra que "suena" ahora.
function Captions({ scene }) {
  const frame = useCurrentFrame();
  const timeMs = (frame / FPS) * 1000;
  const chunks = scene.captions || [];
  if (chunks.length === 0) {
    // sin captions: cae al texto estático de la escena
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: 80 }}>
        <div style={{ color: "white", fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 64, lineHeight: 1.15, textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
          {scene.text}
        </div>
      </AbsoluteFill>
    );
  }
  let chunk = chunks.find((c) => timeMs >= c.startMs && timeMs < c.endMs);
  if (!chunk) chunk = timeMs < chunks[0].startMs ? chunks[0] : chunks[chunks.length - 1];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 70 }}>
      <div
        style={{
          display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px 18px",
          fontFamily: "Arial, sans-serif", fontWeight: 900, fontSize: 78, lineHeight: 1.1,
          textAlign: "center", textTransform: "uppercase",
        }}
      >
        {chunk.words.map((w, i) => {
          const active = timeMs >= w.startMs && timeMs < w.endMs;
          return (
            <span
              key={i}
              style={{
                color: active ? "#FFD400" : "white",
                transform: active ? "scale(1.12)" : "scale(1)",
                display: "inline-block",
                textShadow: "0 3px 14px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)",
                WebkitTextStroke: "2px rgba(0,0,0,0.55)",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function Scene({ scene, sceneDurationInFrames, index }) {
  const frame = useCurrentFrame();
  // Ken Burns VARIADO por escena (alterna zoom-in/out + paneo) para que no se vea estático/muerto.
  const d = sceneDurationInFrames;
  const zoomIn = index % 2 === 0;
  const scale = zoomIn
    ? interpolate(frame, [0, d], [1.0, 1.14], { extrapolateRight: "clamp" })
    : interpolate(frame, [0, d], [1.14, 1.0], { extrapolateRight: "clamp" });
  const panDir = index % 4 < 2 ? 1 : -1; // alterna izquierda/derecha cada 2 escenas
  const panX = interpolate(frame, [0, d], [0, panDir * 40], { extrapolateRight: "clamp" });
  const imgTransform = `scale(${scale}) translateX(${panX}px)`;
  // Fade-in suave al entrar la escena (transición sin cortes secos).
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: scene.fallbackColor || "#0A1F3F", opacity }}>
      {scene.videoSrc ? (
        <OffthreadVideo
          src={staticFile(scene.videoSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : scene.imageSrc ? (
        <Img
          src={staticFile(scene.imageSrc)}
          style={{ width: "110%", height: "110%", marginLeft: "-5%", marginTop: "-5%", objectFit: "cover", transform: imgTransform }}
        />
      ) : null}
      {/* overlay oscuro para legibilidad del texto */}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 50%, rgba(0,0,0,0.78))" }} />
      <Captions scene={scene} />
      {scene.audioSrc && !scene.videoSrc ? <Audio src={staticFile(scene.audioSrc)} /> : null}
    </AbsoluteFill>
  );
}

export const Reel = ({ scenes = [], musicSrc }) => {
  let start = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A1F3F" }}>
      {musicSrc ? <Audio src={staticFile(musicSrc)} volume={0.14} loop /> : null}
      {scenes.map((scene, i) => {
        const dur = msToFrames(scene.durationMs || 2500);
        const from = start;
        start += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <Scene scene={scene} sceneDurationInFrames={dur} index={i} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const reelDurationInFrames = (scenes = []) =>
  scenes.reduce((acc, s) => acc + msToFrames(s.durationMs || 2500), 0) || FPS;
