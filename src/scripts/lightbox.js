// lightbox.js — full-screen photo viewer
// Opens with a FLIP animation from the clicked card; closes back to the origin card.
// In stack mode, originCardEl is captured at open() time because only one card exists in the DOM.
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────
  let photos = [];
  let currentIndex = 0;
  let cardEls = [];      // live NodeList snapshot, refreshed on open
  let originCardEl = null; // card that opened the lightbox — used by flipClose in stack mode
  let metaOpen = false;  // resets to false each time lightbox opens
  let pendingWrap = false;
  let pendingDirection = -1; // direction queued while waiting for a chunk

  // ── Elements ──────────────────────────────────────────
  const lightboxEl  = document.getElementById('lightbox');
  if (!lightboxEl) return;

  const imgEl       = document.getElementById('lightbox-img');
  const titleEl     = document.getElementById('lightbox-title');
  const descEl      = document.getElementById('lightbox-desc');
  const exifEl      = document.getElementById('lightbox-exif');
  const footerEl    = document.getElementById('lightbox-footer');
  const counterEl   = document.getElementById('lightbox-counter');
  const shareBtn    = document.getElementById('lightbox-share');
  const downloadBtn = document.getElementById('lightbox-download');
  const glassBtn    = document.getElementById('lightbox-glass');
  const closeBtn      = lightboxEl.querySelector('.lightbox__close');
  const prevBtn       = lightboxEl.querySelector('.lightbox__prev');
  const nextBtn       = lightboxEl.querySelector('.lightbox__next');
  const backdropEl    = lightboxEl.querySelector('.lightbox__backdrop');
  const printEl       = lightboxEl.querySelector('.lightbox__print');
  const metaTopEl     = lightboxEl.querySelector('.lightbox__meta-top');
  const metaBotEl     = lightboxEl.querySelector('.lightbox__meta-bottom');
  const metaToggleBtn = lightboxEl.querySelector('.lightbox__meta-toggle');
  const tabBtns       = Array.from(lightboxEl.querySelectorAll('.lightbox__tab-btn'));

  // Block right-click on lightbox image
  if (imgEl) imgEl.addEventListener('contextmenu', e => e.preventDefault());
  if (printEl) printEl.addEventListener('contextmenu', e => e.preventDefault());

  // Live reference — gallery.js appends to this array as chunks load
  photos = window.GalleryPhotos || [];

  // Total from build-time data — ensures counter is correct before all chunks load
  const totalPhotos = parseInt(lightboxEl.dataset.totalPhotos || '0', 10);

  // ── Meta panel toggle (desktop only) ─────────────────
  function setMetaOpen(open) {
    metaOpen = open;
    lightboxEl.classList.toggle('is-meta-open', open);
    if (metaToggleBtn) {
      metaToggleBtn.setAttribute('aria-expanded', String(open));
      metaToggleBtn.setAttribute('aria-label', open ? 'Close photo info' : 'Open photo info');
    }
  }

  if (metaToggleBtn) {
    metaToggleBtn.addEventListener('click', () => setMetaOpen(!metaOpen));
  }

  // ── Tab toggle (mobile only) ──────────────────────────
  function setTab(tab) {
    tabBtns.forEach(btn => btn.classList.toggle('is-active', btn.dataset.tab === tab));
    metaTopEl.classList.toggle('is-hidden', tab !== 'about');
    metaBotEl.classList.toggle('is-hidden', tab !== 'info');
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  // ── Helpers ───────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'UTC',
    });
  }

  function buildExifEl(exif) {
    if (!exif) return null;
    const dash = '—';
    const focal = exif.focalLength35
      ? `${exif.focalLength35}${exif.focalLength ? ' (' + exif.focalLength + ')' : ''}`
      : (exif.focalLength || dash);
    const rows = [
      ['Camera',   exif.camera       || dash],
      ['Lens',     exif.lens         || dash],
      ['Focal',    focal],
      ['Aperture', exif.aperture     || dash],
      ['Shutter',  exif.shutterSpeed || dash],
      ['ISO',      exif.iso != null  ? String(exif.iso) : dash],
    ];
    const dl = document.createElement('dl');
    dl.className = 'exif-grid';
    rows.forEach(([l, v]) => {
      const dt = document.createElement('dt'); dt.textContent = l;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    return dl;
  }

  // ── Populate lightbox content ─────────────────────────
  function loadPhoto(index, direction = 0, targetCard = null) {
    const photo = photos[index];
    if (!photo) return;
    currentIndex = index;

    // Reset to About tab on every photo change
    setTab('about');

    // Image — two transition modes depending on how we're navigating:
    //   direction=0  → cross-fade (initial open)
    //   direction≠0  → directional slide (prev/next)
    const prevOutgoing = printEl && printEl.querySelector('.lb-outgoing');
    if (prevOutgoing) prevOutgoing.remove();

    const hasOldSrc = imgEl.src && imgEl.src !== window.location.href;

    if (hasOldSrc && printEl && !targetCard) {
      // Outgoing overlay — used for cross-fade and directional slide (not zoom)
      const outgoing = document.createElement('img');
      outgoing.src = imgEl.src;
      outgoing.className = 'lb-outgoing';
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
      printEl.appendChild(outgoing);

      if (direction !== 0) {
        // Slide outgoing away immediately — incoming slides in on load
        const xOut = direction > 0 ? '-100%' : '100%';
        outgoing.animate(
          [{ transform: 'translateX(0)' }, { transform: `translateX(${xOut})` }],
          { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
        ).onfinish = () => outgoing.remove();
      } else {
        // Cross-fade — outgoing fades when new image is ready
        outgoing.style.transition = 'opacity 0.22s cubic-bezier(0.25,0.46,0.45,0.94)';
      }
    }

    imgEl.style.opacity = '0';
    // Position incoming off-screen for the slide (zoom and cross-fade start from natural position)
    imgEl.style.transform = (direction !== 0 && !targetCard)
      ? `translateX(${direction > 0 ? '100%' : '-100%'})`
      : '';

    imgEl.alt = photo.altText || photo.title || '';
    imgEl.onload = () => {
      imgEl.style.opacity = '1';

      if (targetCard) {
        // Zoom from card: FLIP animation on printEl, same as initial open
        flipOpen(targetCard);

      } else if (direction !== 0) {
        // Slide incoming from off-screen
        const xIn = direction > 0 ? '100%' : '-100%';
        const anim = imgEl.animate(
          [{ transform: `translateX(${xIn})` }, { transform: 'translateX(0)' }],
          { duration: 300, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
        );
        anim.onfinish = () => { anim.cancel(); imgEl.style.transform = ''; };

      } else {
        // Cross-fade: fade out the outgoing overlay
        const outgoing = printEl && printEl.querySelector('.lb-outgoing');
        if (outgoing) {
          outgoing.style.opacity = '0';
          outgoing.addEventListener('transitionend', () => outgoing.remove(), { once: true });
        }
      }
    };
    imgEl.src = photo.url.display;

    // Title
    titleEl.textContent = photo.title || '';
    titleEl.hidden = !photo.title;

    // Description (plain text / pre-wrap preserves line breaks from markdown body)
    descEl.textContent = photo.description || '';
    descEl.hidden = !photo.description;

    // EXIF
    const exifNode = buildExifEl(photo.exif);
    exifEl.replaceChildren(...(exifNode ? [exifNode] : []));
    exifEl.hidden = !exifNode;

    // Footer: date only
    const dateStr = formatDate(photo.dateTaken);
    footerEl.replaceChildren();
    if (dateStr) {
      const span = document.createElement('span');
      span.textContent = dateStr;
      footerEl.appendChild(span);
    }

    // Glass button — show only for Glass photos
    if (glassBtn) {
      if (photo.url.glass) {
        glassBtn.href = photo.url.glass;
        glassBtn.hidden = false;
      } else {
        glassBtn.hidden = true;
      }
    }


    // Download link
    if (downloadBtn) {
      const dlUrl = photo.url.download || photo.url.display;
      downloadBtn.href = dlUrl;
      downloadBtn.setAttribute('download', photo.id || 'photo');
    }

    // Counter — use build-time total so it's correct before all chunks load
    const knownTotal = Math.max(totalPhotos, photos.length);
    counterEl.textContent = `${index + 1} / ${knownTotal}`;

    // Nav buttons — always enabled (wrapping navigation)
    prevBtn.disabled = false;
    nextBtn.disabled = false;

    // Preload adjacent photos so next/prev feel instant
    [index - 1, index + 1].forEach(i => {
      const p = photos[i];
      if (p && p.url && p.url.display) new Image().src = p.url.display;
    });
  }

  // ── FLIP open / close animations ─────────────────────
  // FLIP = First, Last, Invert, Play.
  //   First:  record the card's rect before the lightbox opens (or after it closes).
  //   Last:   the lightbox print is already in its final position when we read printRect.
  //   Invert: compute the translate + scale needed to make the print sit exactly over
  //           the card (the "First" position), then apply that as the animation start frame.
  //   Play:   animate from the inverted start → natural end (translate 0, scale 1).
  // This gives a physically grounded "pick up the photo" / "put it back" feel without
  // any position:absolute hacks — the DOM layout stays unchanged throughout.

  function flipOpen(cardEl) {
    if (!cardEl || !printEl) return;

    const cardRect  = cardEl.getBoundingClientRect();
    const printRect = printEl.getBoundingClientRect();

    const scaleX = cardRect.width  / printRect.width;
    const scaleY = cardRect.height / printRect.height;
    const tx = (cardRect.left + cardRect.width  / 2) -
               (printRect.left + printRect.width  / 2);
    const ty = (cardRect.top  + cardRect.height / 2) -
               (printRect.top  + printRect.height / 2);

    // fill: 'none' — when the animation ends the CSS natural state (no transform) takes over
    // seamlessly, since the final keyframe matches it. No fill cleanup needed.
    printEl.animate(
      [
        { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0.5 },
        { transform: 'translate(0, 0) scale(1)',                                  opacity: 1   },
      ],
      { duration: 360, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'none' }
    );
  }

  // flipClose is the reverse: start at the print's current natural position,
  // end at the card's position. Uses originCardEl (captured at open time) instead of
  // cardEls[currentIndex] because lightbox-internal navigation changes currentIndex
  // while the origin card stays the same, and stack view has only one card in the DOM.
  //
  // Falls back to zoomClose when the card is not in the viewport — animating toward an
  // off-screen rect produces non-uniform scaleX/scaleY that squishes or stretches the photo.
  function isCardInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight &&
           r.right  > 0 && r.left < window.innerWidth;
  }

  function zoomClose(onDone) {
    lightboxEl.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
    const anim = printEl.animate(
      [
        { transform: 'scale(1)',    opacity: 1 },
        { transform: 'scale(0.88)', opacity: 0 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      printEl.getAnimations().forEach(a => a.cancel());
      lightboxEl.getAnimations().forEach(a => a.cancel());
      onDone();
    };
  }

  function flipClose(onDone) {
    const cardEl = originCardEl || cardEls[currentIndex];

    // If no card or card is off-screen, use a clean zoom-out instead of FLIP —
    // animating toward an off-screen rect produces non-uniform scale that distorts the image.
    if (!cardEl || !printEl || !isCardInViewport(cardEl)) {
      zoomClose(onDone);
      return;
    }

    const printRect = printEl.getBoundingClientRect();
    const cardRect  = cardEl.getBoundingClientRect();

    const scaleX = cardRect.width  / printRect.width;
    const scaleY = cardRect.height / printRect.height;
    const tx = (cardRect.left + cardRect.width  / 2) -
               (printRect.left + printRect.width  / 2);
    const ty = (cardRect.top  + cardRect.height / 2) -
               (printRect.top  + printRect.height / 2);

    const anim = printEl.animate(
      [
        { transform: 'translate(0, 0) scale(1)',                                  opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0 },
      ],
      { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
    );

    anim.onfinish = () => {
      printEl.getAnimations().forEach(a => a.cancel());
      onDone();
    };
  }

  // ── Public API ────────────────────────────────────────
  function open(index, cardEl) {
    if (!photos[index]) return;

    // Snapshot current card elements for FLIP + return focus
    cardEls = Array.from(document.querySelectorAll('.photo-card'));
    originCardEl = cardEl; // stored for flipClose — stack mode has only one card in DOM

    loadPhoto(index);
    setMetaOpen(window.innerWidth > 680);

    lightboxEl.hidden = false;
    // Lock page scroll on desktop; on mobile the lightbox itself scrolls
    if (window.innerWidth > 680) document.body.style.overflow = 'hidden';

    // Backdrop fade
    lightboxEl.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, fill: 'forwards' }
    );

    // FLIP open only on desktop — on mobile it feels janky
    if (window.innerWidth > 680) flipOpen(cardEl);
    closeBtn.focus();
  }

  function close() {
    const onDone = () => {
      lightboxEl.hidden = true;
      document.body.style.overflow = '';
      lightboxEl.scrollTop = 0;
      const returnCard = cardEls[currentIndex];
      if (returnCard) returnCard.focus();
    };
    // FLIP/zoom close only on desktop — on mobile just fade out
    if (window.innerWidth > 680) {
      flipClose(onDone);
    } else {
      lightboxEl.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      ).onfinish = () => { lightboxEl.getAnimations().forEach(a => a.cancel()); onDone(); };
    }
  }

  function triggerChunkLoad() {
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) sentinel.scrollIntoView({ block: 'end', behavior: 'instant' });
  }

  function prev() {
    if (currentIndex === 0) {
      if (photos.length >= totalPhotos) {
        loadPhoto(photos.length - 1, -1);
      } else {
        pendingWrap = true;
        pendingDirection = -1;
        triggerChunkLoad();
      }
    } else {
      loadPhoto(currentIndex - 1, -1);
    }
  }

  function next() {
    if (currentIndex === photos.length - 1) {
      if (photos.length >= totalPhotos) loadPhoto(0, 1);
    } else {
      loadPhoto(currentIndex + 1, 1);
    }
  }

  // ── Event listeners ───────────────────────────────────
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  backdropEl.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if (lightboxEl.hidden) return;
    switch (e.key) {
      case 'Escape':     close(); break;
      case 'ArrowLeft':  prev();  break;
      case 'ArrowRight': next();  break;
    }
  });

  // ── Share button ──────────────────────────────────────
  if (shareBtn) {
    const shareLabelEl = shareBtn.querySelector('span');
    shareBtn.addEventListener('click', () => {
      const photo = photos[currentIndex];
      if (!photo) return;
      const url = `${window.location.origin}/photos/${photo.id}/`;
      navigator.clipboard.writeText(url).then(() => {
        if (shareLabelEl) shareLabelEl.textContent = 'Copied!';
        setTimeout(() => { if (shareLabelEl) shareLabelEl.textContent = 'Share'; }, 1500);
      }).catch(() => {
        if (shareLabelEl) shareLabelEl.textContent = 'Error';
        setTimeout(() => { if (shareLabelEl) shareLabelEl.textContent = 'Share'; }, 1500);
      });
    });
  }

  // Expose for gallery.js
  function onChunkLoaded() {
    if (pendingWrap) {
      if (photos.length >= totalPhotos) {
        pendingWrap = false;
        loadPhoto(photos.length - 1, pendingDirection);
      } else {
        triggerChunkLoad();
      }
    }
  }

  window.Lightbox = { open, close, prev, next, onChunkLoaded };

})();
