'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const matter = require('gray-matter');
const sharp  = require('sharp');
const { toSlug, dateTitleStem } = require('../utils/slug');
const { ov, ymlStr, ymlNum }    = require('../utils/sidecar');
const { applyWatermark, fetchBuffer } = require('../watermark');

const GLASS_API    = 'https://glass.photo/api/v3/users';
const PAGE_SIZE    = 50;
const SIDECARS_DIR = path.resolve('glass-sidecars');

// ── Public entry point ────────────────────────────────
async function fetchGlass(config, fresh = false) {
  if (!config.glass.username) return [];

  await fs.mkdir(SIDECARS_DIR, { recursive: true });

  const cacheFile = path.join(path.resolve(config.build.cacheDir), 'glass-raw.json');

  let raw;

  if (!fresh) {
    try {
      const stat = await fs.stat(cacheFile);
      const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
      if (ageMinutes < config.build.cacheTTLMinutes) {
        raw = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        console.log(`  Glass: loaded ${raw.length} from cache`);
      }
    } catch { /* cache miss */ }
  }

  if (!raw) {
    console.log(`  Glass: fetching @${config.glass.username}…`);
    raw = await paginate(config.glass.username, config.glass.token, config.glass.maxPhotos);
    await fs.writeFile(cacheFile, JSON.stringify(raw, null, 2), 'utf8');
  }

  // Re-run unification every build (so ID/slug changes take effect immediately)
  const photos = raw.map(glassToUnified);

  // Build glassAutoId → sidecar-path map once so findSidecarPath is O(1) per photo
  const autoIdMap = await buildAutoIdMap();

  await ensureSidecars(photos, autoIdMap);
  const merged = await mergeSidecars(photos, autoIdMap);

  // Download + watermark display images, serve locally
  const outputDir     = path.join(path.resolve(config.build.outputDir), 'photos');
  const imageCacheDir = path.join(path.resolve(config.build.cacheDir), 'glass-images');
  await fs.mkdir(outputDir,      { recursive: true });
  await fs.mkdir(imageCacheDir,  { recursive: true });

  await Promise.all(merged.map(photo => watermarkGlassPhoto(photo, imageCacheDir, outputDir)));
  return merged;
}

// ── Pagination ────────────────────────────────────────
async function paginate(username, token, maxPhotos) {
  const all = [];
  let cursor = null;

  while (all.length < maxPhotos) {
    const url = cursor
      ? `${GLASS_API}/${username}/posts?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
      : `${GLASS_API}/${username}/posts?limit=${PAGE_SIZE}`;

    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Glass API ${res.status} — ${url}`);

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    cursor = res.headers.get('x-cursor-next') || null;
    if (!cursor) break;
  }

  return all.slice(0, maxPhotos);
}

// ── Unified schema ────────────────────────────────────
function glassToUnified(p) {
  const exif = parseGlassExif(p);

  // Build a stable, human-readable ID from date + description snippet
  const dateStr     = exif.dateTaken || p.created_at || null;
  const date        = dateStr ? new Date(dateStr) : null;
  const descSnippet = (p.description || '').trim().split(/\s+/).slice(0, 1).join(' ');
  const stem        = date ? dateTitleStem(date, descSnippet) : toSlug(p.id);
  const datePart    = stem.slice(0, 10);
  const rest        = stem.slice(11);
  const id          = rest ? `${datePart}-glass-${rest}` : `${datePart}-glass`;

  // Default title: first word of the Glass description
  const autoTitle = p.description
    ? p.description.trim().split(/\s+/)[0] || null
    : null;

  return {
    id,
    source:      'glass',
    title:       autoTitle,
    description: p.description || null,
    altText:     p.description ? p.description.slice(0, 80) : null,
    url: {
      full:     p.image3072x3072 || p.image2048x2048 || p.image1656x0,
      display:  p.image1656x0   || p.image2048x2048,
      download: null,   // set by watermarkGlassPhoto
      thumb:    p.image828x0    || p.image640x640,
      glass:    p.share_url     || null,
    },
    width:       p.width  || null,
    height:      p.height || null,
    aspectRatio: p.width && p.height
      ? parseFloat((p.width / p.height).toFixed(4))
      : null,
    dateTaken:  exif.dateTaken,
    dateAdded:  p.created_at || null,
    exif,
    tags:       [],
    _glass: { id: p.id, friendlyId: p.friendly_id },
    _local: null,
  };
}

function parseGlassExif(p) {
  const e = p.exif || {};

  const cameraName = p.camera
    ? formatGlassCamera(p.camera.maker, p.camera.model)
    : (e.camera || null);

  const lensName = p.lens
    ? (p.lens.model || null)
    : (e.lens || null);

  let focalLength   = null;
  let focalLength35 = null;
  if (e.focal_length) {
    const m = e.focal_length.match(/^(\d+mm)\s*\((\d+mm)\)/);
    if (m) { focalLength = m[1]; focalLength35 = m[2]; }
    else     focalLength = e.focal_length;
  }

  return {
    camera:       cameraName,
    lens:         lensName,
    focalLength,
    focalLength35,
    aperture:     e.aperture      || null,
    shutterSpeed: e.exposure_time || null,
    iso:          e.iso ? parseInt(e.iso, 10) : null,
    flash:        null,
    gps:          null,
    dateTaken:    (p.exif?.date_time_original || p.created_at) || null,
  };
}

