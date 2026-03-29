(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────
  let photos = [];
  let currentIndex = 0;
  let cardEls = [];      // live NodeList snapshot, refreshed on open

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
  const closeBtn    = lightboxEl.querySelector('.lightbox__close');
  const prevBtn     = lightboxEl.querySelector('.lightbox__prev');
  const nextBtn     = lightboxEl.querySelector('.lightbox__next');
  const backdropEl  = lightboxEl.querySelector('.lightbox__backdrop');
  const printEl     = lightboxEl.querySelector('.lightbox__print');
  const metaTopEl   = lightboxEl.querySelector('.lightbox__meta-top');
  const metaBotEl   = lightboxEl.querySelector('.lightbox__meta-bottom');
  const tabBtns     = Array.from(lightboxEl.querySelectorAll('.lightbox__tab-btn'));

  // Live reference — gallery.js appends to this array as chunks load
  photos = window.GalleryPhotos || [];

  // Total from build-time data — ensures counter is correct before all chunks load
  const totalPhotos = parseInt(lightboxEl.dataset.totalPhotos || '0', 10);

  // ── Tab toggle (mobile only) ──────────────────────────
  function setTab(tab) {
    tabBtns.forEach(btn => btn.classList.toggle('is-active', btn.dataset.tab === tab));
    metaTopEl.classList.toggle('is-hidden', tab !== 'info');
    metaBotEl.classList.toggle('is-hidden', tab !== 'exif');
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

  function buildExifHtml(exif) {
    if (!exif) return '';
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
    return '<dl class="exif-grid">' +
      rows.map(([l, v]) => `<dt>${l}</dt><dd>${v}</dd>`).join('') +
      '</dl>';
  }

  // ── Populate lightbox content ─────────────────────────
  function loadPhoto(index) {
    const photo = photos[index];
    if (!photo) return;
    currentIndex = index;

    // Reset to Info tab on every photo change
    setTab('info');

    // Image — fade out then swap src
    imgEl.style.opacity = '0';
    imgEl.alt = photo.altText || photo.title || '';
    imgEl.onload = () => { imgEl.style.opacity = '1'; };
    imgEl.src = photo.url.display;

    // Title
    titleEl.textContent = photo.title || '';
    titleEl.hidden = !photo.title;

    // Description (plain text / pre-wrap preserves line breaks from markdown body)
    descEl.textContent = photo.description || '';
    descEl.hidden = !photo.description;

    // EXIF
    const exifHtml = buildExifHtml(photo.exif);
    exifEl.innerHTML = exifHtml;
    exifEl.hidden = !exifHtml;

    // Footer: date only
    const dateStr = formatDate(photo.dateTaken);
    footerEl.innerHTML = dateStr ? `<span>${dateStr}</span>` : '';

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

    // Nav buttons
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === photos.length - 1;
  }

  // ── FLIP open animation ───────────────────────────────
  // The print animates from the card's exact position on the desk
  // up to its final centered position — like picking a photo up.
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

    printEl.animate(
      [
        { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0.5 },
        { transform: 'translate(0, 0) scale(1)',                                  opacity: 1   },
      ],
      { duration: 360, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
    );
  }

  // ── FLIP close animation ──────────────────────────────
  function flipClose(onDone) {
    const cardEl = cardEls[currentIndex];
    if (!cardEl || !printEl) { onDone(); return; }

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
        { transform: 'translate(0, 0) scale(1)',                                  opacity: 1   },
        { transform: `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`, opacity: 0   },
      ],
      { duration: 300, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }
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

    loadPhoto(index);

    lightboxEl.hidden = false;
    // Lock page scroll on desktop; on mobile the lightbox itself scrolls
    if (window.innerWidth > 680) document.body.style.overflow = 'hidden';

    // Backdrop fade
    lightboxEl.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 220, fill: 'forwards' }
    );

    flipOpen(cardEl);
    closeBtn.focus();
  }

  function close() {
    flipClose(() => {
      lightboxEl.hidden = true;
      document.body.style.overflow = '';
      lightboxEl.scrollTop = 0;
      // Return focus to the card that was open
      const returnCard = cardEls[currentIndex];
      if (returnCard) returnCard.focus();
    });
  }

  function prev() {
    if (currentIndex > 0) loadPhoto(currentIndex - 1);
  }

  function next() {
    if (currentIndex < photos.length - 1) loadPhoto(currentIndex + 1);
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
  window.Lightbox = { open, close, prev, next };

})();
