#!/usr/bin/env node
/**
 * rename-local.js
 *
 * Preview or apply clean renames for local photos.
 * The build already does this automatically, so this script is mainly
 * useful for previewing what will happen before the first build.
 *
 * Usage:
 *   npm run rename            # preview only
 *   npm run rename -- --apply # rename for real
 */
'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const matter = require('gray-matter');
const { extractExif }               = require('../build/exif');
const { dateTitleStem, isCleanStem } = require('../build/utils/slug');

const LOCAL_DIR  = path.resolve(__dirname, '../local');
const DRY_RUN    = !process.argv.includes('--apply');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif']);

async function main() {
  const entries = await fs.readdir(LOCAL_DIR);
  const images  = entries.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (!images.length) { console.log('No images in ./local/'); return; }

  const usedStems = new Set(
    images.map(f => path.parse(f).name).filter(isCleanStem)
  );

  const plan = await Promise.all(images.map(async filename => {
    const stem = path.parse(filename).name;
    if (isCleanStem(stem)) return null; // already clean

    const ext      = path.extname(filename).toLowerCase();
    const filepath = path.join(LOCAL_DIR, filename);

    let date = null;
    try {
      const exif = await extractExif(filepath);
      date = exif.dateTaken ? new Date(exif.dateTaken) : null;
    } catch {}
    if (!date || isNaN(date)) date = new Date((await fs.stat(filepath)).mtime);

    let title = null;
    try {
      const raw = await fs.readFile(path.join(LOCAL_DIR, `${stem}.md`), 'utf8');
      title = matter(raw).data?.title || null;
    } catch {}

    let newStem = dateTitleStem(date, title);
    if (usedStems.has(newStem)) {
      let n = 2;
      while (usedStems.has(`${newStem}-${n}`)) n++;
      newStem = `${newStem}-${n}`;
    }
    usedStems.add(newStem);

    const hasSidecar = await fs.access(path.join(LOCAL_DIR, `${stem}.md`)).then(() => true).catch(() => false);

    return { stem, newStem, ext, filename, newFile: `${newStem}${ext}`, hasSidecar };
  }));

  const changes = plan.filter(Boolean);

  if (!changes.length) { console.log('All filenames already clean.'); return; }

  console.log(DRY_RUN ? '── Dry run (pass --apply to rename) ──\n' : '── Renaming ──\n');

  for (const { filename, newFile, stem, newStem, hasSidecar } of changes) {
    console.log(`  ${filename}  →  ${newFile}`);
    if (hasSidecar) console.log(`  ${stem}.md  →  ${newStem}.md`);
    console.log();

    if (!DRY_RUN) {
      await fs.rename(path.join(LOCAL_DIR, filename), path.join(LOCAL_DIR, newFile));
      if (hasSidecar) {
        await fs.rename(
          path.join(LOCAL_DIR, `${stem}.md`),
          path.join(LOCAL_DIR, `${newStem}.md`)
        );
      }
    }
  }

  console.log(DRY_RUN
    ? `${changes.length} file(s) would be renamed. Run with --apply to proceed.`
    : `✓ ${changes.length} file(s) renamed.`
  );
}

main().catch(err => { console.error(err); process.exit(1); });
