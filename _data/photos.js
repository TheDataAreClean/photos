'use strict';

const path   = require('path');
const fs     = require('fs/promises');
const config = require('../config');
const { fetchGlass, fetchHiddenGlassPosts } = require('../build/sources/glass');
const { processLocal }    = require('../build/sources/local');
const { mergeAndSort }    = require('../build/merge');
const { generateOgImage }  = require('../build/og-image');
const { generateFavicon }  = require('../build/gen-favicon');
const { loadSeries }      = require('../build/series');

const CHUNK_SIZE = 60;

module.exports = async function () {
  const outDir   = path.resolve(config.build.outputDir);
  const cacheDir = path.resolve(config.build.cacheDir);
  const dataDir  = path.join(outDir, 'data');

  await Promise.all([
    fs.mkdir(outDir,   { recursive: true }),
    fs.mkdir(cacheDir, { recursive: true }),
    fs.mkdir(dataDir,  { recursive: true }),
  ]);

  const fresh = process.argv.includes('--fresh') || process.env.FRESH === '1';

  const [glassPhotos, localPhotos, seriesMap] = await Promise.all([
    fetchGlass(config, fresh).catch(err => {
      console.warn('  Glass: fetch failed —', err.message);
      return [];
    }),
    processLocal(config),
    loadSeries(),
  ]);

  // Fetch photos that are hidden from the Glass profile but accessible by URL.
  // These are listed as hiddenGlassPhotos: [friendlyId, ...] in series/*.md files.
  const hiddenFriendlyIds = [...new Set(
    Object.values(seriesMap).flatMap(m => m.hiddenGlassPhotos || [])
  )];
  const hiddenPhotos = hiddenFriendlyIds.length
    ? await fetchHiddenGlassPosts(config.glass.username, hiddenFriendlyIds, config, fresh)
        .catch(err => { console.warn('  Glass hidden: fetch failed —', err.message); return []; })
    : [];

  const photos = mergeAndSort([...glassPhotos, ...localPhotos, ...hiddenPhotos]);

  // Apply series membership from series/*.md — single source of truth.
  // Overrides any series/seriesOrder set in individual sidecar files.
  const seriesLookup = {};
  for (const [slug, meta] of Object.entries(seriesMap)) {
    (meta.photos || []).forEach(({ id, order }) => {
      seriesLookup[id] = { slug, order };
    });
  }
  photos.forEach(photo => {
    const s = seriesLookup[photo.id];
    if (s) {
      const meta        = seriesMap[s.slug];
      photo.series      = s.slug;
      photo.seriesOrder = s.order;
      photo.seriesTitle = meta?.title || null;
      photo.seriesCount = meta?.photos?.length || 0;
    }
  });

  console.log(`\n  Glass: ${glassPhotos.length} photos`);
  console.log(`  Local: ${localPhotos.length} photos`);
  console.log(`  Total: ${photos.length} (after dedup + sort)\n`);

  // Write paginated JSON chunks — gallery.js fetches these for infinite scroll.
  // Chunk 1 is also inlined on the index page for instant first paint.
  const chunks = [];
  for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
    chunks.push(photos.slice(i, i + CHUNK_SIZE));
  }
  await Promise.all(
    chunks.map((chunk, i) =>
      fs.writeFile(
        path.join(dataDir, `photos-${i + 1}.json`),
        JSON.stringify(chunk),
        'utf8'
      )
    )
  );

  await Promise.all([
    pruneStaleAssets(photos, chunks.length, outDir, dataDir),
    pruneStaleCache(photos, hiddenFriendlyIds, cacheDir),
  ]);

  // Both generators use the same monthly seed so they rotate in sync
  const monthSeed = new Date().getFullYear() * 12 + new Date().getMonth();

  await generateOgImage(photos, outDir, monthSeed).catch(err => {
    console.warn('  OG image: generation failed —', err.message);
  });

  await generateFavicon(outDir).catch(err => {
    console.warn('  Favicon: generation failed —', err.message);
  });

  return photos;
};

