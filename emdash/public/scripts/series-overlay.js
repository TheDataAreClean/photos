// series-overlay.js — series viewer overlay
// Exposes window.SeriesOverlay: { open, close }
(function () {
  'use strict';

  let currentSlug = null;
  let currentIdx  = 0;
  let isOpen      = false;
  let triggerEl   = null;

  const overlay    = document.getElementById('series-overlay');
  const titleEl    = document.getElementById('series-overlay-title');
  const counterEl  = document.getElementById('series-overlay-counter');
  const printEl    = document.getElementById('series-overlay-print');
  const imgEl      = document.getElementById('series-overlay-img');
  const capTitleEl = document.getElementById('series-overlay-cap-title');
  const capDateEl  = document.getElementById('series-overlay-cap-date');
  const prevBtn    = document.getElementById('series-overlay-prev');
  const nextBtn    = document.getElementById('series-overlay-next');
  const closeBtn   = document.getElementById('series-overlay-close');
  const stripEl    = document.getElementById('series-overlay-strip');

  if (!overlay) return;

  // ── Open ──────────────────────────────────────────────
  function open(slug, opener) {
    const series = window.GallerySeries && window.GallerySeries[slug];
    if (!series || !series.photos.length) return;

    currentSlug = slug;
    currentIdx  = 0;
    isOpen      = true;
    triggerEl   = opener || document.activeElement;

    titleEl.textContent = series.title || slug;
    buildStrip(series);

    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    showPhoto(0);
    closeBtn.focus();
  }

  // ── Close ─────────────────────────────────────────────
  function close() {
    isOpen      = false;
    currentSlug = null;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';

    if (triggerEl && document.contains(triggerEl)) triggerEl.focus();
    triggerEl = null;
  }

  // ── Build thumbnail strip ─────────────────────────────
  function buildStrip(series) {
    stripEl.innerHTML = '';
    series.photos.forEach(({ photo }, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'series-overlay__thumb';
      thumb.dataset.index = i;
      thumb.tabIndex = 0;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `Photo ${i + 1} of ${series.photos.length}`);

      if (photo.url?.thumb) {
        const img = document.createElement('img');
        img.src       = photo.url.thumb;
        img.alt       = '';
        img.loading   = 'lazy';
        img.draggable = false;
        thumb.appendChild(img);
      }

      thumb.addEventListener('click', () => showPhoto(i));
      thumb.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showPhoto(i);
        }
      });
      stripEl.appendChild(thumb);
    });
  }

  // ── Show photo at index ───────────────────────────────
  function showPhoto(idx) {
    const series = window.GallerySeries[currentSlug];
    if (!series) return;

    const { photo } = series.photos[idx];
    currentIdx = idx;

    // Counter
    counterEl.textContent = `${idx + 1} of ${series.photos.length}`;

    // Fade out → swap src → fade in
    imgEl.style.opacity = '0';

    const src = photo.url?.display || photo.url?.thumb || '';
    if (src) {
      imgEl.classList.add('is-loading');
      const loader = new Image();
      loader.onload = () => {
        imgEl.src     = src;
        imgEl.alt     = photo.altText || photo.title || '';
        imgEl.style.opacity = '1';
        imgEl.classList.remove('is-loading');
      };
      loader.onerror = () => {
        imgEl.style.opacity = '1';
        imgEl.classList.remove('is-loading');
      };
      loader.src = src;
    }

    // Caption
    capTitleEl.textContent = photo.title || '';
    if (photo.dateTaken) {
      const d = new Date(photo.dateTaken);
      capDateEl.textContent = isNaN(d) ? '' : d.toLocaleDateString('en-US', {
        month: 'short', year: 'numeric', timeZone: 'UTC',
      });
    } else {
      capDateEl.textContent = '';
    }

    // Thumbnail strip active state
    stripEl.querySelectorAll('.series-overlay__thumb').forEach((t, i) => {
      t.classList.toggle('is-active', i === idx);
    });
    const active = stripEl.querySelector('.series-overlay__thumb.is-active');
    if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });

    // Nav button state
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === series.photos.length - 1;
  }

  // ── Click print → open lightbox ───────────────────────
  printEl.addEventListener('click', () => {
    const series = currentSlug && window.GallerySeries[currentSlug];
    if (!series) return;
    const { _idx } = series.photos[currentIdx];
    if (typeof _idx === 'number' && window.Lightbox) {
      close();
      window.Lightbox.open(_idx, null);
    }
  });

  // ── Navigation ────────────────────────────────────────
  prevBtn.addEventListener('click', () => showPhoto(currentIdx - 1));
  nextBtn.addEventListener('click', () => showPhoto(currentIdx + 1));
  closeBtn.addEventListener('click', close);

  // Close on backdrop click (not on inner content)
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (!isOpen) return;
    if (e.key === 'Escape')     { close(); return; }
    if (e.key === 'ArrowLeft')  { if (currentIdx > 0) showPhoto(currentIdx - 1); return; }
    if (e.key === 'ArrowRight') {
      const series = window.GallerySeries[currentSlug];
      if (series && currentIdx < series.photos.length - 1) showPhoto(currentIdx + 1);
    }
  });

  window.SeriesOverlay = { open, close };
})();
