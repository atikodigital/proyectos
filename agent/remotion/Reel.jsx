import React from "react";
import { AbsoluteFill, Sequence, Img, Audio, OffthreadVideo, staticFile, interpolate, useCurrentFrame } from "remotion";

const FPS = 30;
const msToFrames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

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
      <AbsoluteFill style={{ background: "linear-gradient(transparent 55%, rgba(0,0,0,0.75))" }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: 80 }}>
        <div
          style={{
            color: "white", fontFamily: "Arial, sans-serif", fontWeight: 800,
            fontSize: 64, lineHeight: 1.15, textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          {scene.text}
        </div>
      </AbsoluteFill>
      {scene.audioSrc && !scene.videoSrc ? <Audio src={staticFile(scene.audioSrc)} /> : null}
    </AbsoluteFill>
  );
}

export const Reel = ({ scenes = [] }) => {
  let start = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A1F3F" }}>
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
