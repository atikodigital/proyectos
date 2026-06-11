import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";

// Dimensiones por formato: post/carousel = 4:5 feed; story = 9:16.
export const postImageDimensions = (format) =>
  format === "story" ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };

export const PostImage = ({ headline, imageSrc, fallbackColor, format = "post" }) => {
  const fontSize = format === "story" ? 84 : 72;
  return (
    <AbsoluteFill style={{ backgroundColor: fallbackColor || "#0A1F3F" }}>
      {imageSrc ? (
        <Img
          src={staticFile(imageSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      {/* gradiente inferior para legibilidad del titular */}
      <AbsoluteFill style={{ background: "linear-gradient(transparent 45%, rgba(0,0,0,0.82))" }} />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: 80 }}>
        <div
          style={{
            color: "white",
            fontFamily: "Arial, sans-serif",
            fontWeight: 900,
            fontSize,
            lineHeight: 1.12,
            textTransform: "uppercase",
            textShadow: "0 3px 16px rgba(0,0,0,0.9)",
          }}
        >
          {headline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
