(function () {
  'use strict';

  const dataEl = document.getElementById('gallery-data');
  if (!dataEl) return;

  const gridEl = document.getElementById('gallery-root');
  if (!gridEl) return;

  const GAP               = 28;
  const MOBILE_BREAKPOINT = 560;

  // Live photo array — lightbox.js reads from this reference
  window.GalleryPhotos = JSON.parse(dataEl.textContent);

  // Infinite scroll state
  let loadedChunks = 1;
  const totalChunks = parseInt(gridEl.dataset.totalChunks || '1', 10);
  const chunkSize   = parseInt(gridEl.dataset.chunkSize   || '60', 10);

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

  // ── Inline SVG icons ───────────────────────────────────
  const ICON_LINK = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const ICON_DOWN = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
  const ICON_EXT  = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>';

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
    img.addEventListener('load',  () => {
      img.classList.remove('is-loading');
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(masonry, 80);
    }, { once: true });
    img.addEventListener('error', () =>   img.classList.remove('is-loading'),               { once: true });
    img.src = photo.url.thumb;

    wrap.appendChild(img);
    front.appendChild(wrap);

    // ── Back face (postcard) ────────────────────────────
    const back = document.createElement('div');
    back.className = 'photo-card__back';

    // Title sits above the ruled area — no lines behind it
    if (photo.title) {
      const titleEl = document.createElement('h3');
      titleEl.className = 'photo-card__back-title';
      titleEl.textContent = photo.title;
      back.appendChild(titleEl);
    }

    // Ruled body: description only
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

    // Clicking the back face anywhere flips back (action buttons stop propagation)
    back.addEventListener('click', e => {
      e.stopPropagation();
      article.classList.remove('is-flipped');
    });

    // Actions row: share button
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
      const card  = makeCard(photo, index);
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
    if (window.GalleryPhotos.length === 0) {
      gridEl.classList.remove('is-loading');
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = 'No photos yet — drop some into local/ and run npm run build.';
      gridEl.parentElement.appendChild(empty);
      return;
    }

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
