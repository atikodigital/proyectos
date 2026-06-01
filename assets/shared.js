/* ═══════════════════════════════════════════════════════════════════
   Atiko · shared.js
   Efectos cinematográficos para páginas internas
   ───────────────────────────────────────────────────────────────────
   1. Spotlight cards (mouse follow)
   2. Reveal on scroll (IntersectionObserver)
   3. Sticky header solid on scroll
   4. Magnetic buttons (sutil)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── 1. Spotlight cards ────────────────────────────────────────
  const spotlightTargets = document.querySelectorAll('.card, .blog-card, .price-card');
  spotlightTargets.forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--spot-x', x + '%');
      el.style.setProperty('--spot-y', y + '%');
    });
  });

  // ─── 2. Reveal on scroll ───────────────────────────────────────
  // Auto-add .reveal to common elements if no flag
  const autoReveal = document.querySelectorAll(
    '.section .section-header, .section .cards > *, .section .prose > h2, ' +
    '.section .pricing-mini > *, .section .steps > *, .section .compare-table, ' +
    '.section .faq, .cta-block, .blog-grid > *'
  );
  autoReveal.forEach((el, i) => {
    if (!el.classList.contains('reveal')) el.classList.add('reveal');
    if (i % 4 === 1) el.classList.add('d1');
    if (i % 4 === 2) el.classList.add('d2');
    if (i % 4 === 3) el.classList.add('d3');
  });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  } else {
    // Fallback: mostrar todo si no hay IO
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  // ─── 3. Header solid on scroll ─────────────────────────────────
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 30) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ─── 4. Magnetic CTA (sutil) ───────────────────────────────────
  const magneticTargets = document.querySelectorAll('.btn-primary');
  magneticTargets.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.08}px, ${y * 0.12 - 2}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

  // ─── 5. Smooth scroll para anclas internas ─────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#' || href.length < 2) return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();
