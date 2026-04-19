'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const sharp  = require('sharp');
const matter = require('gray-matter');
const { extractExif }                = require('../exif');
const { dateTitleStem, isCleanStem } = require('../utils/slug');
const { ov, ymlStr, ymlNum }         = require('../utils/sidecar');
const { applyWatermark }             = require('../watermark');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif']);

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
  await fs.mkdir(outputDir, { recursive: true });

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
      const raw     = await fs.readFile(path.join(photosDir, `${stem}.md`), 'utf8');
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
    await fs.rename(filepath, path.join(photosDir, newFilename));
    console.log(`  Renamed: ${filename} → ${newFilename}`);

    const oldSidecar = path.join(photosDir, `${stem}.md`);
    const newSidecar = path.join(photosDir, `${newStem}.md`);
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
    const [exifData, sharpMeta, fileStat] = await Promise.all([
      extractExif(filepath),
      sharp(filepath).metadata(),
      fs.stat(filepath),
    ]);

    const sidecar        = await loadSidecar(photosDir, stem, exifData, exifData.dateTaken);
    const overrides      = sidecar?.data?.overrideExif || {};
    const finalDateTaken = ov(sidecar?.data?.dateTaken, exifData.dateTaken);

    const finalExif = {
      camera:        ov(overrides.camera,        exifData.camera),
      lens:          ov(overrides.lens,          exifData.lens),
      focalLength:   ov(overrides.focalLength,   exifData.focalLength),
      focalLength35: ov(overrides.focalLength35, exifData.focalLength35),
      aperture:      ov(overrides.aperture,      exifData.aperture),
      shutterSpeed:  ov(overrides.shutterSpeed,  exifData.shutterSpeed),
      iso:           ov(overrides.iso,           exifData.iso),
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
      const displayBuf  = await sharp(filepath)
        .resize({ width: 2400, withoutEnlargement: true })
        .toBuffer();
      const watermarked = await applyWatermark(displayBuf);

      await Promise.all([
        resizeImage(filepath, path.join(outputDir, thumbName), config.local.thumbWidth),
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
      description: ov(sidecar?.content?.trim(), null),
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
function sidecarStub(exifData, dateTaken) {
  return `---
title:
tags: []

# Edit any value below — leave blank to fall back to EXIF
overrideExif:
  camera:${ymlStr(exifData.camera)}
  lens:${ymlStr(exifData.lens)}
  focalLength:${ymlStr(exifData.focalLength)}
  focalLength35:${ymlStr(exifData.focalLength35)}
  aperture:${ymlStr(exifData.aperture)}
  shutterSpeed:${ymlStr(exifData.shutterSpeed)}
  iso:${ymlNum(exifData.iso)}

dateTaken:${ymlStr(dateTaken)}
---

`.trimEnd() + '\n';
}

async function loadSidecar(dir, stem, exifData, dateTaken) {
  const sidecarPath = path.join(dir, `${stem}.md`);
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(sidecarPath, 'utf8'),
      fs.stat(sidecarPath),
    ]);
    const parsed = matter(content);
    parsed._mtime = stat.mtime.toISOString();
    return parsed;
  } catch {
    const stub = sidecarStub(exifData, dateTaken);
    await fs.writeFile(sidecarPath, stub, 'utf8').catch(() => {});
    return matter(stub);
  }
}

async function resizeImage(src, dest, width) {
  try {
    await sharp(src)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(dest);
  } catch (err) {
    console.warn(`  Resize failed (${path.basename(src)} → ${width}px): ${err.message}`);
  }
}

module.exports = { processLocal };
