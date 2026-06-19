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
const https = require('https');
const http  = require('http');

const FONT_CSS      = 'https://fonts.googleapis.com/css2?family=Schoolbell&display=swap';
const FONT_TTF_CACHE = path.resolve('.cache/schoolbell.ttf');
const OUT_PATH      = path.resolve('build/assets/watermark.png');
const TEXT          = '@thedataareclean';

async function main() {
  // ── 1. Ensure Schoolbell TTF is cached ───────────────
  let fontPath = FONT_TTF_CACHE;
  try {
    await fs.access(fontPath);
  } catch {
    console.log('  Watermark: downloading Schoolbell TTF…');
    // Request TTF by sending an old browser UA
    const css = await fetchText(FONT_CSS, {
      'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)',
    });
    const match = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/);
    if (!match) throw new Error('Could not find Schoolbell font URL in Google Fonts CSS');
    const buf = await fetchBuffer(match[1]);
    await fs.mkdir(path.dirname(fontPath), { recursive: true });
    await fs.writeFile(fontPath, buf);
    console.log('  Watermark: Schoolbell TTF cached');
  }

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

// ── HTTP helpers ──────────────────────────────────────
function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(fetchText(res.headers.location, headers));
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return resolve(fetchBuffer(res.headers.location));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

main().catch(err => { console.error('gen-watermark failed:', err.message); process.exit(1); });
