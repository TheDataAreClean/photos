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

async function fsExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

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
    } catch (err) {
      if (err.message) console.warn('  Glass: cache file invalid —', err.message, '— re-fetching');
    }
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

  await Promise.all(merged.map(photo => watermarkGlassPhoto(photo, imageCacheDir, outputDir, config)));
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

// Build a stable, human-readable ID from date + description snippet.
// Use text before the first period or newline so "Gate #12." → "gate-12" (unique)
// rather than just the first word "Gate" (which collides across a numbered series).
// Shared with scripts/sweep-glass-drift.js so both stay in sync with the ID scheme.
function glassPostId(p, dateTaken) {
  const dateStr     = dateTaken || p.created_at || null;
  const date        = dateStr ? new Date(dateStr) : null;
  const descSnippet = (p.description || '').trim().split(/[.\n]/)[0].trim();
  const stem        = date ? dateTitleStem(date, descSnippet) : toSlug(p.id);
  const datePart    = stem.slice(0, 10);
  const rest        = stem.slice(11);
  const id          = rest ? `${datePart}-glass-${rest}` : `${datePart}-glass`;
  return { id, descSnippet };
}

// ── Unified schema ────────────────────────────────────
function glassToUnified(p) {
  const exif = parseGlassExif(p);

  const { id, descSnippet } = glassPostId(p, exif.dateTaken);

  // Default title: full text before the first period/newline (same slice used for the ID)
  const autoTitle = descSnippet || null;

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
    tags:        (p.categories || []).map(c => c.slug),
    series:      null,
    seriesOrder: null,
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
    } catch (err) {
      console.warn(`  Glass: failed to parse sidecar ${file}: ${err.message}`);
    }
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
    ? photo.description.trim().replace(/^\S+\s*/, '')
    : '';
  const tags = photo.tags?.length
    ? `tags:\n${photo.tags.map(t => `  - ${t}`).join('\n')}\n\n`
    : '';
  return `---
title:${ymlStr(photo.title)}

${tags}# Edit any value below — leave blank to fall back to what Glass provides
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

// ── Insert a tags block (from Glass categories) after the title line ──
function backfillTags(sidecarPath, content, tags) {
  const tagsBlock = `tags:\n${tags.map(t => `  - ${t}`).join('\n')}\n`;
  const updated = content.replace(/^(title:.*\n)/m, `$1\n${tagsBlock}`);
  return fs.writeFile(sidecarPath, updated, 'utf8').then(() => updated);
}

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
    let sidecarMtime = null;
    try {
      let content = await fs.readFile(sidecarPath, 'utf8');
      sidecar = matter(content);

      // Backfill tags from Glass categories on sidecars that don't have a
      // tags key yet — written once, then editable/overridable like any
      // other sidecar field.
      if (sidecar.data.tags === undefined && photo.tags?.length) {
        content = await backfillTags(sidecarPath, content, photo.tags);
        sidecar = matter(content);
      }

      sidecarMtime = (await fs.stat(sidecarPath)).mtime.toISOString();
    } catch { return photo; }

    const d         = sidecar.data || {};
    const overrides = d.overrideExif || {};
    const finalDate = ov(d.dateTaken, photo.dateTaken);

    const mergedSeries = d.series || photo.series || null;
    // seriesOrder: sidecar value → auto-extracted from description → null
    let mergedSeriesOrder = d.seriesOrder != null ? d.seriesOrder : null;
    if (mergedSeriesOrder == null && mergedSeries) {
      const desc = sidecar.content?.trim() || photo.description || '';
      const m = desc.match(/#(\d+)/) || (photo.description || '').match(/#(\d+)/);
      if (m) mergedSeriesOrder = parseInt(m[1], 10);
    }

    return {
      ...photo,
      title:       ov(d.title,            photo.title),
      description: ov(sidecar.content?.trim(), photo.description),
      altText:     ov(d.title,            photo.altText),
      tags:             d.tags?.length ? d.tags : photo.tags,
      series:           mergedSeries,
      seriesOrder:      mergedSeriesOrder,
      sidecarUpdatedAt: sidecarMtime,
      dateTaken:        finalDate,
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

// ── Hidden Glass photos (hidden from profile, fetchable by direct URL) ───────
// Some Glass photos are hidden from the public profile feed but still accessible
// via their individual page URL. The regular posts API omits them entirely.
// This function fetches them by parsing __NEXT_DATA__ from each photo's HTML page.
async function fetchHiddenGlassPosts(username, friendlyIds, config, fresh = false) {
  if (!username || !friendlyIds.length) return [];

  const hiddenCacheDir = path.join(path.resolve(config.build.cacheDir), 'glass-hidden');
  const imageCacheDir  = path.join(path.resolve(config.build.cacheDir), 'glass-images');
  const outputDir      = path.join(path.resolve(config.build.outputDir), 'photos');

  await Promise.all([
    fs.mkdir(SIDECARS_DIR,   { recursive: true }),
    fs.mkdir(hiddenCacheDir, { recursive: true }),
    fs.mkdir(imageCacheDir,  { recursive: true }),
    fs.mkdir(outputDir,      { recursive: true }),
  ]);

  const rawPosts = await Promise.all(
    friendlyIds.map(fid => fetchHiddenPost(username, fid, hiddenCacheDir, fresh))
  );
  const validPosts = rawPosts.filter(Boolean);
  if (!validPosts.length) return [];
  console.log(`  Glass hidden: ${validPosts.length}/${friendlyIds.length} fetched`);

  const photos    = validPosts.map(glassToUnified);
  const autoIdMap = await buildAutoIdMap();
  await ensureSidecars(photos, autoIdMap);
  const merged    = await mergeSidecars(photos, autoIdMap);

  await Promise.all(merged.map(photo => watermarkGlassPhoto(photo, imageCacheDir, outputDir, config)));
  return merged;
}

async function fetchHiddenPost(username, friendlyId, cacheDir, fresh) {
  const cacheFile = path.join(cacheDir, `${friendlyId}.json`);

  if (!fresh) {
    try {
      // Hidden posts rarely change — treat any cached copy as valid
      return JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    } catch {}
  }

  try {
    const res = await fetch(`https://glass.photo/${username}/${friendlyId}`, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) {
      console.warn(`  Glass hidden: ${res.status} — ${friendlyId} (skipped)`);
      return null;
    }

    const html  = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
    if (!match) {
      console.warn(`  Glass hidden: no page data — ${friendlyId} (skipped)`);
      return null;
    }

    const post = JSON.parse(match[1])?.props?.pageProps?.fallbackData?.post;
    if (!post?.id) {
      console.warn(`  Glass hidden: empty post — ${friendlyId} (skipped)`);
      return null;
    }

    await fs.writeFile(cacheFile, JSON.stringify(post), 'utf8');
    return post;
  } catch (err) {
    console.warn(`  Glass hidden: ${err.message} — ${friendlyId} (skipped)`);
    return null;
  }
}

