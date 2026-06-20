import React, { useEffect, useRef, useState } from 'react';

const HQ_COUNT = 160;
const FK4_COUNT = 245;
const WA_COUNT = 144;

export default function ScrollBackground() {
  const canvasRef = useRef(null);
  const [opacity, setOpacity] = useState(0);

  // References to preloaded image objects
  const hqImages = useRef([]);
  const fk4Images = useRef([]);
  const waImages = useRef([]);

  // Store current target image source and index
  const renderState = useRef({
    src: 'hq',
    idx: 0,
  });

  useEffect(() => {
    // 1. Resizing & Canvas Setup
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // 2. Preloader
    // Preload hq critical frames (even numbers) first, then remaining, then others
    const loadHQ = () => {
      for (let i = 0; i < HQ_COUNT; i++) {
        const img = new Image();
        img.src = `/assets/frames/hq/frame_${String(i + 1).padStart(3, '0')}.jpg`;
        hqImages.current[i] = img;
      }
    };

    const loadFK4 = () => {
      for (let i = 0; i < FK4_COUNT; i++) {
        const img = new Image();
        img.src = `/assets/frames/fk4/frame_${String(i + 1).padStart(3, '0')}.jpg`;
        fk4Images.current[i] = img;
      }
    };

    const loadWA = () => {
      for (let i = 0; i < WA_COUNT; i++) {
        const img = new Image();
        img.src = `/assets/frames/wa/frame_${String(i + 1).padStart(3, '0')}.jpg`;
        waImages.current[i] = img;
      }
    };

    // Load progressively to avoid blocking the main thread
    loadHQ();
    setTimeout(loadFK4, 200);
    setTimeout(loadWA, 400);

    // 3. Render Loop
    let lastKey = '';
    const filters = {
      hq: 'contrast(1.06) saturate(1.14) brightness(1.02)',
      fk4: 'contrast(1.04) saturate(1.10) brightness(1.01)',
      wa: 'contrast(1.16) saturate(1.28) brightness(1.03)',
    };

    let animationFrameId;
    const draw = () => {
      const state = renderState.current;
      const key = state.src + state.idx;

      if (key !== lastKey) {
        let imgArr = [];
        if (state.src === 'hq') imgArr = hqImages.current;
        else if (state.src === 'fk4') imgArr = fk4Images.current;
        else if (state.src === 'wa') imgArr = waImages.current;

        const img = imgArr[state.idx];
        if (img && img.complete && img.naturalWidth) {
          canvas.style.filter = filters[state.src] || '';
          
          const cw = canvas.width;
          const ch = canvas.height;
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;

          const baseScale = Math.max(cw / iw, ch / ih);
          const sc = baseScale;

          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(img, (cw - iw * sc) / 2, (ch - ih * sc) / 2, iw * sc, ih * sc);
          lastKey = key;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    // 4. Scroll Listener
    const handleScroll = () => {
      const scrollY = window.scrollY;

      const hero1 = document.getElementById('hero-section');
      const hero2 = document.getElementById('dos-familias-section');
      const hero3 = document.getElementById('como-funciona-section');
      const hero4 = document.getElementById('features-section');

      const h1Height = hero1 ? hero1.offsetHeight : window.innerHeight;
      const h2Height = hero2 ? hero2.offsetHeight : window.innerHeight;
      const h3Height = hero3 ? hero3.offsetHeight : window.innerHeight;
      const h4Height = hero4 ? hero4.offsetHeight : window.innerHeight;

      if (scrollY < h1Height) {
        // Hero 1 (white theme): hide canvas
        setOpacity(0);
      } else if (scrollY < h1Height + h2Height) {
        // Hero 2 (Dos Familias): animate hq frames
        const p = (scrollY - h1Height) / h2Height;
        renderState.current = {
          src: 'hq',
          idx: Math.min(Math.floor(p * HQ_COUNT), HQ_COUNT - 1),
        };
        // Fade in from 0 to 1 over the first 150px
        const op = Math.min((scrollY - h1Height) / 150, 1);
        setOpacity(op);
      } else if (scrollY < h1Height + h2Height + h3Height) {
        // Hero 3 (Como funciona): animate fk4 frames
        const p = (scrollY - h1Height - h2Height) / h3Height;
        renderState.current = {
          src: 'fk4',
          idx: Math.min(Math.floor(p * FK4_COUNT), FK4_COUNT - 1),
        };
        setOpacity(1);
      } else if (scrollY < h1Height + h2Height + h3Height + h4Height) {
        // Hero 4 (Features): animate wa frames
        const p = (scrollY - h1Height - h2Height - h3Height) / h4Height;
        renderState.current = {
          src: 'wa',
          idx: Math.min(Math.floor(p * WA_COUNT), WA_COUNT - 1),
        };
        setOpacity(1);
      } else {
        // After Hero 4: fade out to 0 over 200px
        const fadeStart = h1Height + h2Height + h3Height + h4Height;
        const fadeEnd = fadeStart + 200;
        if (scrollY < fadeEnd) {
          setOpacity(Math.max(0, 1 - (scrollY - fadeStart) / 200));
        } else {
          setOpacity(0);
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Run once to set initial state
    handleScroll();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        id="bg-canvas"
        className="fixed inset-0 -z-10 w-full h-full pointer-events-none transition-opacity duration-300"
        style={{ opacity }}
      />
      {/* Dark vignette to overlay on top of canvas for high readability */}
      <div
        className="fixed inset-0 -z-10 w-full h-full pointer-events-none transition-opacity duration-300 bg-radial-gradient"
        style={{
          opacity: opacity * 0.85,
          background: 'radial-gradient(ellipse 85% 85% at 50% 48%, transparent 42%, rgba(0,0,0,0.65) 100%)',
        }}
      />
    </>
  );
}
