# Memories

A static photography gallery for [@thedataareclean](https://glass.photo/thedataareclean). Pulls photos from [Glass.photo](https://glass.photo) and local files, builds with [Eleventy](https://www.11ty.dev/), deploys to GitHub Pages. No database, no server.

Every photo has a plain Markdown sidecar for editing title, description, tags, and EXIF overrides. Drop a photo in `local/`, edit its sidecar, run build — done.

---

## Quickstart

```sh
npm install
# Set your Glass username and site URL in config.js
npm run dev        # → http://localhost:3003
```

Full command reference: [COMMANDS.md](COMMANDS.md)

---

## Folder map

| Path | What's here |
|---|---|
| `config.js` | All site + build configuration |
| `_data/` | Data pipeline — fetches Glass, processes local, outputs JSON chunks |
| `_includes/` | Nunjucks layout shell |
| `src/` | Templates, styles, scripts, Atom feed |
| `build/` | Build-time modules: EXIF, watermark, OG image, sources |
| `scripts/` | CLI utilities: rename, Glass sync |
| `local/` | Drop photos here — auto-processed on build |
| `glass-sidecars/` | One `.md` per Glass photo — auto-created, edit freely |
| `launchd/` | Weekly Glass sync agent for macOS |
| `dist/` | Build output — not committed |

---

## Adding photos

**Glass** — set `glass.username` in `config.js`. Sidecars auto-created in `glass-sidecars/` on first build.

**Local** — drop image files into `local/`. On build: auto-renamed to `YYYY-MM-DD-local-slug.ext`, sidecar created, 800px thumbnail + 2400px display + watermarked download generated.

---

## Photo metadata

Edit the sidecar `.md` file for any photo:

```markdown
---
title: "Bougainvillea."
tags: [street, bengaluru]
overrideExif:
  camera: "Fujifilm X-T50"
  lens: "XF23mmF2 R WR"
  focalLength: "23mm"
  focalLength35: "35mm"
  aperture: "ƒ/2.8"
  shutterSpeed: "1/250s"
  iso: 400
dateTaken: "2026-03-09T08:57:02Z"
---

Description shown in the lightbox and on the photo's permalink page.
```

Leave any `overrideExif` field blank to fall back to what Glass or EXIF provides.

---

## Docs

| File | Contents |
|---|---|
| [README.md](README.md) | This file — what it is, how to start |
| [APP.md](APP.md) | Architecture, data pipeline, design system, deploy model |
| [COMMANDS.md](COMMANDS.md) | All commands, copy-paste ready |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [FUTURE.md](FUTURE.md) | Ideas backlog |
| [CLAUDE.md](CLAUDE.md) | Operating instructions for Claude |