// ── Download + watermark + thumbnail one Glass photo ──
// Glass's own thumbnail presets (e.g. image828x0) are 400-600KB JPEG/AVIF —
// far too large for grid thumbnails. We re-encode a local webp thumb from
// the same downloaded original used for the watermarked display image.
async function watermarkGlassPhoto(photo, imageCacheDir, outputDir, config) {
  const displayUrl = photo.url.display;
  if (!displayUrl) return;

  const wmFilename    = `${photo.id}@wm.webp`;
  const wmPath        = path.join(outputDir, wmFilename);
  const thumbFilename = `${photo.id}@thumb.webp`;
  const thumbPath     = path.join(outputDir, thumbFilename);

  const [wmExists, thumbExists] = await Promise.all([fsExists(wmPath), fsExists(thumbPath)]);
  if (wmExists) photo.url.download = `/photos/${wmFilename}`;
  if (thumbExists) photo.url.thumb = `/photos/${thumbFilename}`;
  if (wmExists && thumbExists) return;

  // Download original (cache to avoid re-fetching if outputs are deleted)
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

  await Promise.all([
    wmExists ? null : (async () => {
      try {
        const resized     = await sharp(originalBuf).resize({ width: 2400, withoutEnlargement: true }).toBuffer();
        const watermarked = await applyWatermark(resized);
        await sharp(watermarked).webp({ quality: 92 }).toFile(wmPath);
        photo.url.download = `/photos/${wmFilename}`;
      } catch (err) {
        console.warn(`  Glass watermark: failed to process ${photo.id}: ${err.message}`);
      }
    })(),
    thumbExists ? null : (async () => {
      try {
        await sharp(originalBuf)
          .resize({ width: config.local.thumbWidth, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(thumbPath);
        photo.url.thumb = `/photos/${thumbFilename}`;
      } catch (err) {
        console.warn(`  Glass thumb: failed to process ${photo.id}: ${err.message}`);
      }
    })(),
  ]);
}

module.exports = { fetchGlass, fetchHiddenGlassPosts, glassPostId };
