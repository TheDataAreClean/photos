# CHANGELOG

Reverse chronological. Append-only — no roadmap or ideas here (those live in [FUTURE.md](FUTURE.md)).

**Version bump policy:** MAJOR — visual redesign or change in site concept. MINOR — new feature. PATCH — bug fix, docs update, config/CI change. Never bump for content commits (photo syncs, sidecar edits).

---

## 2026-06-14 — v2.2.2

- chore: `scripts/sweep-glass-descriptions.js` runs on the weekly scheduled CI build — compares each sidecar's description body against Glass's current description and emits a non-blocking `::warning::` annotation if they've drifted (sidecar bodies are authoritative and never auto-overwritten)

---

## 2026-06-14 — v2.2.1

- chore: bump `actions/upload-pages-artifact` from v3 to v5 — v3 runs on Node.js 20, which GitHub Actions deprecates June 16, 2026

---

## 2026-06-14 — v2.2.0

- feat: Atom feed entries restructured for scanability — `<hr>` separators between description, capture date, camera/lens, and tags sections; 📆/📷/🏷️ icons on each section; tags now also rendered as visible `#tag` text (previously only `<category>` XML elements)
- chore: one-time script (`scripts/strip-title-periods.js`) to strip trailing periods from older auto-generated sidecar titles, matching the v2.0.0 title-generation change (text before first period, not first word)

---

## 2026-06-14 — v2.1.1

- perf: Glass grid thumbnails now generated locally as `{id}@thumb.webp` (800px, q85, ~150KB avg) from the same cached original used for watermarking, instead of hotlinking Glass CDN's `image828x0` preset (400–630KB) — ~3.2x smaller, served same-origin

---

## 2026-06-14 — v2.1.0

- feat: Glass `categories` are now pulled into `photo.tags` automatically, surfacing as `<category>` entries in the Atom feed
- feat: sidecar `tags:` field — auto-backfilled from Glass categories for existing photos and pre-filled for new ones; once present, the sidecar value is authoritative (same override pattern as `description`/`overrideExif`) and future Glass category changes won't overwrite it

---

## 2026-06-14 — v2.0.1

- fix: series folder card's peek images now get `loading="eager"` + `fetchpriority="high"` when the folder lands in the first 4 grid slots, matching the priority regular cards already get — fixes slow-loading folder previews above the fold

---

## 2026-06-14 — v2.0.0

