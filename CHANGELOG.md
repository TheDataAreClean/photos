# CHANGELOG

Reverse chronological. Append-only — no roadmap or ideas here (those live in [FUTURE.md](FUTURE.md)).

**Version bump policy:** MAJOR — visual redesign or change in site concept. MINOR — new feature. PATCH — bug fix, docs update, config/CI change. Never bump for content commits (photo syncs, sidecar edits).

---

## UNRELEASED

- add: `build/sources/r2.js` + `scripts/sync-r2.js` (`npm run sync:r2`) — private Cloudflare R2 bucket now backs up `local/` originals and is what CI actually builds from, since `local/` is gitignored and a fresh checkout never has anything dropped in there. `_data/photos.js` downloads anything missing from the bucket before `processLocal()` runs; both directions no-op silently when R2 env vars aren't set. New dep: `@aws-sdk/client-s3`.
- add: `deploy.yml` "Build" step now passes R2 credentials through from the `BUCKET_NAME` / `ENDPOINT_URL` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` repo secrets.
- add: `scripts/publish-local.js` (`npm run publish:local`) + `scripts/local-sync.sh` + `launchd/com.thedataareclean.photos-local-sync.plist` — automates the last manual step: backs up new `local/` originals to R2, then commits + pushes `sidecars/` if any changed (the push triggers the normal CI build/deploy). Runs every 20 min via launchd once installed. Only ever `git add`s `sidecars/`, never anything else in the repo.
- add: `backfillExifLines()` in `local.js` — writes real EXIF values (camera/lens/aperture/etc, one per line) into a sidecar's still-blank EXIF/`dateTaken` fields the first time the photo is processed, so a note created ahead of time in Obsidian (via the New Photo template, before the photo exists in the pipeline) ends up showing the real values instead of staying permanently blank. Idempotent, edits the raw text in place so comments/formatting aren't disturbed.
- add: `stripImageEmbeds()` (now shared, `build/utils/sidecar.js`) — an image embed (`![[photo.jpg]]` or `![](url)`) left in the sidecar body is stripped before the body becomes the photo's `description`, so you can see the photo inline while captioning without the embed syntax leaking onto the live site. Used by both `glass.js` and `local.js`.
- update: **`glass-sidecars/` renamed to `sidecars/`** and is now the single sidecar home for every photo regardless of source (`local.js` sidecars moved out of `local/` and into it too — `local/` now holds only image files again). `glass.js`, `local.js`, `rename-glass.js`, `strip-title-periods.js`, `sweep-glass-drift.js`, and `deploy.yml`'s commit step all updated to the new path.
- remove: `tags:` is no longer auto-populated or auto-backfilled for Glass sidecars either (`SIDECAR_STUB` and the `backfillTags()` write-back both removed from `glass.js` — the latter was silently re-inserting a stripped `tags:` block on every build, since it ran whenever `sidecar.data.tags === undefined`). All 109 existing sidecars with a `tags:` block had it stripped. `local.js` sidecars already had this removed earlier in this same batch.
- add: `scripts/backup-glass.js` — downloads the best-resolution copy of every Glass photo (visible + hidden, ~112) straight from Glass's CDN to `backup/` and, if R2 is configured, to the bucket under a `backup/` prefix. The normal build pipeline never stored a full-resolution, unwatermarked copy of Glass originals anywhere — only a resized/watermarked copy in the uncommitted `dist/`. Run once, ahead of dropping Glass, so nothing is lost if the account or API access goes away. Also saves a manifest and the raw Glass API metadata. New export: `putObject()` in `r2.js`.
- remove: Ghost publish script (`scripts/publish-ghost.js`, `npm run publish:ghost`, `@tryghost/admin-api`, `marked`) — built by mistake, pulled before it ever shipped as a real feature.
- update: **EXIF fields flattened to top-level sidecar properties** — `camera`/`lens`/`focalLength`/`focalLength35`/`aperture`/`shutterSpeed`/`iso` are no longer nested under `overrideExif:`. A nested object doesn't render as individual editable fields in Obsidian's Properties panel; flat top-level keys do. Applied to `sidecarStub()`/`SIDECAR_STUB` in both `local.js` and `glass.js`, `mergeSidecars()`/`processOne()`'s reads, `backfillExifLines()`, and `Templates/New Photo.md`. All 114 existing sidecars migrated in place (values preserved).
- add: auto-generated sidecar stubs now embed the photo itself — local stubs get `![[filename]]` (the real file in `local/`), Glass stubs get `![](cdn-url)` (Glass's own CDN URL). Every sidecar shows its photo when opened in Obsidian, not just ones built from the template by hand. All 112 existing Glass sidecars retrofitted with their embed (matched via the `backup/manifest.json` produced by `backup-glass.js`); 2 stale/orphaned sidecars with no current Glass match were left alone.
- update: **`glass-backup/` renamed to `backup/`**, and **`-glass-` dropped from every photo ID going forward** (`glassToUnified()` in `glass.js`: `YYYY-MM-DD-glass-slug` → `YYYY-MM-DD-slug`) — no more source-labeled naming now that Glass isn't actively used. **This changes the URL of every existing Glass-derived photo page** (`/photos/YYYY-MM-DD-glass-slug/` → `/photos/YYYY-MM-DD-slug/`); no redirects were set up for old links. Local photo IDs are unaffected (still `YYYY-MM-DD-local-slug`). All 112 existing `sidecars/*.md` filenames, their `glassAutoId` values, `series/gates-of-gokarna.md`'s 18 photo references, and `backup/`'s files + manifest were all migrated to match. `rename-glass.js` and `sweep-glass-drift.js` updated for the new pattern.
- remove: the "Glass" link button removed from the UI entirely — grid photo-card back, lightbox (shared markup in `index.njk` + `series.njk`, wired in `lightbox.js`), and the photo permalink page (`photo.njk`). `photo.url.glass` still exists in the data model, just unused by any template now.

---

## 2026-08-03 — v2.3.0

- add: `src/robots.txt` (passthrough-copied to `dist/robots.txt`) disallows all crawlers, with named entries for GPTBot, ClaudeBot, Google-Extended, CCBot, and other AI training/retrieval bots — site is not meant to be indexed or used for LLM training
- add: `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">` in `base.njk` head, applied to every page
- fix: `#lightbox::before` safe-area gradient fade removed from `lightbox.css` — `html { background-color: var(--bg) }` already fills the iOS safe-area zones, making the overlay redundant; stale references to it in `.lightbox__layout`/`.lightbox__close` comments and in `APP.md` cleaned up to match
- docs: `base.njk`'s pre-CSS-load inline background colours (`html` style attribute, `<style>` block, `theme-color` meta) cross-referenced with `--bg` in `base.css` via comments — these can't reference the CSS token itself since they paint before the stylesheet loads, so a comment now flags that all four must be updated together

---

## 2026-08-02 — v2.2.8

- fix: `local/*` added to `.gitignore` (keeping `local/.gitkeep`) — original source photos carry unstripped GPS/EXIF before the build pipeline processes them; a broad `git add` could otherwise commit raw location data to this public repo

---

## 2026-08-01 — v2.2.7

- fix: `fetchGlass()` in `glass.js` now creates `.cache/` before writing `glass-raw.json` — cold-cache CI runs (no prior `actions/cache` hit) failed the "Sync Glass API" step with `ENOENT` and aborted the whole deploy before Build/Upload/Deploy could run

---

## 2026-06-19 — v2.2.6

- perf: non-critical CSS (`lightbox.css`, `photo-page.css`, `stack.css`, `series.css`) and Google Fonts now loaded async via `rel="preload" as="style"` with `<noscript>` fallbacks — reduces render-blocking resources
- fix: `cardForIndex()` live DOM lookup in `lightbox.js` replaces stale `cardEls[]` array snapshot
- fix: stack.js keydown listener stored by name for `removeEventListener` cleanup; `ResizeObserver` disconnects when page is hidden to avoid wasted work
- fix: `autoRename()` in `local.js` wraps `fs.rename` in try/catch — failure now warns and continues rather than crashing the build
- fix: glass.js image cache invalidated on sharp failure so corrupt cached files are re-downloaded next build rather than failing permanently
- perf: `Promise.all` for parallel prune calls in `_data/photos.js`
- perf: `gallery.js` `findIndex` uses `Math.min` spread instead of manual loop
- refactor: `buildExifDl(exif, className)` extracted as single implementation on `window.GalleryCore`; duplicate removed from `lightbox.js`
- refactor: `config.js` validates `SITE_URL` against http/https protocol before using it
- fix: `gallery.js` warns on missing `#gallery-root` instead of silently failing

## 2026-06-19 — v2.2.5

- fix: background changed from wood-grain desk surface (`#251108` + SVG texture) to plain dark (`#111`) — safe-area zones (Dynamic Island, Liquid Glass browser bar) now fill naturally via `html { background-color: var(--bg) }` with no overlay required
- fix: `theme-color` set to `#000` — controls iOS status bar / Dynamic Island chrome colour
- fix: `body { overflow-x: clip }` — replaces `overflow-x: hidden` which can trap `position: fixed` children on iOS Safari
- fix: photo card edges smoother — `translateZ(0)` added to all card `transform` values, forcing GPU compositing and eliminating rotation aliasing
- fix: lightbox mobile edge fades now use literal `px` stops only — `env()` used directly as a gradient color-stop fails silently on iOS Safari and drops the entire `background` declaration
- chore: removed all `.fade-top`/`.fade-bottom` safe-area overlay machinery (divs, CSS, `viewport-fit=cover`) — superseded by the background approach

---

## 2026-06-14 — v2.2.3

- chore: drift sweep renamed to `scripts/sweep-glass-drift.js` and extended to also check tags — flags Glass categories added after the sidecar's `tags:` were set, same non-blocking `::warning::` pattern as description drift

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
