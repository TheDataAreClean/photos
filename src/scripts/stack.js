// stack.js — one-photo-at-a-time stack view
// Exposes window.StackView: { init, isInitialised, onChunkLoaded }
// Navigation: prev/next buttons, keyboard ← →, horizontal swipe.
// Series photos are collapsed into a single folder card item, matching the grid.
// Chunk loading: proximity check triggers the existing IntersectionObserver in gallery.js
// by scrolling #scroll-sentinel into view — no duplicate fetch logic.
(function () {
  'use strict';

  const stageEl   = document.getElementById('stack-stage');
  const prevBtn   = document.getElementById('stack-prev');
  const nextBtn   = document.getElementById('stack-next');
  const counterEl = document.getElementById('stack-counter');

  if (!stageEl) return;

  const deckEl = stageEl.querySelector('.stack-deck');
  if (!deckEl) return;

  let currentIndex  = 0;
  let currentCardEl = null;
  let pendingWrap   = false;

  // stackItems: array of { type: 'photo', photoIdx } | { type: 'series', slug }
  // Series photos are collapsed into one entry, same as the grid.
  let stackItems = [];

  function photos() {
    return window.GalleryPhotos || [];
  }

  // Build or rebuild the stack item list from the currently loaded photos.
  // Called on init and after each chunk loads.
  function buildStackItems() {
    const photoList = photos();
    stackItems = [];
    // Series pages set galleryNoSeriesGroup — show individual photos
    if (window.galleryNoSeriesGroup || !window.GallerySeries) {
      photoList.forEach((_, i) => stackItems.push({ type: 'photo', photoIdx: i }));
      return;
    }
    const seenSeries = new Set();
    photoList.forEach((photo, i) => {
      if (photo.series) {
        const slug = photo.series;
        if (!seenSeries.has(slug)) {
          seenSeries.add(slug);
          stackItems.push({ type: 'series', slug });
        }
      } else {
        stackItems.push({ type: 'photo', photoIdx: i });
      }
    });
  }

  // Parse photo.aspectRatio which may be a number (1.5) or string ("3/2")
  function parseAspectRatio(ar) {
    if (!ar) return null;
    if (typeof ar === 'number') return ar;
    const s = String(ar);
    const slash = s.indexOf('/');
    if (slash >= 0) {
      const w = parseFloat(s.slice(0, slash));
      const h = parseFloat(s.slice(slash + 1));
      return (w && h) ? w / h : null;
    }
    return parseFloat(s) || null;
  }

  // Narrow the deck for portrait photos so the card always fits in the stage height.
  function fitDeckToStage(photo) {
    const ar = parseAspectRatio(photo.aspectRatio);
    if (!ar) return;
    const stageH = stageEl.clientHeight;
    if (!stageH) return;
    const padV   = 20;
    const padH   = 20;
    const maxW   = (stageH - padV) * ar + padH;
    const cssMax = Math.min(480, window.innerWidth * 0.92);
    deckEl.style.width = Math.round(Math.min(cssMax, maxW)) + 'px';
  }

  function getTotal() {
    const lb = document.getElementById('lightbox');
    const buildTotal = parseInt((lb && lb.dataset.totalPhotos) || '0', 10);
    return Math.max(buildTotal, photos().length);
  }

  // Pick a thumbnail URL for a stack item (photo or series cover)
  function thumbForItem(item) {
    if (!item) return '';
    if (item.type === 'photo') {
      return photos()[item.photoIdx]?.url?.thumb || '';
    }
    if (item.type === 'series') {
      const s = window.GallerySeries?.[item.slug];
      const coverItem = s?.coverPhoto ? s.photos.find(p => p.photo.id === s.coverPhoto) : null;
      const peek = coverItem?.photo || s?.photos?.[0]?.photo;
      return peek?.url?.thumb || '';
    }
    return '';
  }

  // Show thumbnail from upcoming items on the decorative stack layers
  function updateStackLayers(itemIndex) {
    const layerEls = Array.from(deckEl.querySelectorAll('.stack-layer'));
    [itemIndex + 2, itemIndex + 1].forEach((previewIdx, i) => {
      const url = thumbForItem(stackItems[previewIdx]);
      layerEls[i].style.backgroundImage = url ? `url('${url}')` : '';
    });
  }

  function updateCounter() {
    if (!counterEl) return;
    counterEl.textContent = stackItems.length ? `${currentIndex + 1} / ${stackItems.length}` : '';
  }

  function updateNavButtons() {
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  // Trigger the next chunk fetch when the user is close to the end of loaded items.
  function checkChunkProximity() {
    if (stackItems.length > 0 && currentIndex >= stackItems.length - 5) {
      const sentinel = document.getElementById('scroll-sentinel');
      if (sentinel) sentinel.scrollIntoView({ block: 'end', behavior: 'instant' });
    }
  }

  // Wire click + keyboard on a photo card to open the lightbox.
  function wireCardEvents(card, photoIdx) {
    card.addEventListener('click', () => {
      if (card.classList.contains('is-flipped')) return;
      window.Lightbox && window.Lightbox.open(photoIdx, card);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (card.classList.contains('is-flipped')) return;
        window.Lightbox && window.Lightbox.open(photoIdx, card);
      }
    });
  }

  // Wire click + keyboard on a series card to open the series page.
  function wireSeriesEvents(card, seriesData) {
    function openSeries() {
      window.location.href = '/series/' + seriesData.slug + '/';
    }
    card.addEventListener('click', openSeries);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSeries(); }
    });
  }

  // Build a card element for a stack item.
  function makeItemCard(item) {
    if (item.type === 'series') {
      const seriesData = window.GallerySeries?.[item.slug];
      if (!seriesData) return null;
      const card = window.GalleryCore.makeSeriesCard(seriesData);
      // Override the CSS `position: absolute` (designed for masonry); stack uses flow layout
      card.style.position = 'relative';
      card.style.width    = '100%';
      wireSeriesEvents(card, seriesData);
      return card;
    }
    // type === 'photo'
    const photo = photos()[item.photoIdx];
    if (!photo) return null;
    fitDeckToStage(photo);
    const card = window.GalleryCore.makeCard(photo, item.photoIdx);
    wireCardEvents(card, item.photoIdx);
    return card;
  }

  // Initial render — no animation
  function showCard(itemIndex) {
    if (currentCardEl) currentCardEl.remove();
    const item = stackItems[itemIndex];
    if (!item) return;

    const card = makeItemCard(item);
    if (!card) return;

    currentIndex  = itemIndex;
    deckEl.appendChild(card);
    currentCardEl = card;

    updateStackLayers(itemIndex);
    updateCounter();
    updateNavButtons();
  }

  // Navigate with exit + enter animations
  function navigate(newItemIndex, direction) {
    const item = stackItems[newItemIndex];
    if (!item) return;

    const newCard = makeItemCard(item);
    if (!newCard) return;

    const oldCard     = currentCardEl;
    currentIndex      = newItemIndex;
    currentCardEl     = newCard;

    // Pull old card out of flow so stage height snaps to the new card's height
    if (oldCard) {
      oldCard.style.position = 'absolute';
      oldCard.style.top      = '0';
      oldCard.style.left     = '0';
      oldCard.style.width    = '100%';
    }

    deckEl.appendChild(newCard);
    updateStackLayers(newItemIndex);

    // Enter: new card rises from the stack
    newCard.style.willChange = 'transform, opacity';
    const enterAnim = newCard.animate(
      [
        { transform: 'translateY(28px) scale(0.93)', opacity: 0 },
        { transform: 'translateY(0)    scale(1)',     opacity: 1 },
      ],
      { duration: 320, delay: 80, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' }
    );
    enterAnim.onfinish = () => { newCard.style.willChange = ''; };

    // Exit: old card slides off to the side
    if (oldCard) {
      const dx  = direction === 'next' ? '115%' : '-115%';
      const rot = direction === 'next' ? '6deg'  : '-6deg';
      oldCard.style.willChange = 'transform, opacity';
      const anim = oldCard.animate(
        [
          { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
          { transform: `translateX(${dx}) rotate(${rot})`, opacity: 0 },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      );
      anim.onfinish = () => oldCard.remove();
    }

    updateCounter();
    updateNavButtons();
  }

  function triggerChunkLoad() {
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) sentinel.scrollIntoView({ block: 'end', behavior: 'instant' });
  }

  function prev() {
    if (!stackItems.length) return;
    if (currentIndex === 0) {
      if (photos().length >= getTotal()) {
        navigate(stackItems.length - 1, 'prev');
      } else {
        pendingWrap = true;
        triggerChunkLoad();
      }
    } else {
      navigate(currentIndex - 1, 'prev');
    }
  }

  function next() {
    if (!stackItems.length) return;
    if (currentIndex === stackItems.length - 1) {
      if (photos().length >= getTotal()) navigate(0, 'next');
      else checkChunkProximity();
    } else {
      navigate(currentIndex + 1, 'next');
      checkChunkProximity();
    }
  }

  function setupKeyboard() {
    function onKeydown(e) {
      const stackRoot  = document.getElementById('stack-root');
      if (!stackRoot || stackRoot.hidden) return;
      const lightboxEl = document.getElementById('lightbox');
      if (lightboxEl && !lightboxEl.hidden) return;
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKeydown);
    window.StackView.cleanup = () => document.removeEventListener('keydown', onKeydown);
  }

  function setupSwipe() {
    let startX   = 0;
    let startY   = 0;
    let tracking = false;

    stageEl.addEventListener('pointerdown', e => {
      if (e.target.closest('button, a')) return;
      startX   = e.clientX;
      startY   = e.clientY;
      tracking = true;
    });

    document.addEventListener('pointerup', e => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < 30) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) prev();
      else next();
    });

    document.addEventListener('pointercancel', () => { tracking = false; });
  }

  if (prevBtn) prevBtn.addEventListener('click', prev);
  if (nextBtn) nextBtn.addEventListener('click', next);

  // Re-fit deck on resize/orientation change (photo items only; series cards use 100% width)
  const deckResizeObserver = new ResizeObserver(() => {
    const item = stackItems[currentIndex];
    if (item?.type === 'photo') {
      const photo = photos()[item.photoIdx];
      if (photo) fitDeckToStage(photo);
    } else {
      deckEl.style.width = '';
    }
  });
  deckResizeObserver.observe(stageEl);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) deckResizeObserver.disconnect();
    else deckResizeObserver.observe(stageEl);
  });

  function init() {
    if (window.StackView.isInitialised) return;
    window.StackView.isInitialised = true;

    buildStackItems();
    showCard(0);
    setupKeyboard();
    setupSwipe();
  }

  function onChunkLoaded() {
    buildStackItems();
    updateCounter();
    updateNavButtons();
    if (pendingWrap) {
      if (photos().length >= getTotal()) {
        pendingWrap = false;
        navigate(stackItems.length - 1, 'prev');
      } else {
        triggerChunkLoad();
      }
    }
  }

  window.StackView = { init, prev, next, onChunkLoaded, isInitialised: false };

  // Self-initialise if stack view is already active when this script runs
  if (window.ViewState && window.ViewState.getView() === 'stack') {
    const stackRoot = document.getElementById('stack-root');
    if (stackRoot && !stackRoot.hidden) {
      init();
    }
  }

})();
