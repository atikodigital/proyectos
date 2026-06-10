import React from "react";
import { AbsoluteFill, Sequence, Img, Audio, staticFile, interpolate, useCurrentFrame } from "remotion";

const FPS = 30;
const msToFrames = (ms) => Math.max(1, Math.round((ms / 1000) * FPS));

function Scene({ scene, sceneDurationInFrames }) {
  const frame = useCurrentFrame();
  // zoom suave (Ken Burns) a lo largo de ESTA escena
  const scale = interpolate(frame, [0, sceneDurationInFrames], [1, 1.08]);
  return (
    <AbsoluteFill style={{ backgroundColor: scene.fallbackColor || "#0A1F3F" }}>
      {scene.imageSrc ? (
        <Img
          src={staticFile(scene.imageSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
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
      {scene.audioSrc ? <Audio src={staticFile(scene.audioSrc)} /> : null}
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
            <Scene scene={scene} sceneDurationInFrames={dur} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const reelDurationInFrames = (scenes = []) =>
  scenes.reduce((acc, s) => acc + msToFrames(s.durationMs || 2500), 0) || FPS;
