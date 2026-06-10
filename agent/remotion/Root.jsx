import React from "react";
import { Composition } from "remotion";
import { Reel, reelDurationInFrames } from "./Reel";

export const RemotionRoot = () => {
  return (
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
  );
};
