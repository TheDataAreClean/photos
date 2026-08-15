'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const sharp  = require('sharp');
const matter = require('gray-matter');
const { extractExif }                = require('../exif');
const { dateTitleStem, isCleanStem } = require('../utils/slug');
const { ov, ymlStr, ymlNum, stripImageEmbeds } = require('../utils/sidecar');
const { applyWatermark }             = require('../watermark');

const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif']);
const SIDECARS_DIR = path.resolve('sidecars');

async function fsExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// ── Entry point ───────────────────────────────────────
async function processLocal(config) {
  const photosDir = path.resolve(config.local.photosDir);

  try {
    await fs.access(photosDir);
  } catch {
    console.warn(`  Local: directory not found (${config.local.photosDir}) — skipping`);
    return [];
  }

  const entries    = await fs.readdir(photosDir);
  const imageFiles = entries.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (imageFiles.length === 0) {
    console.warn(`  Local: no images found in ${config.local.photosDir}`);
    return [];
  }

  const outputDir = path.join(path.resolve(config.build.outputDir), 'photos');
  await Promise.all([
    fs.mkdir(outputDir, { recursive: true }),
    fs.mkdir(SIDECARS_DIR, { recursive: true }),
  ]);

  const cleanFiles = await autoRename(imageFiles, photosDir);

  const results = await Promise.all(
    cleanFiles.map(filename => processOne(filename, photosDir, outputDir, config))
  );

  return results.filter(Boolean);
}

// ── Auto-rename messy filenames ───────────────────────
async function autoRename(imageFiles, photosDir) {
  const usedStems = new Set(
    imageFiles.map(f => path.parse(f).name).filter(isCleanStem)
  );

  return Promise.all(imageFiles.map(async filename => {
    const ext  = path.extname(filename).toLowerCase();
    const stem = path.parse(filename).name;

    if (isCleanStem(stem)) return filename;

    const filepath = path.join(photosDir, filename);
    let date;
    try {
      const exif = await extractExif(filepath);
      date = exif.dateTaken ? new Date(exif.dateTaken) : null;
    } catch { date = null; }
    if (!date || isNaN(date)) {
      date = new Date((await fs.stat(filepath)).mtime);
    }

    let title = null;
    try {
      const raw     = await fs.readFile(path.join(SIDECARS_DIR, `${stem}.md`), 'utf8');
      const sidecar = matter(raw);
      title = sidecar.data?.title || null;
    } catch { /* no sidecar yet */ }

    let newStem = dateTitleStem(date, title);
    if (usedStems.has(newStem)) {
      let n = 2;
      while (usedStems.has(`${newStem}-${n}`)) n++;
      newStem = `${newStem}-${n}`;
    }
    usedStems.add(newStem);

    const newFilename = `${newStem}${ext}`;
    try {
      await fs.rename(filepath, path.join(photosDir, newFilename));
      console.log(`  Renamed: ${filename} → ${newFilename}`);
    } catch (err) {
      console.warn(`  Rename skipped (${filename}): ${err.message}`);
      return filename;
    }

    const oldSidecar = path.join(SIDECARS_DIR, `${stem}.md`);
    const newSidecar = path.join(SIDECARS_DIR, `${newStem}.md`);
    try {
      await fs.access(oldSidecar);
      await fs.rename(oldSidecar, newSidecar);
    } catch { /* no sidecar to rename */ }

    return newFilename;
  }));
}

// ── Process one image ─────────────────────────────────
async function processOne(filename, photosDir, outputDir, config) {
  const filepath = path.join(photosDir, filename);
  const stem     = path.parse(filename).name;
  const datePart = stem.slice(0, 10);
  const rest     = stem.slice(11);
  const id       = rest ? `${datePart}-local-${rest}` : `${datePart}-local`;

  const thumbName        = `${stem}@800.webp`;
  const displayFilename  = `${stem}@2400.webp`;
  const downloadFilename = `${stem}@2400-wm.webp`;

  try {
    const source = sharp(filepath);
    const [exifData, sharpMeta, fileStat] = await Promise.all([
      extractExif(filepath),
      source.metadata(),
      fs.stat(filepath),
    ]);

    const sidecar        = await loadSidecar(SIDECARS_DIR, stem, exifData, exifData.dateTaken, filename);
    const d              = sidecar?.data || {};
    const finalDateTaken = ov(d.dateTaken, exifData.dateTaken);

    const finalExif = {
      camera:        ov(d.camera,        exifData.camera),
      lens:          ov(d.lens,          exifData.lens),
      focalLength:   ov(d.focalLength,   exifData.focalLength),
      focalLength35: ov(d.focalLength35, exifData.focalLength35),
      aperture:      ov(d.aperture,      exifData.aperture),
      shutterSpeed:  ov(d.shutterSpeed,  exifData.shutterSpeed),
      iso:           ov(d.iso,           exifData.iso),
      flash:         exifData.flash ?? null,
      gps:           exifData.gps   ?? null,
      dateTaken:     finalDateTaken,
    };

    // Only generate output images when any file is missing — avoids full
    // resize + watermark on every build when nothing has changed.
    const [thumbExists, displayExists, dlExists] = await Promise.all([
      fsExists(path.join(outputDir, thumbName)),
      fsExists(path.join(outputDir, displayFilename)),
      fsExists(path.join(outputDir, downloadFilename)),
    ]);

    if (!thumbExists || !displayExists || !dlExists) {
      const displayBuf  = await source.clone()
        .resize({ width: 2400, withoutEnlargement: true })
        .toBuffer();
      const watermarked = await applyWatermark(displayBuf);

      await Promise.all([
        resizeImage(source.clone(), path.join(outputDir, thumbName), config.local.thumbWidth),
        sharp(displayBuf).webp({ quality: 95 }).toFile(path.join(outputDir, displayFilename)),
        sharp(watermarked).webp({ quality: 95 }).toFile(path.join(outputDir, downloadFilename)),
      ]);
    }

    const aspectRatio = sharpMeta.width && sharpMeta.height
      ? parseFloat((sharpMeta.width / sharpMeta.height).toFixed(4))
      : null;

    return {
      id,
      source:      'local',
      title:       ov(sidecar?.data?.title, null),
      description: ov(stripImageEmbeds(sidecar?.content), null),
      altText:     ov(sidecar?.data?.title, stem.replace(/-/g, ' ')),
      url: {
        full:     `/photos/${filename}`,
        display:  `/photos/${displayFilename}`,
        download: `/photos/${downloadFilename}`,
        thumb:    `/photos/${thumbName}`,
        glass:    null,
      },
      width:       sharpMeta.width  || null,
      height:      sharpMeta.height || null,
      aspectRatio,
      dateTaken:   finalDateTaken,
      dateAdded:   finalDateTaken || fileStat.mtime.toISOString(),
      exif:        finalExif,
      tags:             sidecar?.data?.tags || [],
      series:           sidecar?.data?.series || null,
      seriesOrder:      sidecar?.data?.seriesOrder ?? null,
      sidecarUpdatedAt: sidecar?._mtime || null,
      _local:           { filename, sidecarFound: !!sidecar },
      _glass:      null,
    };
  } catch (err) {
    console.warn(`  Skipping ${filename}: ${err.message}`);
    return null;
  }
}

