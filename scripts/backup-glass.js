#!/usr/bin/env node
/**
 * backup-glass.js
 *
 * Downloads the best-resolution copy of every Glass photo (visible + hidden)
 * directly from Glass's CDN and saves it, unprocessed, to backup/ and
 * (if configured) the R2 bucket under a backup/ prefix.
 *
 * Why this exists: the normal build pipeline only ever produces a resized,
 * watermarked copy (capped ~2400px wide) in dist/, which isn't even
 * committed — there was previously no durable copy of the actual Glass
 * originals anywhere outside of Glass's own servers. Run this once before
 * disconnecting Glass, so nothing is lost if the account or API access ever
 * goes away.
 *
 * Also saves the raw Glass API response (full metadata: captions, EXIF,
 * categories) as extra insurance, and a manifest mapping each photo ID to
 * its saved filename and source URL.
 *
 * Run with: node scripts/backup-glass.js
 */
'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const config = require('../config');
const { fetchGlass, fetchHiddenGlassPosts } = require('../build/sources/glass');
const { loadSeries }  = require('../build/series');
const { putObject, isConfigured } = require('../build/sources/r2');

const BACKUP_DIR = path.resolve('backup');
const CONCURRENCY = 6;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (ct.includes('png'))  return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('heic')) return '.heic';
  return '.jpg';
}

async function downloadBest(photo) {
  const url = photo.url.full;
  if (!url) return { photo, ok: false, reason: 'no source URL' };

  try {
    const res = await fetch(url);
    if (!res.ok) return { photo, ok: false, reason: `HTTP ${res.status}` };
    const ext    = extFromContentType(res.headers.get('content-type'));
    const buf    = Buffer.from(await res.arrayBuffer());
    const fname  = `${photo.id}${ext}`;
    const dest   = path.join(BACKUP_DIR, fname);

    await fs.writeFile(dest, buf);

    let uploaded = false;
    try {
      uploaded = await putObject(config, `backup/${fname}`, buf);
    } catch (err) {
      console.warn(`  R2 upload failed for ${fname}: ${err.message}`);
    }

    return { photo, ok: true, filename: fname, bytes: buf.length, uploaded, url };
  } catch (err) {
    return { photo, ok: false, reason: err.message };
  }
}

async function main() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  if (!isConfigured(config)) {
    console.warn('  R2 not configured — backing up locally only (backup/), no off-machine copy will be made.');
  }

  console.log('  Fetching fresh Glass data (visible + hidden posts)…');
  const visible = await fetchGlass(config, /* fresh */ true);

  const seriesMap = await loadSeries();
  const hiddenFriendlyIds = [...new Set(
    Object.values(seriesMap).flatMap(m => m.hiddenGlassPhotos || [])
  )];
  const hidden = hiddenFriendlyIds.length
    ? await fetchHiddenGlassPosts(config.glass.username, hiddenFriendlyIds, config, /* fresh */ true)
    : [];

  const all = [...visible, ...hidden];
  console.log(`  ${all.length} Glass photo(s) to back up (${visible.length} visible + ${hidden.length} hidden)…`);

  const results = await mapWithConcurrency(all, CONCURRENCY, downloadBest);

  const ok     = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);

  const manifest = ok.map(r => ({
    id: r.photo.id,
    filename: r.filename,
    sourceUrl: r.url,
    uploadedToR2: r.uploaded,
    bytes: r.bytes,
  }));
  await fs.writeFile(
    path.join(BACKUP_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  // Raw API metadata (captions, EXIF, categories) as extra insurance —
  // independent of how this repo's pipeline currently parses it.
  const rawCache = path.join(path.resolve(config.build.cacheDir), 'glass-raw.json');
  try {
    await fs.copyFile(rawCache, path.join(BACKUP_DIR, 'raw-metadata.json'));
  } catch (err) {
    console.warn(`  Could not copy raw metadata: ${err.message}`);
  }

  console.log(`\n✓ Backed up ${ok.length}/${all.length} photo(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB, to ${BACKUP_DIR}`);
  if (isConfigured(config)) {
    console.log(`  ${ok.filter(r => r.uploaded).length}/${ok.length} also uploaded to R2 under backup/`);
  }
  if (failed.length) {
    console.warn(`✗ ${failed.length} failed:`);
    failed.forEach(r => console.warn(`  ${r.photo.id}: ${r.reason}`));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`✗ backup-glass failed: ${err.message}`);
  process.exit(1);
});
