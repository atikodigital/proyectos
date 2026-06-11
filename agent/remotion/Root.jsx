import React from "react";
import { Composition } from "remotion";
import { Reel, reelDurationInFrames } from "./Reel";
import { PostImage, postImageDimensions } from "./PostImage";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ scenes: [] }}
        calculateMetadata={({ props }) => ({
          durationInFrames: reelDurationInFrames(props.scenes),
        })}
      />
      <Composition
        id="PostImage"
        component={PostImage}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1350}
        defaultProps={{ headline: "", imageSrc: null, fallbackColor: "#0A1F3F", format: "post" }}
        calculateMetadata={({ props }) => postImageDimensions(props.format)}
      />
    </>
  );
};
