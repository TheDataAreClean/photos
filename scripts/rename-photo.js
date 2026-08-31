#!/usr/bin/env node
/**
 * rename-photo.js
 *
 * Rename one photo's image + sidecar together (the only safe way to change
 * a photo's slug — see "Renaming a photo's file breaks the URL" in
 * CLAUDE.md). Renaming just the sidecar orphans it: local.js looks a
 * sidecar up strictly by the image's current stem, so a sidecar filed under
 * any other name is invisible to the pipeline and gets silently replaced
 * with a fresh blank stub on the next build.
 *
 * Also updates any series/*.md reference (coverPhoto: and the photos:
 * list) so a renamed photo doesn't fall out of its series.
 *
 * Usage:
 *   npm run rename-photo -- <old-id> <new-id>            # preview only
 *   npm run rename-photo -- <old-id> <new-id> --apply     # rename for real
 *
 * Changes the live URL (/photos/{old-id}/ → /photos/{new-id}/) with no
 * redirect — rebuild (`npm run build`) and re-publish after applying.
 */
'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const config = require('../config');
const { isCleanStem } = require('../build/utils/slug');

const PROJECT_DIR  = path.resolve(__dirname, '..');
const PHOTOS_DIR    = path.resolve(PROJECT_DIR, config.local.photosDir);
const SIDECARS_DIR  = path.resolve(PROJECT_DIR, config.local.sidecarsDir);
const SERIES_DIR    = path.resolve(PROJECT_DIR, 'series');
const IMAGE_EXTS    = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif'];

const DRY_RUN = !process.argv.includes('--apply');
const args    = process.argv.slice(2).filter(a => a !== '--apply');
const [oldId, newId] = args;

async function findImage(dir, stem) {
  for (const ext of IMAGE_EXTS) {
    const file = `${stem}${ext}`;
    if (await fs.access(path.join(dir, file)).then(() => true).catch(() => false)) {
      return file;
    }
  }
  return null;
}

async function updateSeriesRefs(oldId, newId) {
  let entries;
  try { entries = await fs.readdir(SERIES_DIR); } catch { return []; }

  const touched = [];
  for (const file of entries.filter(f => f.endsWith('.md'))) {
    const filepath = path.join(SERIES_DIR, file);
    const raw = await fs.readFile(filepath, 'utf8');

    const updated = raw
      // coverPhoto: old-id  (quoted or bare)
      .replace(
        new RegExp(`^(coverPhoto:\\s*["']?)${oldId}(["']?\\s*)$`, 'm'),
        `$1${newId}$2`
      )
      // photos: list item, plain string form: "  - old-id"
      .replace(
        new RegExp(`^(\\s*-\\s*)${oldId}(\\s*)$`, 'm'),
        `$1${newId}$2`
      )
      // photos: list item, object form: "  - id: old-id"
      .replace(
        new RegExp(`^(\\s*-\\s*id:\\s*["']?)${oldId}(["']?\\s*)$`, 'm'),
        `$1${newId}$2`
      );

    if (updated !== raw) {
      if (!DRY_RUN) await fs.writeFile(filepath, updated, 'utf8');
      touched.push(file);
    }
  }
  return touched;
}

async function main() {
  if (!oldId || !newId) {
    console.error('Usage: npm run rename-photo -- <old-id> <new-id> [--apply]');
    process.exit(1);
  }
  if (!isCleanStem(newId)) {
    console.error(`✗ "${newId}" isn't a clean stem (expected YYYY-MM-DD or YYYY-MM-DD-slug, lowercase).`);
    process.exit(1);
  }

  const oldImage = await findImage(PHOTOS_DIR, oldId);
  if (!oldImage) {
    console.error(`✗ No image found for "${oldId}" in ${config.local.photosDir}/`);
    process.exit(1);
  }
  if (await findImage(PHOTOS_DIR, newId)) {
    console.error(`✗ An image already exists at "${newId}" — pick a different new id.`);
    process.exit(1);
  }

  const ext = path.extname(oldImage);
  const newImage = `${newId}${ext}`;

  const oldSidecarPath = path.join(SIDECARS_DIR, `${oldId}.md`);
  const newSidecarPath = path.join(SIDECARS_DIR, `${newId}.md`);
  const hasSidecar = await fs.access(oldSidecarPath).then(() => true).catch(() => false);
  if (await fs.access(newSidecarPath).then(() => true).catch(() => false)) {
    console.error(`✗ A sidecar already exists at "${newId}.md" — pick a different new id.`);
    process.exit(1);
  }

  console.log(DRY_RUN ? '── Dry run (pass --apply to rename) ──\n' : '── Renaming ──\n');
  console.log(`  ${oldImage}  →  ${newImage}`);
  if (hasSidecar) console.log(`  sidecars/${oldId}.md  →  sidecars/${newId}.md`);
  else console.log(`  (no sidecar found for ${oldId} — image only)`);

  const seriesTouched = await updateSeriesRefs(oldId, newId);
  for (const file of seriesTouched) console.log(`  series/${file}  (coverPhoto/photos reference updated)`);

  if (!DRY_RUN) {
    await fs.rename(path.join(PHOTOS_DIR, oldImage), path.join(PHOTOS_DIR, newImage));
    if (hasSidecar) await fs.rename(oldSidecarPath, newSidecarPath);
  }

  console.log(DRY_RUN
    ? '\nRun with --apply to proceed. This changes the live URL — no redirect from the old one.'
    : '\n✓ Renamed. Run `npm run build` and re-publish — the old URL now 404s, nothing redirects it.'
  );
}

main().catch(err => { console.error(err); process.exit(1); });