function formatGlassCamera(maker, model) {
  if (!model) return maker || null;
  if (!maker) return model;
  if (model.toUpperCase().startsWith(maker.toUpperCase())) return model;
  return `${maker} ${model}`;
}

// ── Sidecar lookup ────────────────────────────────────
// Build a map of glassAutoId → sidecar path once per build run.
// This replaces O(n) directory scans per photo with a single upfront scan.
async function buildAutoIdMap() {
  const map = new Map();
  let entries;
  try { entries = await fs.readdir(SIDECARS_DIR); } catch { return map; }
  await Promise.all(entries.filter(f => f.endsWith('.md')).map(async file => {
    try {
      const parsed = matter(await fs.readFile(path.join(SIDECARS_DIR, file), 'utf8'));
      const aid = parsed.data?.glassAutoId;
      if (aid) map.set(aid, path.join(SIDECARS_DIR, file));
    } catch {}
  }));
  return map;
}

async function findSidecarPath(photoId, autoIdMap) {
  const direct = path.join(SIDECARS_DIR, `${photoId}.md`);
  try { await fs.access(direct); return direct; } catch {}
  return autoIdMap?.get(photoId) || null;
}

// ── Sidecar management ────────────────────────────────
const SIDECAR_STUB = (photo) => {
  const e = photo.exif || {};
  const body = photo.description
    ? photo.description.trim().split(/\s+/).slice(1).join(' ')
    : '';
  return `---
title:${ymlStr(photo.title)}
tags: []

# Edit any value below — leave blank to fall back to what Glass provides
overrideExif:
  camera:${ymlStr(e.camera)}
  lens:${ymlStr(e.lens)}
  focalLength:${ymlStr(e.focalLength)}
  focalLength35:${ymlStr(e.focalLength35)}
  aperture:${ymlStr(e.aperture)}
  shutterSpeed:${ymlStr(e.shutterSpeed)}
  iso:${ymlNum(e.iso)}

dateTaken:${ymlStr(photo.dateTaken)}
---

${body}
`.trimEnd() + '\n';
};

async function ensureSidecars(photos, autoIdMap) {
  await Promise.all(photos.map(async photo => {
    const found = await findSidecarPath(photo.id, autoIdMap);
    if (!found) {
      await fs.writeFile(path.join(SIDECARS_DIR, `${photo.id}.md`), SIDECAR_STUB(photo), 'utf8');
    }
  }));
}

async function mergeSidecars(photos, autoIdMap) {
  return Promise.all(photos.map(async photo => {
    const sidecarPath = await findSidecarPath(photo.id, autoIdMap);
    let sidecar = null;
    try {
      sidecar = matter(await fs.readFile(sidecarPath, 'utf8'));
    } catch { return photo; }

    const d         = sidecar.data || {};
    const overrides = d.overrideExif || {};
    const finalDate = ov(d.dateTaken, photo.dateTaken);

    return {
      ...photo,
      title:       ov(d.title,            photo.title),
      description: ov(sidecar.content?.trim(), photo.description),
      altText:     ov(d.title,            photo.altText),
      tags:        d.tags?.length ? d.tags : photo.tags,
      dateTaken:   finalDate,
      exif: {
        ...photo.exif,
        camera:        ov(overrides.camera,        photo.exif.camera),
        lens:          ov(overrides.lens,          photo.exif.lens),
        focalLength:   ov(overrides.focalLength,   photo.exif.focalLength),
        focalLength35: ov(overrides.focalLength35, photo.exif.focalLength35),
        aperture:      ov(overrides.aperture,      photo.exif.aperture),
        shutterSpeed:  ov(overrides.shutterSpeed,  photo.exif.shutterSpeed),
        iso:           ov(overrides.iso,           photo.exif.iso),
        dateTaken:     finalDate,  // keep in sync with photo.dateTaken
      },
    };
  }));
}

// ── Download + watermark one Glass photo ─────────────
async function watermarkGlassPhoto(photo, imageCacheDir, outputDir) {
  const displayUrl = photo.url.display;
  if (!displayUrl) return;

  const wmFilename = `${photo.id}@wm.webp`;
  const wmPath     = path.join(outputDir, wmFilename);

  // Skip if already generated
  try { await fs.access(wmPath); photo.url.download = `/photos/${wmFilename}`; return; } catch { /* generate */ }

  // Download original (cache to avoid re-fetching if wm output is deleted)
  const cachedPath = path.join(imageCacheDir, `${photo.id}.bin`);
  let originalBuf;
  try {
    originalBuf = await fs.readFile(cachedPath);
  } catch {
    try {
      originalBuf = await fetchBuffer(displayUrl);
      await fs.writeFile(cachedPath, originalBuf);
    } catch (err) {
      console.warn(`  Glass watermark: failed to download ${photo.id}: ${err.message}`);
      return;
    }
  }

  try {
    const resized     = await sharp(originalBuf).resize({ width: 2400, withoutEnlargement: true }).toBuffer();
    const watermarked = await applyWatermark(resized);
    await sharp(watermarked).webp({ quality: 92 }).toFile(wmPath);
    photo.url.download = `/photos/${wmFilename}`;
  } catch (err) {
    console.warn(`  Glass watermark: failed to process ${photo.id}: ${err.message}`);
  }
}

module.exports = { fetchGlass };
