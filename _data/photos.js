'use strict';

const path   = require('path');
const fs     = require('fs/promises');
const config = require('../config');
const { fetchGlass }      = require('../build/sources/glass');
const { processLocal }    = require('../build/sources/local');
const { mergeAndSort }    = require('../build/merge');
const { generateOgImage }  = require('../build/og-image');
const { generateFavicon }  = require('../build/gen-favicon');

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

  const [glassPhotos, localPhotos] = await Promise.all([
    fetchGlass(config, fresh).catch(err => {
      console.warn('  Glass: fetch failed —', err.message);
      return [];
    }),
    processLocal(config),
  ]);

  const photos = mergeAndSort([...glassPhotos, ...localPhotos]);

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

  await pruneStaleAssets(photos, chunks.length, outDir, dataDir);

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
