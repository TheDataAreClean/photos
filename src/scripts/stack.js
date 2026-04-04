// stack.js — one-photo-at-a-time stack view
// Exposes window.StackView: { init, isInitialised, onChunkLoaded }
// Navigation: prev/next buttons, keyboard ← →, horizontal swipe.
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

  function photos() {
    return window.GalleryPhotos || [];
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
  // Landscape photos use the full CSS deck width; portrait photos scale the deck
  // narrower so their natural height lands within the available stage space.
  function fitDeckToStage(photo) {
    const ar = parseAspectRatio(photo.aspectRatio);
    if (!ar) return;
    const stageH = stageEl.clientHeight;
    if (!stageH) return;
    const padV   = 20;  // 2 × 10px top/bottom padding from photo-card__front
    const padH   = 20;  // 2 × 10px left/right padding
    const maxW   = (stageH - padV) * ar + padH;
    const cssMax = Math.min(480, window.innerWidth * 0.92);
    deckEl.style.width = Math.round(Math.min(cssMax, maxW)) + 'px';
  }

  function getTotal() {
    const lb = document.getElementById('lightbox');
    const buildTotal = parseInt((lb && lb.dataset.totalPhotos) || '0', 10);
    return Math.max(buildTotal, photos().length);
  }

  // Show thumbnail from upcoming photos on the decorative stack layers
  function updateStackLayers(index) {
    const photoList = photos();
    const layerEls  = Array.from(deckEl.querySelectorAll('.stack-layer'));
    // layerEls[0] = stack-layer--2 (furthest), layerEls[1] = stack-layer--1 (closer)
    [index + 2, index + 1].forEach((previewIdx, i) => {
      const photo = photoList[previewIdx];
      layerEls[i].style.backgroundImage = (photo && photo.url && photo.url.thumb)
        ? `url('${photo.url.thumb}')`
        : '';
    });
  }

  function updateCounter() {
    if (!counterEl) return;
    counterEl.textContent = photos().length ? `${currentIndex + 1} / ${getTotal()}` : '';
  }

  function updateNavButtons() {
    if (prevBtn) prevBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  }

  // Trigger the next chunk fetch when the user is within 5 photos of the loaded count.
  // The sentinel scroll kicks the IntersectionObserver in gallery.js — stack.js has no
  // fetch logic of its own. 5 photos gives enough lead time for a network round-trip
  // before the user reaches the boundary, even on a slow connection.
  function checkChunkProximity() {
    const loaded = photos().length;
    if (loaded > 0 && currentIndex >= loaded - 5) {
      const sentinel = document.getElementById('scroll-sentinel');
      if (sentinel) sentinel.scrollIntoView({ block: 'end', behavior: 'instant' });
    }
  }

  function wireCardEvents(card, index) {
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

  // Initial render — no animation
  function showCard(index) {
    if (currentCardEl) currentCardEl.remove();
    const photo = photos()[index];
    if (!photo) return;

    currentIndex = index;
    fitDeckToStage(photo);
    const card = window.GalleryCore.makeCard(photo, index);
    wireCardEvents(card, index);
    deckEl.appendChild(card);
    currentCardEl = card;

    updateStackLayers(index);
    updateCounter();
    updateNavButtons();
  }

  // Navigate with exit + enter animations
  function navigate(newIndex, direction) {
    const photo = photos()[newIndex];
    if (!photo) return;

    fitDeckToStage(photo);
    const newCard = window.GalleryCore.makeCard(photo, newIndex);
    wireCardEvents(newCard, newIndex);

    const oldCard = currentCardEl;
    currentIndex  = newIndex;
    currentCardEl = newCard;

    // Pull old card out of flow BEFORE appending the new one so the stage
    // height jumps straight to the new photo's natural height, not to
    // old-height + new-height stacked.
    if (oldCard) {
      oldCard.style.position = 'absolute';
      oldCard.style.top      = '0';
      oldCard.style.left     = '0';
      oldCard.style.width    = '100%';
    }

    // New card is in-flow → deck height = new photo's natural height
    deckEl.appendChild(newCard);

    updateStackLayers(newIndex);

    // Enter: new card rises from the stack
    newCard.animate(
      [
        { transform: 'translateY(28px) scale(0.93)', opacity: 0 },
        { transform: 'translateY(0)    scale(1)',     opacity: 1 },
      ],
      { duration: 320, delay: 80, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' }
    );

    // Exit: old card slides off to the side
    if (oldCard) {
      const dx  = direction === 'next' ? '115%' : '-115%';
      const rot = direction === 'next' ? '6deg'  : '-6deg';
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
    const loaded = photos().length;
    if (!loaded) return;
    if (currentIndex === 0) {
      if (loaded >= getTotal()) {
        navigate(loaded - 1, 'prev');
      } else {
        pendingWrap = true;
        triggerChunkLoad();
      }
    } else {
      navigate(currentIndex - 1, 'prev');
    }
  }

  function next() {
    const loaded = photos().length;
    if (!loaded) return;
    if (currentIndex === loaded - 1) {
      if (loaded >= getTotal()) navigate(0, 'next');
      else checkChunkProximity();
    } else {
      navigate(currentIndex + 1, 'next');
      checkChunkProximity();
    }
  }

  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      const stackRoot  = document.getElementById('stack-root');
      if (!stackRoot || stackRoot.hidden) return;
      const lightboxEl = document.getElementById('lightbox');
      if (lightboxEl && !lightboxEl.hidden) return;
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    });
  }

  function setupSwipe() {
    let startX   = 0;
    let startY   = 0;
    let tracking = false;

    stageEl.addEventListener('pointerdown', e => {
      // Don't start swipe tracking when tapping interactive elements
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

  function init() {
    if (window.StackView.isInitialised) return;
    window.StackView.isInitialised = true;

    showCard(0);
    setupKeyboard();
    setupSwipe();
  }

  function onChunkLoaded() {
    updateCounter();
    updateNavButtons();
    if (pendingWrap) {
      if (photos().length >= getTotal()) {
        pendingWrap = false;
        navigate(photos().length - 1, 'prev');
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