- feat: series support — `series/*.md` files define a series (title, description, cover photo); photo sidecars tagged with `series:` + `seriesOrder:` fields
- feat: series folder card in the masonry grid — manila folder aesthetic with peeking photo prints; collapses all photos from a series into one card
- feat: series overlay — full-screen viewer (like lightbox) with thumbnail strip, prev/next, counter; opens from folder card; photo click opens existing lightbox
- fix: Glass ID generation — use text before first period as slug snippet so numbered series like "Gate #12." get unique IDs instead of colliding on "Gate"
- Gate series: 15 photos (#1, #5–#18) tagged as first series
- a11y: series page/overlay — fixed breadcrumb and title contrast, added missing `:focus-visible` styles across series cards, badges, and overlay controls (incl. keyboard-accessible thumbnail strip)
- fix: all `:hover` rules now wrapped in `@media (hover: hover)` (lightbox, stack, desk, photo-page, view-toggle, series)
- refactor: copy-link logic deduplicated into `GalleryCore.copyLink()`, with `execCommand` clipboard fallback for non-secure contexts
- perf: `will-change` hints on lightbox FLIP/zoom and stack-view transitions
- perf: faster local photo processing — single sharp pipeline reused for metadata + thumb + display via `.clone()`
- perf: watermark resize result cached per target size instead of recomputed for every photo
- chore: OG image generator now reads title/subtitle/attribution/cache dir from `config.js` instead of hardcoded duplicates
- chore: stale Glass image/hidden-post cache entries pruned automatically each build
- a11y: photo page primary image gets `decoding="async" fetchpriority="high"`

---

## 2026-05-09 — v1.4.2

- infra: weekly Monday CI cron to pick up Glass edits and new photos; scheduled runs skip deploy when no sidecars changed

---

## 2026-04-24 — v1.4.1

- fix: photo permalink pages now centred on wide screens (`margin: 0 auto`)
- fix: photo permalink pages missing meta-toggle — layout now matches lightbox (open by default, collapsible)
- fix: stray vertical line on lightbox ℹ icon strip — removed `border-left` from toggle button
- fix: masonry grid — heights now measured after column widths are set, preventing overlaps/gaps on resize
- fix: lightbox meta panel state now re-evaluated on orientation change (matchMedia listener)
- fix: stack view deck width now recalculates on resize/orientation change (ResizeObserver)

---

## 2026-04-24 — v1.4.0

- feat: Atom feed at `/feed.xml` — 15 most recent photos, watermarked images, full description, EXIF line, "Captured [date]"
- feat: feed `<updated>` tracks sidecar file mtime — editing a description re-surfaces the entry in readers
- infra: `sidecarUpdatedAt` field on photo objects via `fs.stat()` in `glass.js` and `local.js`
- infra: explicit Glass sync step in CI before build; new sidecars auto-committed back to `main`
- docs: commit tagging policy — content/sync commits never get a version tag

---

## 2026-04-05 — v1.3.2

- docs: OG image font download strategy documented in CLAUDE.md
- docs: CI system fonts trap — `@napi-rs/canvas` invisible text without `fonts-open-sans fonts-liberation`
- docs: `gen:og` script added to npm scripts
- fix: OG image text — correct font sizing, spacing, and bottom padding

---

## 2026-04-05 — v1.3.1

- fix: build reliability — error handling improvements across the pipeline
- infra: GitHub Actions caching for `.cache/` directory

---

## 2026-04-05 — v1.3.0

- feat: monthly OG image generation (`build/og-image.js`) — 6 layout templates, deterministic monthly seed, `@napi-rs/canvas`
- feat: stacked-prints favicon — variant 4 fixed design, pre-rendered to `src/images/`, copied at build time
- fix: OG image text missing in CI — install `fonts-open-sans fonts-liberation` via apt; Schoolbell + IBM Plex downloaded with GitHub release URL (primary) + Google Fonts fallback

---

## 2026-04-05 — v1.2.7

- fix: safe-area edge fades (`.fade-top` / `.fade-bottom`) — two `position: fixed` elements, `z-index: 40`
- fix: all `:hover` rules wrapped in `@media (hover: hover)` — prevents iOS sticky-hover bug
- fix: lightbox animations — FLIP open/close, directional slide, zoom-from-thumbnail
- fix: header visibility on mobile

---

## 2026-04-04 — v1.2.6

- fix: mobile lightbox alignment
- fix: Dynamic Island tint — `theme-color` darkened to match vignette edges
- fix: icon prominence in lightbox actions

---

## 2026-04-04 — v1.2.5

- fix: mobile lightbox centering
- fix: scroll compositing artifacts

---

## 2026-04-04 — v1.2.4

- perf: image preloading — adjacent photos on navigation, `pointerenter` on grid cards, `loading="eager"` + `fetchpriority="high"` on first 4 cards
- perf: `decoding="async"` on card images
- perf: `<link rel="preconnect">` to Glass CDN
- perf: `contain: layout style` on `.photo-card`; dynamic `will-change: transform` on hover
- perf: pseudo-element shadow technique — hover shadow transitions opacity only (compositor-only, no repaint)
- design: lightbox directional slide on prev/next (WAAPI, 260ms/300ms); zoom-from-thumbnail FLIP when card is visible
- a11y: improvements across lightbox and nav

---

## 2026-04-01 — v1.2.3

- update: Glass slug derived from first word of description only — shorter, cleaner URLs
- update: sidecar body auto-strips the repeated title prefix on stub creation
- fix: flip-back button on photo cards
- fix: date stamp bleed-through on card back
- fix: sidecar newlines preserved on write

---

## 2026-03-31 — v1.2.2

- fix: `viewport-fit=cover` restored so wood grain and vignette fill safe zones
- fix: lightbox mobile photo overflow
- fix: cross-fade on lightbox photo load
- fix: iOS safe area handling

---

## 2026-03-31 — v1.2.1

- design: easing tokens updated
- fix: wrap nav on small screens
- fix: iOS Safari layout issues
- perf: shuffle timing, loading performance

---

## 2026-03-31 — v1.2.0

- design: FAB view toggle refined — bare icon buttons, no labels, no background
- fix: swipe gesture reliability
- fix: attribution placement (header + masonry footer)
- design: casino icon for shuffle button

---

## 2026-03-31 — v1.1.1

- design: lightbox info panel layout
- design: card tilt refinements
- design: stack navigation direction
- design: subtitle style

---

## 2026-03-31 — v1.1.0

- feat: stack view — one photo at a time, WAAPI exit/enter transitions (~350ms), swipe, keyboard ← →
- feat: stack chunk proximity trigger — fetches next chunk when within 5 photos of loaded count
- feat: shuffle mode — Fisher-Yates, localStorage persistence, `location.reload()` on toggle
- feat: three-button FAB view toggle (grid / stack / shuffle), `aria-pressed`, localStorage state
- design: design system cleanup — CSS token consolidation

---

## 2026-03-29 — v1.0.0

- feat: Eleventy 3.x gallery with GitHub Pages deploy workflow
- feat: masonry grid with JS layout, infinite scroll (60-photo chunks via `IntersectionObserver`)
- feat: lightbox with FLIP open/close animation (desktop) / fade (mobile)
- feat: per-photo permalink pages with Open Graph tags
- feat: Glass API pagination, slug generation, sidecar create/merge, watermarking
- feat: local photo processor — auto-rename by EXIF date + title, sharp resize, watermark
- feat: Markdown sidecar system — title, tags, EXIF overrides, description body
- feat: CSS design token system (`base.css`) — colours, type scale, fonts, durations
