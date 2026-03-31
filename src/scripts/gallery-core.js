// gallery-core.js — shared card factory and utilities
// Exposes window.GalleryCore: { makeCard, seedRotation, formatDateStamp, buildBackExif }
// Consumed by gallery.js (grid), stack.js (stack view), and lightbox.js (action buttons).
(function () {
  'use strict';

  // ── Inline SVG icons ───────────────────────────────────
  const ICON_LINK = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const ICON_DOWN = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  const ICON_EXT  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

  // ── Stable rotation per photo ─────────────────────────
  function seedRotation(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = Math.imul(31, h) + id.charCodeAt(i) | 0;
    }
    const deg = ((Math.abs(h) % 640) / 100) - 3.2;
    return deg.toFixed(2);
  }

  // ── Date formatter — camera-style "MM DD 'YY" ─────────
  function formatDateStamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${mm} ${dd} '${yy}`;
  }

  // ── Build EXIF rows for back face ──────────────────────
  function buildBackExif(exif) {
    if (!exif) return null;
    const dash = '—';
    const focal = exif.focalLength35
      ? `${exif.focalLength35}${exif.focalLength ? ' (' + exif.focalLength + ')' : ''}`
      : (exif.focalLength || dash);
    const rows = [
      ['Camera',   exif.camera       || dash],
      ['Lens',     exif.lens         || dash],
      ['Focal',    focal                    ],
      ['Aperture', exif.aperture     || dash],
      ['Shutter',  exif.shutterSpeed || dash],
      ['ISO',      exif.iso != null  ? String(exif.iso) : dash],
    ];
    const dl = document.createElement('dl');
    rows.forEach(([l, v]) => {
      const dt = document.createElement('dt'); dt.textContent = l;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
    return dl;
  }

  // ── Build one card element ─────────────────────────────
  // Pure factory — no masonry, no DOM side effects outside the card.
  function makeCard(photo, index) {
    const rotation = seedRotation(photo.id);

    const article = document.createElement('article');
    article.className = 'photo-card';
    article.style.setProperty('--rotation', `${rotation}deg`);
    article.dataset.index = index;
    article.setAttribute('role', 'listitem');
    article.setAttribute('tabindex', '0');
    article.setAttribute('aria-label',
      photo.title || formatDateStamp(photo.dateTaken) || 'Photo'
    );

    // ── 3D inner ───────────────────────────────────────
    const inner = document.createElement('div');
    inner.className = 'photo-card__inner';

    // ── Front face ─────────────────────────────────────
    const front = document.createElement('div');
    front.className = 'photo-card__front';

    const wrap = document.createElement('div');
    wrap.className = 'photo-card__image-wrap';

    const img = document.createElement('img');
    img.className = 'is-loading';
    img.alt = photo.altText || photo.title || '';
    img.loading = 'lazy';
    if (photo.aspectRatio) img.style.aspectRatio = String(photo.aspectRatio);
    img.addEventListener('load',  () => img.classList.remove('is-loading'), { once: true });
    img.addEventListener('error', () => img.classList.remove('is-loading'), { once: true });
    img.draggable = false;
    img.src = photo.url.thumb;
    img.addEventListener('contextmenu', e => e.preventDefault());

    const protect = document.createElement('div');
    protect.className = 'img-protect';
    protect.addEventListener('contextmenu', e => e.preventDefault());

    wrap.appendChild(img);
    wrap.appendChild(protect);
    front.appendChild(wrap);

    // ── Back face (postcard) ────────────────────────────
    const back = document.createElement('div');
    back.className = 'photo-card__back';

    if (photo.title) {
      const titleEl = document.createElement('h3');
      titleEl.className = 'photo-card__back-title';
      titleEl.textContent = photo.title;
      back.appendChild(titleEl);
    }

    const backBody = document.createElement('div');
    backBody.className = 'photo-card__back-body';

    if (photo.description) {
      const descEl = document.createElement('p');
      descEl.className = 'photo-card__back-desc';
      descEl.textContent = photo.description;
      backBody.appendChild(descEl);
    }

    back.appendChild(backBody);

    const exifDl = buildBackExif(photo.exif);
    if (exifDl) {
      const exifWrap = document.createElement('div');
      exifWrap.className = 'photo-card__back-exif';
      exifWrap.appendChild(exifDl);
      back.appendChild(exifWrap);
    }

    // Clicking back face flips back (action buttons stop propagation)
    back.addEventListener('click', e => {
      e.stopPropagation();
      article.classList.remove('is-flipped');
    });

    // Actions row
    const actions = document.createElement('div');
    actions.className = 'photo-card__back-actions';

    const shareBtn = document.createElement('button');
    shareBtn.className = 'photo-card__action-btn';
    shareBtn.innerHTML = `<span>Share</span>${ICON_LINK}`;
    shareBtn.setAttribute('aria-label', 'Copy link to this photo');

    const dlBtn = document.createElement('a');
    dlBtn.className = 'photo-card__action-btn';
    dlBtn.innerHTML = `Download${ICON_DOWN}`;
    dlBtn.href = photo.url.download || photo.url.display;
    dlBtn.setAttribute('download', photo.id || 'photo');
    dlBtn.addEventListener('click', e => e.stopPropagation());

    actions.appendChild(shareBtn);
    actions.appendChild(dlBtn);

    if (photo.url.glass) {
      const glassBtn = document.createElement('a');
      glassBtn.className = 'photo-card__action-btn';
      glassBtn.innerHTML = `Glass${ICON_EXT}`;
      glassBtn.href = photo.url.glass;
      glassBtn.target = '_blank';
      glassBtn.rel = 'noopener noreferrer';
      glassBtn.addEventListener('click', e => e.stopPropagation());
      actions.appendChild(glassBtn);
    }

    back.appendChild(actions);

    inner.appendChild(front);
    inner.appendChild(back);
    article.appendChild(inner);

    // Date stamp — outside inner so it sits on the paper border
    const stamp = formatDateStamp(photo.dateTaken);
    if (stamp) {
      const ds = document.createElement('span');
      ds.className = 'photo-card__date-stamp';
      ds.textContent = stamp;
      article.appendChild(ds);
    }

    // Flip trigger
    const flipBtn = document.createElement('button');
    flipBtn.className = 'photo-card__flip-btn';
    flipBtn.innerHTML = '&#8635;';
    flipBtn.setAttribute('aria-label', 'Show photo details');
    article.appendChild(flipBtn);

    // ── Flip events ────────────────────────────────────
    flipBtn.addEventListener('click', e => {
      e.stopPropagation();
      article.classList.add('is-flipped');
    });

    shareBtn.addEventListener('click', e => {
      e.stopPropagation();
      const url = `${window.location.origin}/photos/${photo.id}/`;
      const labelEl = shareBtn.querySelector('span');
      navigator.clipboard.writeText(url).then(() => {
        if (labelEl) labelEl.textContent = 'Copied!';
        setTimeout(() => { if (labelEl) labelEl.textContent = 'Share'; }, 1500);
      }).catch(() => {
        if (labelEl) labelEl.textContent = 'Error';
        setTimeout(() => { if (labelEl) labelEl.textContent = 'Share'; }, 1500);
      });
    });

    return article;
  }

  window.GalleryCore = { makeCard, seedRotation, formatDateStamp, buildBackExif };
})();
