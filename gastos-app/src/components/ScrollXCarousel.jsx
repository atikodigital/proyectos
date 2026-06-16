// Carrusel horizontal guiado por el scroll vertical (adaptado de motion/react a JS puro).
import * as React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

function cn() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

const Ctx = React.createContext(null);
function useCtx() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error('ScrollXCarousel parts must be used within ScrollXCarousel');
  return c;
}

export function ScrollXCarousel({ children, className, ...props }) {
  const ref = React.useRef(null);
  const { scrollYProgress } = useScroll({ target: ref });
  return (
    <Ctx.Provider value={{ scrollYProgress }}>
      <div ref={ref} className={cn('relative w-full max-w-full', className)} {...props}>{children}</div>
    </Ctx.Provider>
  );
}

export function ScrollXCarouselContainer({ className, ...props }) {
  return <div className={cn('sticky overflow-hidden w-full top-0 left-0', className)} {...props} />;
}

export function ScrollXCarouselWrap({ className, style, xRange = ['0%', '-80%'], ...props }) {
  const { scrollYProgress } = useCtx();
  const x = useTransform(scrollYProgress, [0, 1], xRange);
  return <motion.div className={cn('w-fit', className)} style={{ x, ...style }} {...props} />;
}

export function ScrollXCarouselProgress({ className, style, progressStyle, ...props }) {
  const { scrollYProgress } = useCtx();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div className={cn('max-w-full overflow-hidden', className)} {...props}>
      <motion.div className={cn('origin-left', progressStyle)} style={{ scaleX, ...style }} />
    </div>
  );
}
