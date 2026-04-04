# FUTURE.md — Deferred ideas and improvements

A holding area for things worth doing but not yet prioritised.

---

## Lightbox — photo transition when navigating

Currently the image fades to black while the next photo downloads, which reads as a loading glitch rather than a deliberate transition.

**~~Cross-fade~~** ✓ Done — outgoing image stays visible as an overlay while the new one loads; both fade simultaneously on load.

**~~Directional slide~~** ✓ Done — outgoing slides left on next / right on prev (WAAPI, 260ms); incoming slides in from the opposite side on load (300ms). Falls back to cross-fade when no direction (initial open).

**~~Zoom-from-thumbnail~~** ✓ Done — when the target card is visible in the viewport, `loadPhoto` calls `flipOpen(targetCard)` on load instead of sliding; same FLIP animation as initial open. Falls back to directional slide when card is off-screen (stack view, scrolled away, chunked).

---

## Lightbox — faster photo loading

The display-size image for the next/prev photo isn't fetched until navigation.

**~~Preload adjacent images~~** ✓ Done — `lightbox.js` preloads N−1 and N+1 on every navigation.

**~~Preload on grid card hover~~** ✓ Done — `pointerenter` on each card fires a single `new Image()` load; `{ once: true }` so it only runs once per card.

**~~`loading="eager"` on first N cards~~** ✓ Done — first 4 cards in the initial render use `loading="eager"`.

**Smaller chunk size**
- Drop from 60 to 30 photos per chunk in `config.js`
- Faster first-chunk inline paint, but doubles JSON requests for the same total
- Mixed trade-off — evaluate once photo count grows significantly (currently under 60, so single chunk)

**~~WebP conversion in the build pipeline~~** ✓ Done — local thumbnails (`@800.webp`) and display/download images already output as WebP via sharp. Glass display images are served from the CDN as-is.

**~~`decoding="async"` on card images~~** ✓ Done — offloads image decode to a background thread; main thread stays free during scroll.

**~~`fetchpriority="high"` on first 4 cards~~** ✓ Done — complements `loading="eager"`; hints the browser to prioritise the first visible images in the fetch queue.

**~~`<link rel="preconnect">` to Glass image CDN~~** ✓ Done — warms TCP/TLS to `cdn.glass.photo` before any Glass image requests.

**~~`contain: layout style` on `.photo-card`~~** ✓ Done — scopes layout and style recalcs to the card; safe since masonry positions cards via explicit JS.

**~~Dynamic `will-change: transform` on hover~~** ✓ Done — `pointerenter` sets `will-change: transform` to promote the card to its own GPU layer just before the hover transform starts; `pointerleave` clears it.

---

## Box-shadow animation (photo card hover)

**~~Pseudo-element shadow technique~~** ✓ Done — `.photo-card::before` holds the hover shadow pre-painted at `opacity: 0`; hover transitions opacity only (compositor-only, no repaint). Base `box-shadow` on the card is static and never transitions.
