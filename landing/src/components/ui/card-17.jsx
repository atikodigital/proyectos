import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const LocationCard = ({
  city,
  address,
  imageUrl,
  directionsUrl,
  className,
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    ["25deg", "-25deg"]
  );
  const rotateY = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    ["-25deg", "25deg"]
  );

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={cn(
        "relative w-full h-80 rounded-xl bg-cover bg-center group",
        "shadow-lg transition-all duration-300 hover:shadow-2xl hover:shadow-[0_0_40px_-10px_rgba(252,163,17,0.35)]",
        className
      )}
    >
      <div
        style={{
          transform: "translateZ(110px)",
          transformStyle: "preserve-3d",
          backgroundImage: `url(${imageUrl})`,
        }}
        className="absolute inset-4 grid h-[calc(100%-2rem)] w-[calc(100%-2rem)] place-content-end rounded-xl bg-cover bg-center shadow-lg border border-white/10 transition-colors duration-300 group-hover:border-[#FCA311]/30"
      >
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Content */}
        <div 
          style={{ transform: "translateZ(70px)" }}
          className="p-6 text-white flex justify-between items-end w-full"
        >
          <div>
            <h3 className="text-xl font-bold font-sans">{city}</h3>
            <p className="text-xs text-[#E5E5E5] mt-1 font-sans leading-normal">{address}</p>
          </div>
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="ml-4 shrink-0">
            <Button 
              variant="default"
              aria-label={`Explorar ${city}`}
              className="font-sans font-bold text-xs h-8 px-3"
            >
              Explorar
            </Button>
          </a>
        </div>
      </div>
    </motion.div>
  );
};
