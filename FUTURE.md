# FUTURE.md — Deferred ideas and improvements

A holding area for things worth doing but not yet prioritised.

---

## Lightbox — photo transition when navigating

Currently the image fades to black while the next photo downloads, which reads as a loading glitch rather than a deliberate transition.

**~~Cross-fade~~** ✓ Done — outgoing image stays visible as an overlay while the new one loads; both fade simultaneously on load.

**Directional slide** (complements cross-fade)
- Slide old image left on next, right on prev (and vice-versa for incoming)
- Makes navigation feel spatial and directional
- WAAPI, medium complexity — needs direction tracking in `loadPhoto()`

**Zoom-from-thumbnail** (high effort, high reward)
- FLIP-style animation from the grid card's position, same pattern as open/close
- Most cinematic option, consistent with the existing open/close FLIP
- Requires storing card rect at navigate time, not just at open time

---

## Lightbox — faster photo loading

The display-size image for the next/prev photo isn't fetched until navigation.

**~~Preload adjacent images~~** ✓ Done — `lightbox.js` preloads N−1 and N+1 on every navigation.

**Preload on grid card hover**
- When hovering a `.photo-card`, preload its `photo.url.display` into the browser cache
- Helps only when the user pauses before clicking; minimal benefit for fast taps
- ~5 lines in `gallery.js`

**~~`loading="eager"` on first N cards~~** ✓ Done — first 4 cards in the initial render use `loading="eager"`.

**Smaller chunk size**
- Drop from 60 to 30 photos per chunk in `config.js`
- Faster first-chunk inline paint, but doubles JSON requests for the same total
- Mixed trade-off — evaluate once photo count grows significantly

**WebP conversion in the build pipeline**
- Add WebP output to `build/sources/local.js` via sharp
- 30–50% smaller file sizes, major impact on mobile and slower connections
- Requires build pipeline changes and serving both WebP + JPEG fallback

---

## Box-shadow animation (photo card hover)

`box-shadow` causes a repaint on every frame and cannot be GPU-accelerated.

**Pseudo-element shadow technique**
- Add a `::after` pseudo-element to `.photo-card` with the hovered shadow pre-painted at `opacity: 0`
- On hover, transition `opacity: 0 → 1` on the pseudo-element (compositor-only, no repaint)
- The base `box-shadow` remains always painted and never transitions
- Moderate refactor of `photo-card.css`; most visible benefit on low-end devices with many cards in view