// ── Sidecar helpers ───────────────────────────────────
// EXIF fields are flattened to top-level frontmatter properties (not nested
// under overrideExif:) so each one shows up as its own editable row in
// Obsidian's Properties panel — a nested object just renders as opaque YAML
// there.
function sidecarStub(exifData, dateTaken, filename) {
  return `---
title:

# Edit any value below — leave blank to fall back to EXIF
camera:${ymlStr(exifData.camera)}
lens:${ymlStr(exifData.lens)}
focalLength:${ymlStr(exifData.focalLength)}
focalLength35:${ymlStr(exifData.focalLength35)}
aperture:${ymlStr(exifData.aperture)}
shutterSpeed:${ymlStr(exifData.shutterSpeed)}
iso:${ymlNum(exifData.iso)}
dateTaken:${ymlStr(dateTaken)}
---

![[${filename}]]

`.trimEnd() + '\n';
}

// Fills in any still-blank overrideExif/dateTaken lines with real values
// extracted from the photo. Needed because a sidecar created ahead of time
// in Obsidian (from the New Photo template) starts with those lines empty —
// unlike a stub auto-created by sidecarStub(), which is pre-filled from EXIF
// immediately. Idempotent: once a line has a value, its regex no longer
// matches, so re-running on an already-filled sidecar is a no-op. Edits the
// raw text directly (not a parse+re-stringify) so comments/formatting the
// user is looking at in Obsidian survive untouched.
const EXIF_STR_FIELDS = ['camera', 'lens', 'focalLength', 'focalLength35', 'aperture', 'shutterSpeed'];

function backfillExifLines(rawContent, exifData, dateTaken) {
  let updated = rawContent;
  let changed = false;

  for (const field of EXIF_STR_FIELDS) {
    if (exifData[field] == null) continue;
    const re = new RegExp(`^(${field}:)[ \\t]*$`, 'm');
    if (re.test(updated)) {
      updated = updated.replace(re, `$1${ymlStr(exifData[field])}`);
      changed = true;
    }
  }

  if (exifData.iso != null) {
    const isoRe = /^(iso:)[ \t]*$/m;
    if (isoRe.test(updated)) {
      updated = updated.replace(isoRe, `$1${ymlNum(exifData.iso)}`);
      changed = true;
    }
  }

  if (dateTaken) {
    const dateRe = /^(dateTaken:)[ \t]*$/m;
    if (dateRe.test(updated)) {
      updated = updated.replace(dateRe, `$1${ymlStr(dateTaken)}`);
      changed = true;
    }
  }

  return { updated, changed };
}

async function loadSidecar(dir, stem, exifData, dateTaken, filename) {
  const sidecarPath = path.join(dir, `${stem}.md`);
  try {
    let [content, stat] = await Promise.all([
      fs.readFile(sidecarPath, 'utf8'),
      fs.stat(sidecarPath),
    ]);

    const backfilled = backfillExifLines(content, exifData, dateTaken);
    if (backfilled.changed) {
      await fs.writeFile(sidecarPath, backfilled.updated, 'utf8');
      content = backfilled.updated;
      stat    = await fs.stat(sidecarPath);
    }

    const parsed = matter(content);
    parsed._mtime = stat.mtime.toISOString();
    return parsed;
  } catch {
    const stub = sidecarStub(exifData, dateTaken, filename);
    await fs.writeFile(sidecarPath, stub, 'utf8').catch(() => {});
    return matter(stub);
  }
}

async function resizeImage(source, dest, width) {
  try {
    await source
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(dest);
  } catch (err) {
    console.warn(`  Resize failed (${path.basename(dest)} → ${width}px): ${err.message}`);
  }
}

module.exports = { processLocal };
