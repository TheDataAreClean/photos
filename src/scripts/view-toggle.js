// view-toggle.js — view state persistence and toggle button wiring
// Exposes window.ViewState: { getView, setView, getShuffle, setShuffle, applyShuffle }
// localStorage keys: 'gallery-view' ('grid'|'stack'), 'gallery-shuffle' ('on'|'off').
// Toggling shuffle calls location.reload() to avoid ordering inconsistencies with partial chunks.
(function () {
  'use strict';

  const STORAGE_VIEW    = 'gallery-view';
  const STORAGE_SHUFFLE = 'gallery-shuffle';

  // Fisher-Yates in-place shuffle
  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  const ViewState = {
    getView() {
      try {
        return localStorage.getItem(STORAGE_VIEW) === 'stack' ? 'stack' : 'grid';
      } catch { return 'grid'; }
    },
    setView(v) {
      try { localStorage.setItem(STORAGE_VIEW, v); } catch { /* private browsing */ }
    },
    getShuffle() {
      try {
        return localStorage.getItem(STORAGE_SHUFFLE) === 'on';
      } catch { return false; }
    },
    setShuffle(bool) {
      try { localStorage.setItem(STORAGE_SHUFFLE, bool ? 'on' : 'off'); } catch { /* private browsing */ }
    },
    applyShuffle() {
      if (this.getShuffle() && window.GalleryPhotos && window.GalleryPhotos.length) {
        fisherYates(window.GalleryPhotos);
      }
    },
    _savedScrollY: 0,
  };

  window.ViewState = ViewState;

  // ── Button wiring ─────────────────────────────────────
  const gridBtn    = document.getElementById('toggle-grid');
  const stackBtn   = document.getElementById('toggle-stack');
  const shuffleBtn = document.getElementById('toggle-shuffle');

  if (!gridBtn || !stackBtn || !shuffleBtn) return;

  function setActiveView(v) {
    gridBtn.classList.toggle('is-active', v === 'grid');
    gridBtn.setAttribute('aria-pressed', String(v === 'grid'));
    stackBtn.classList.toggle('is-active', v === 'stack');
    stackBtn.setAttribute('aria-pressed', String(v === 'stack'));
  }

  function setActiveShuffle(on) {
    shuffleBtn.classList.toggle('is-active', on);
    shuffleBtn.setAttribute('aria-pressed', String(on));
  }

  function switchToStack() {
    const galleryRoot = document.getElementById('gallery-root');
    const stackRoot   = document.getElementById('stack-root');
    if (!galleryRoot || !stackRoot) return;

    ViewState._savedScrollY = window.scrollY;
    galleryRoot.hidden = true;
    stackRoot.hidden   = false;
    document.body.classList.add('stack-mode');
    // Scroll to top before init so iOS Safari shows the stack, not the grid's
    // previous scroll position (overflow:hidden on body doesn't lock iOS scroll).
    window.scrollTo(0, 0);
    ViewState.setView('stack');
    setActiveView('stack');

    if (window.StackView && !window.StackView.isInitialised) {
      // rAF gives the browser one frame to reflow after stack-mode is applied,
      // so stageEl.clientHeight is non-zero when fitDeckToStage runs.
      requestAnimationFrame(() => window.StackView.init());
    }
  }

  function switchToGrid() {
    const galleryRoot = document.getElementById('gallery-root');
    const stackRoot   = document.getElementById('stack-root');
    if (!galleryRoot || !stackRoot) return;

    stackRoot.hidden   = true;
    galleryRoot.hidden = false;
    document.body.classList.remove('stack-mode');
    ViewState.setView('grid');
    setActiveView('grid');
    window.scrollTo({ top: ViewState._savedScrollY || 0, behavior: 'instant' });
  }

  gridBtn.addEventListener('click',  switchToGrid);
  stackBtn.addEventListener('click', switchToStack);

  shuffleBtn.addEventListener('click', () => {
    ViewState.setShuffle(!ViewState.getShuffle());
    location.reload();
  });

  // ── Set initial UI state on load ──────────────────────
  const initialView    = ViewState.getView();
  const initialShuffle = ViewState.getShuffle();

  setActiveView(initialView);
  setActiveShuffle(initialShuffle);

  if (initialView === 'stack') {
    const galleryRoot = document.getElementById('gallery-root');
    const stackRoot   = document.getElementById('stack-root');
    if (galleryRoot) galleryRoot.hidden = true;
    if (stackRoot)   stackRoot.hidden   = false;
    document.body.classList.add('stack-mode');
  }

})();
