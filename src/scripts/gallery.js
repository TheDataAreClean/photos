// gallery.js — masonry grid rendering and infinite scroll
// Reads initial photo data from the inlined #gallery-data script tag, then fetches
// subsequent chunks from /data/photos-N.json via IntersectionObserver on #scroll-sentinel.
// Populates window.GalleryPhotos (consumed by lightbox.js and stack.js).
(function () {
  'use strict';

  const dataEl = document.getElementById('gallery-data');
  if (!dataEl) return;

  const gridEl = document.getElementById('gallery-root');
  if (!gridEl) return;

  const GAP               = 28;
  const MOBILE_BREAKPOINT = 560;

  // Live photo array — lightbox.js and stack.js read from this reference
  window.GalleryPhotos = JSON.parse(dataEl.textContent);

  // Infinite scroll state
  let loadedChunks = 1;
  const totalChunks = parseInt(gridEl.dataset.totalChunks || '1', 10);

  // ── Masonry layout ─────────────────────────────────────
  function masonry() {
    const cards = Array.from(gridEl.querySelectorAll('.photo-card'));
    if (!cards.length) return;

    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    if (isMobile) {
      cards.forEach(card => {
        card.style.position = '';
        card.style.width    = '';
        card.style.left     = '';
        card.style.top      = '';
      });
      gridEl.style.height = '';
      return;
    }

    const style    = getComputedStyle(gridEl);
    const pl       = parseFloat(style.paddingLeft);
    const pr       = parseFloat(style.paddingRight);
    const inner    = gridEl.offsetWidth - pl - pr;
    const colCount = inner >= 900 ? 3 : 2;
    const colWidth = (inner - GAP * (colCount - 1)) / colCount;
    const colTops  = new Array(colCount).fill(0);

    const heights = cards.map(card => card.offsetHeight);

    cards.forEach((card, i) => {
      const col = colTops.indexOf(Math.min(...colTops));
      const x   = pl + col * (colWidth + GAP);
      const y   = colTops[col];

      card.style.position = 'absolute';
      card.style.width    = colWidth + 'px';
      card.style.left     = x + 'px';
      card.style.top      = y + 'px';

      colTops[col] += heights[i] + GAP;
    });

    gridEl.style.height = Math.max(...colTops) - GAP + 'px';
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(masonry, 80);
  });

  // ── Attach click + keyboard events to a card ──────────
  function attachEvents(card, index) {
    card.addEventListener('click', () => {
      if (card.classList.contains('is-flipped')) return;
      window.Lightbox && window.Lightbox.open(index, card);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (card.classList.contains('is-flipped')) return;
        window.Lightbox && window.Lightbox.open(index, card);
      }
    });
  }

  // ── Append an array of photos as cards ────────────────
  function appendCards(newPhotos, startIndex) {
    const fragment = document.createDocumentFragment();
    newPhotos.forEach((photo, i) => {
      const index = startIndex + i;
      const card  = window.GalleryCore.makeCard(photo, index);
      // Re-attach masonry trigger — GalleryCore.makeCard is masonry-agnostic
      const img = card.querySelector('img');
      if (img) {
        img.addEventListener('load', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(masonry, 80);
        }, { once: true });
      }
      attachEvents(card, index);
      fragment.appendChild(card);
    });
    gridEl.appendChild(fragment);
    requestAnimationFrame(() => requestAnimationFrame(masonry));
  }

  // ── Infinite scroll ────────────────────────────────────
  function setupInfiniteScroll() {
    if (loadedChunks >= totalChunks) return;

    const sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) return;

    let fetching = false;

    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || fetching) return;
      if (loadedChunks >= totalChunks) { observer.disconnect(); return; }

      fetching = true;
      loadedChunks++;
      const url = `/data/photos-${loadedChunks}.json`;

      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(newPhotos => {
          const startIndex = window.GalleryPhotos.length;
          window.GalleryPhotos.push(...newPhotos);
          appendCards(newPhotos, startIndex);
          window.StackView && window.StackView.onChunkLoaded();
          fetching = false;
          if (loadedChunks >= totalChunks) observer.disconnect();
        })
        .catch(err => {
          console.warn('Chunk load failed:', err);
          loadedChunks--;  // allow retry on next scroll
          fetching = false;
        });
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
  }

  // ── Initial render ─────────────────────────────────────
  function init() {
    window.ViewState && window.ViewState.applyShuffle();

    if (window.GalleryPhotos.length === 0) {
      gridEl.classList.remove('is-loading');
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'No photos yet — drop some into local/ and run npm run build.';
      gridEl.parentElement.appendChild(empty);
      return;
    }

    if (window.ViewState && window.ViewState.getView() === 'stack') {
      // stack.js self-initialises after it loads; skip grid render
      gridEl.classList.remove('is-loading');
    } else {
      appendCards(window.GalleryPhotos, 0);
      gridEl.classList.remove('is-loading');
      gridEl.classList.add('is-ready');
    }

    setupInfiniteScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
