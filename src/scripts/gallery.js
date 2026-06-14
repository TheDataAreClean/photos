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

  // Shuffle immediately — stack.js self-inits before DOMContentLoaded fires,
  // so applyShuffle() must run at parse time, not inside the deferred init().
  window.ViewState && window.ViewState.applyShuffle();

  // Infinite scroll state
  let loadedChunks = 1;
  const totalChunks = parseInt(gridEl.dataset.totalChunks || '1', 10);

  // ── Masonry layout ─────────────────────────────────────
  function masonry() {
    const cards = Array.from(gridEl.querySelectorAll('.photo-card, .series-card'));
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

    // Set widths before reading heights — cards retain the previous colWidth as an
    // inline style between masonry calls, so reading offsetHeight before updating
    // width gives stale measurements and causes overlaps/gaps on resize.
    cards.forEach(card => {
      card.style.position = 'absolute';
      card.style.width    = colWidth + 'px';
    });

    const heights = cards.map(card => card.offsetHeight);

    cards.forEach((card, i) => {
      const col = colTops.indexOf(Math.min(...colTops));
      const x   = pl + col * (colWidth + GAP);
      const y   = colTops[col];

      card.style.left = x + 'px';
      card.style.top  = y + 'px';

      colTops[col] += heights[i] + GAP;
    });

    gridEl.style.height = Math.max(...colTops) - GAP + 'px';
  }

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(masonry, 80);
  }).observe(gridEl);

  // ── Series grouping ────────────────────────────────────
  // window.GallerySeries: { [slug]: { slug, title, description, coverPhoto, photos: [{photo, _idx}] } }
  // Built incrementally as chunks load; photos sorted by seriesOrder within each series.
  window.GallerySeries = window.GallerySeries || {};

  function mergeSeries(newPhotos, startIndex) {
    const meta = window.GallerySeriesMeta || {};
    newPhotos.forEach((photo, i) => {
      if (!photo.series) return;
      const slug = photo.series;
      if (!window.GallerySeries[slug]) {
        window.GallerySeries[slug] = {
          slug,
          title:       meta[slug]?.title       || slug,
          description: meta[slug]?.description || null,
          coverPhoto:  meta[slug]?.coverPhoto  || null,
          photos: [],
        };
      }
      window.GallerySeries[slug].photos.push({ photo, _idx: startIndex + i });
    });
    // Re-sort each touched series by seriesOrder
    const touchedSlugs = [...new Set(newPhotos.filter(p => p.series).map(p => p.series))];
    touchedSlugs.forEach(slug => {
      window.GallerySeries[slug].photos.sort(
        (a, b) => (a.photo.seriesOrder ?? 9999) - (b.photo.seriesOrder ?? 9999)
      );
    });
  }

  // ── Attach click + keyboard events to a series card ───
  function attachSeriesEvents(card, slug) {
    function openSeries() {
      window.location.href = '/series/' + slug + '/';
    }
    card.addEventListener('click', openSeries);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSeries();
      }
    });
    if (window.matchMedia('(hover: hover)').matches) {
      card.addEventListener('pointerenter', () => { card.style.willChange = 'transform'; });
      card.addEventListener('pointerleave', () => { card.style.willChange = ''; });
    }
  }

  // ── Attach click + keyboard events to a card ──────────
  function attachEvents(card, photo, index) {
    // Preload display-size image on first hover so lightbox opens instantly
    card.addEventListener('pointerenter', () => {
      const url = photo.url.display;
      if (url) { const img = new Image(); img.src = url; }
    }, { once: true });
    // Promote card to its own GPU layer just before the hover transform starts.
    // Skipped on touch devices — pointerenter fires during scroll there, which would
    // create too many simultaneous compositing layers and cause visual artifacts on iOS.
    if (window.matchMedia('(hover: hover)').matches) {
      card.addEventListener('pointerenter', () => { card.style.willChange = 'transform'; });
      card.addEventListener('pointerleave', () => { card.style.willChange = ''; });
    }
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
    // First pass: merge any series photos into window.GallerySeries
    mergeSeries(newPhotos, startIndex);

    // Second pass: render — series photos collapse into one folder card each.
    // _rendered persists on window.GallerySeries so chunks don't re-render the card.
    const fragment = document.createDocumentFragment();
    let eagerCount = 0;

    newPhotos.forEach((photo, i) => {
      const index = startIndex + i;

      if (photo.series && !window.galleryNoSeriesGroup) {
        const slug = photo.series;
        if (!window.GallerySeries[slug]?._rendered) {
          window.GallerySeries[slug]._rendered = true;
          const card = window.GalleryCore.makeSeriesCard(window.GallerySeries[slug]);
          attachSeriesEvents(card, slug);
          // Masonry trigger when peek images load
          card.querySelectorAll('img').forEach(img => {
            img.addEventListener('load', () => {
              clearTimeout(resizeTimer);
              resizeTimer = setTimeout(masonry, 80);
            }, { once: true });
          });
          fragment.appendChild(card);
        }
        // Remaining series photos: skip individual card
        return;
      }

      const eager = startIndex === 0 && eagerCount < 4;
      if (eager) eagerCount++;
      const card = window.GalleryCore.makeCard(photo, index, eager);
      const img = card.querySelector('img');
      if (img) {
        img.addEventListener('load', () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(masonry, 80);
        }, { once: true });
      }
      attachEvents(card, photo, index);
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
      const chunkToLoad = loadedChunks + 1;
      loadedChunks = chunkToLoad;
      const url = `/data/photos-${chunkToLoad}.json`;

      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(newPhotos => {
          const startIndex = window.GalleryPhotos.length;
          window.GalleryPhotos.push(...newPhotos);
          appendCards(newPhotos, startIndex);
          window.StackView   && window.StackView.onChunkLoaded();
          window.Lightbox    && window.Lightbox.onChunkLoaded();
          fetching = false;
          if (loadedChunks >= totalChunks) observer.disconnect();
        })
        .catch(err => {
          console.warn(`Chunk ${chunkToLoad} failed to load: ${err.message}`);
          loadedChunks--;  // allow retry on next scroll
          fetching = false;
        });
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
  }

  // ── Initial render ─────────────────────────────────────
  function init() {
    if (window.GalleryPhotos.length === 0) {
      gridEl.classList.remove('is-loading');
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'No photos yet — drop some into local/ and run npm run build.';
      gridEl.parentElement.appendChild(empty);
      return;
    }

    // Always render the grid — it may be hidden in stack mode, but must be ready
    // so switching from stack→grid shows the correct order without re-render.
    appendCards(window.GalleryPhotos, 0);
    gridEl.classList.remove('is-loading');
    gridEl.classList.add('is-ready');

    setupInfiniteScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