// ── Stale asset cleanup ────────────────────────────────────────────────────
// Derives the exact set of files and page directories that should exist in
// dist/photos/ and dist/data/ from the final photos array, then removes
// anything else. Runs after every build — keeps dist/ always accurate.
async function pruneStaleAssets(photos, chunkCount, outDir, dataDir) {
  const photosDir = path.join(outDir, 'photos');

  // ── dist/photos/ ──────────────────────────────────────
  // Expected image files: basename of every local asset URL.
  const expectedFiles = new Set();
  for (const photo of photos) {
    for (const url of Object.values(photo.url || {})) {
      if (typeof url === 'string' && url.startsWith('/photos/')) {
        expectedFiles.add(path.basename(url));
      }
    }
  }

  // Expected page directories: one per photo ID (permalink /photos/{id}/).
  const expectedDirs = new Set(photos.map(p => p.id));

  let entries;
  try { entries = await fs.readdir(photosDir, { withFileTypes: true }); } catch { entries = []; }

  const staleFiles = entries.filter(e => e.isFile()      && !e.name.startsWith('.') && !expectedFiles.has(e.name));
  const staleDirs  = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && !expectedDirs.has(e.name));

  await Promise.all([
    ...staleFiles.map(e => fs.unlink(path.join(photosDir, e.name)).catch(() => {})),
    ...staleDirs.map(e  => fs.rm(path.join(photosDir, e.name), { recursive: true, force: true }).catch(() => {})),
  ]);

  // ── dist/data/ ────────────────────────────────────────
  // Remove any photos-N.json chunks beyond the current count.
  let dataEntries;
  try { dataEntries = await fs.readdir(dataDir); } catch { dataEntries = []; }

  const staleChunks = dataEntries.filter(f => {
    const m = f.match(/^photos-(\d+)\.json$/);
    return m && parseInt(m[1], 10) > chunkCount;
  });
  await Promise.all(
    staleChunks.map(f => fs.unlink(path.join(dataDir, f)).catch(() => {}))
  );

  const removed = staleFiles.length + staleDirs.length + staleChunks.length;
  if (removed > 0) {
    console.log(`  Pruned: ${staleFiles.length} asset(s), ${staleDirs.length} page dir(s), ${staleChunks.length} chunk(s)\n`);
  }
};

// ── Cache cleanup ──────────────────────────────────────────────────────────
// Removes downloaded-original caches for Glass photos no longer in the photo
// set, and hidden-post caches for friendlyIds no longer referenced by any
// series — otherwise these directories grow unboundedly over time.
async function pruneStaleCache(photos, hiddenFriendlyIds, cacheDir) {
  const expectedImageIds = new Set(
    photos.filter(p => p._glass).map(p => `${p.id}.bin`)
  );
  const expectedHiddenIds = new Set(hiddenFriendlyIds.map(fid => `${fid}.json`));

  const imageCacheDir  = path.join(cacheDir, 'glass-images');
  const hiddenCacheDir = path.join(cacheDir, 'glass-hidden');

  let imageEntries, hiddenEntries;
  try { imageEntries  = await fs.readdir(imageCacheDir); }  catch { imageEntries  = []; }
  try { hiddenEntries = await fs.readdir(hiddenCacheDir); } catch { hiddenEntries = []; }

  const staleImages  = imageEntries.filter(f  => !expectedImageIds.has(f));
  const staleHidden  = hiddenEntries.filter(f => !expectedHiddenIds.has(f));

  await Promise.all([
    ...staleImages.map(f  => fs.unlink(path.join(imageCacheDir, f)).catch(() => {})),
    ...staleHidden.map(f  => fs.unlink(path.join(hiddenCacheDir, f)).catch(() => {})),
  ]);

  const removed = staleImages.length + staleHidden.length;
  if (removed > 0) {
    console.log(`  Pruned cache: ${staleImages.length} image(s), ${staleHidden.length} hidden post(s)\n`);
  }
}
