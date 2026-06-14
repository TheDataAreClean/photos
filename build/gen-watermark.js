'use strict';

/**
 * Generates build/assets/watermark.png — a transparent PNG of
 * "@thedataareclean" in Schoolbell, used by watermark.js for compositing.
 *
 * Run manually:  node build/gen-watermark.js
 * Also called automatically by watermark.js on first build if the PNG
 * doesn't exist yet.
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs   = require('fs/promises');
const path = require('path');
const { ensureSchoolbell } = require('./utils/fonts');

const FONT_TTF_CACHE = path.resolve('.cache/schoolbell.ttf');
const OUT_PATH      = path.resolve('build/assets/watermark.png');
const TEXT          = '@thedataareclean';

async function main() {
  // ── 1. Ensure Schoolbell TTF is cached ───────────────
  console.log('  Watermark: ensuring Schoolbell TTF is cached…');
  const fontPath = await ensureSchoolbell(FONT_TTF_CACHE);
  if (!fontPath) throw new Error('Could not download Schoolbell font from any source');

  // ── 2. Register font and measure text ────────────────
  GlobalFonts.registerFromPath(fontPath, 'Schoolbell');

  // Render at a reference width — watermark.js will scale this PNG
  // proportionally to the target image. 600px wide covers most cases.
  const REF_WIDTH = 600;
  const fontSize  = 28;
  const pad       = 16;

  // Measure on a temporary canvas
  const measure = createCanvas(1, 1);
  const mctx    = measure.getContext('2d');
  mctx.font     = `${fontSize}px Schoolbell`;
  const metrics = mctx.measureText(TEXT);
  const textW   = Math.ceil(metrics.width);
  const textH   = fontSize + 8; // generous line height

  // ── 3. Draw onto a canvas sized to the text ──────────
  const canvas = createCanvas(textW + pad * 2, textH + pad * 2);
  const ctx    = canvas.getContext('2d');

  // Drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur    = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Text fill — warm amber, slightly transparent
  ctx.font      = `${fontSize}px Schoolbell`;
  ctx.fillStyle = 'rgba(255, 220, 160, 0.72)';
  ctx.fillText(TEXT, pad, textH + pad - 6);

  // ── 4. Save as PNG ────────────────────────────────────
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const png = canvas.toBuffer('image/png');
  await fs.writeFile(OUT_PATH, png);
  console.log(`  Watermark: PNG saved → ${path.relative(process.cwd(), OUT_PATH)} (${textW + pad*2}×${textH + pad*2}px)`);
}

main().catch(err => { console.error('gen-watermark failed:', err.message); process.exit(1); });
