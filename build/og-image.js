'use strict';

/**
 * Monthly OG image generator.
 *
 * Picks a layout template and photo set deterministically based on the current
 * calendar month (same build always produces the same image within a month).
 * Writes dist/og-image.jpg.
 *
 * Called from _data/photos.js after the photo array is assembled.
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const https  = require('https');
const http   = require('http');
const fs     = require('fs/promises');
const path   = require('path');

const W = 1200;
const H = 630;

// ── Config ────────────────────────────────────────────────────────────────
const CACHE_DIR = path.resolve('.cache');
const TITLE     = 'Memories';
const SUBTITLE  = 'My experiments behind the viewfinder.';
const ATTR      = '@thedataareclean';

// ── Seeded PRNG (LCG) — deterministic per calendar month ──────────────────
function seededRand(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Layout templates ──────────────────────────────────────────────────────
// w    — card width as % of canvas width
// ar   — aspect ratio string "W/H" (e.g. "3/4" = portrait)
// left / right — % of canvas width (mutually exclusive)
// top  — % of canvas height
// rot  — rotation in degrees
// z    — z-index (draw order)

function ar(s) {
  const [n, d] = s.split('/').map(Number);
  return d / n; // height multiplier = h/w
}

const TEMPLATES = [
  // 1 — four cards, scattered
  [
    { w: 21, ar: ar('3/4'), left:  4, top: 11, rot:  -7.0, z: 3 },
    { w: 25, ar: ar('2/3'), left: 20, top:  8, rot:   3.5, z: 4 },
    { w: 21, ar: ar('4/5'), left: 42, top: 14, rot:  -4.5, z: 3 },
    { w: 19, ar: ar('3/4'), right: 5, top:  9, rot:   6.0, z: 2 },
  ],
  // 2 — three cards, centred overlap
  [
    { w: 30, ar: ar('3/4'), left:  7, top: 4, rot: -9, z: 2 },
    { w: 32, ar: ar('2/3'), left: 34, top: 2, rot:  1, z: 4 },
    { w: 28, ar: ar('3/4'), right: 5, top: 6, rot:  8, z: 3 },
  ],
  // 3 — five cards, dense strip
  [
    { w: 18, ar: ar('3/4'), left:  1, top:  8, rot: -8, z: 2 },
    { w: 20, ar: ar('2/3'), left: 16, top:  6, rot:  5, z: 3 },
    { w: 22, ar: ar('3/4'), left: 33, top:  9, rot: -3, z: 4 },
    { w: 19, ar: ar('4/5'), left: 52, top:  7, rot:  7, z: 3 },
    { w: 18, ar: ar('3/4'), right: 2, top: 10, rot: -6, z: 2 },
  ],
  // 4 — two large, one accent, asymmetric
  [
    { w: 36, ar: ar('3/4'), left:  2, top: 1, rot: -6, z: 2 },
    { w: 33, ar: ar('2/3'), left: 36, top: 4, rot:  4, z: 3 },
    { w: 16, ar: ar('3/4'), right: 3, top: 7, rot: -9, z: 2 },
  ],
  // 5 — diagonal cascade
  [
    { w: 20, ar: ar('3/4'), left:  2, top: 5, rot: -10, z: 2 },
    { w: 22, ar: ar('2/3'), left: 19, top: 8, rot:  -4, z: 3 },
    { w: 15, ar: ar('2/3'), left: 38, top: 8, rot:   3, z: 4 },
    { w: 20, ar: ar('4/5'), left: 57, top: 7, rot:   8, z: 3 },
    { w: 18, ar: ar('3/4'), right: 2, top: 5, rot:  -5, z: 2 },
  ],
  // 6 — three cards, wide fan
  [
    { w: 24, ar: ar('3/4'), left:  5, top: 7, rot: -9, z: 2 },
    { w: 27, ar: ar('2/3'), left: 35, top: 4, rot:  0, z: 4 },
    { w: 22, ar: ar('3/4'), right: 4, top: 7, rot:  8, z: 3 },
  ],
];

// ── Font setup ────────────────────────────────────────────────────────────
async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function fetchBuf(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers, timeout: 15000 }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchBuf(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function ensureFonts() {
  const schoolbellPath = path.join(CACHE_DIR, 'schoolbell.ttf');
  const ibmPath        = path.join(CACHE_DIR, 'ibm-plex-sans-500.ttf');

  // Download IBM Plex Sans 500 if not cached
  if (!(await fileExists(ibmPath))) {
    let downloaded = false;

    // Primary: Google Fonts CSS v1 — returns TTF for unrecognised UA
    try {
      const css = (await fetchBuf(
        'https://fonts.googleapis.com/css?family=IBM+Plex+Sans:500',
        { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0)' }
      )).toString();
      const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
      if (match) {
        const buf = await fetchBuf(match[1]);
        await fs.writeFile(ibmPath, buf);
        downloaded = true;
      }
    } catch { /* fall through to backup */ }

    // Fallback: IBM Plex GitHub release (stable tagged URL)
    if (!downloaded) {
      try {
        const buf = await fetchBuf(
          'https://github.com/IBM/plex/raw/v6.4.0/packages/ibm-plex-sans/fonts/complete/ttf/IBMPlexSans-Medium.ttf'
        );
        await fs.writeFile(ibmPath, buf);
        downloaded = true;
      } catch (e) {
        console.warn('  OG image: IBM Plex Sans download failed —', e.message, '(will use system font)');
      }
    }
  }

  // Download Schoolbell if not cached
  if (!(await fileExists(schoolbellPath))) {
    try {
      const css = (await fetchBuf(
        'https://fonts.googleapis.com/css?family=Schoolbell',
        { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0)' }
      )).toString();
      const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
      if (match) {
        const buf = await fetchBuf(match[1]);
        await fs.writeFile(schoolbellPath, buf);
      }
    } catch (e) {
      console.warn('  OG image: Schoolbell download failed —', e.message, '(attribution will use cursive fallback)');
    }
  }

  // Register fonts with @napi-rs/canvas
  if (await fileExists(ibmPath)) {
    try { GlobalFonts.registerFromPath(ibmPath, 'IBM Plex Sans'); } catch { /* ignore */ }
  }
  if (await fileExists(schoolbellPath)) {
    try { GlobalFonts.registerFromPath(schoolbellPath, 'Schoolbell'); } catch { /* ignore */ }
  }
}

// ── Image loading ─────────────────────────────────────────────────────────
async function getImageBuffer(photo, distDir) {
  const { display } = photo.url || {};
  if (!display) return null;

  // Local photos — root-relative path, read from dist/
  if (!display.startsWith('http')) {
    try {
      return await fs.readFile(path.join(distDir, display));
    } catch { return null; }
  }

  // Glass photos — check .cache/glass-images/${id}.bin first
  if (photo.id) {
    const cached = path.join(CACHE_DIR, 'glass-images', `${photo.id}.bin`);
    if (await fileExists(cached)) {
      return fs.readFile(cached);
    }
  }

  // Fallback: fetch from CDN
  return fetchBuf(display).catch(() => null);
}

// ── Canvas drawing ────────────────────────────────────────────────────────
function drawBackground(ctx) {
  // Dark teak base
  ctx.fillStyle = '#251108';
  ctx.fillRect(0, 0, W, H);

  // Warm amber glow — approximates CSS radial-gradient(ellipse 160% 90% at 50% 45%, …)
  ctx.save();
  ctx.transform(1.6, 0, 0, 0.9, 0, 0);
  const cx = (W / 2) / 1.6;
  const cy = (H * 0.45) / 0.9;
  const r  = W * 0.5 / 1.6;
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grd.addColorStop(0,    'rgba(165,82,18,0.28)');
  grd.addColorStop(0.65, 'rgba(165,82,18,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W / 1.6, H / 0.9);
  ctx.restore();
}

function drawVignette(ctx) {
  const vig = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.15, W / 2, H * 0.46, W * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

async function drawCard(ctx, imgBuf, card) {
  const cardW = W * card.w / 100;
  const cardH = cardW * card.ar;
  const pad   = W * 0.01; // 1% of canvas width = ~12px

  const x = card.left  !== undefined
    ? W * card.left  / 100
    : W - W * card.right / 100 - cardW;
  const y = H * card.top / 100;

  // Rotation pivot: card centre
  const cx = x + cardW / 2;
  const cy = y + cardH / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(card.rot * Math.PI / 180);

  // Layered drop shadow
  ctx.shadowColor   = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur    = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // White card border
  ctx.fillStyle = '#f0ece4';
  ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);

  // Deeper shadow layer drawn separately (ctx.shadowBlur only applies once per fill)
  ctx.shadowColor   = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur    = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);

  ctx.shadowColor   = 'transparent';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetY = 0;

  // Photo — clipped to content area (inside the white border)
  if (imgBuf) {
    const ix = -cardW / 2 + pad;
    const iy = -cardH / 2 + pad;
    const iw = cardW - 2 * pad;
    const ih = cardH - 2 * pad;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();

    try {
      const img    = await loadImage(imgBuf);
      const nw     = img.width;
      const nh     = img.height;
      const scale  = Math.max(iw / nw, ih / nh);
      const dw     = nw * scale;
      const dh     = nh * scale;
      ctx.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    } catch { /* photo failed to load — leave card blank */ }

    ctx.restore();
  }

  ctx.restore();
}

function drawText(ctx) {
  ctx.textBaseline = 'alphabetic';

  // Title: "Memories"
  ctx.font         = '500 34px "IBM Plex Sans", sans-serif';
  ctx.fillStyle    = '#e8d5b8';
  ctx.globalAlpha  = 1;
  ctx.fillText(TITLE, W * 0.035, H * 0.92);

  // Subtitle
  ctx.font         = '400 12px "IBM Plex Sans", sans-serif';
  ctx.fillStyle    = '#c4a882';
  ctx.globalAlpha  = 0.72;
  ctx.fillText(SUBTITLE, W * 0.037, H * 0.955);

  // Attribution — right-aligned, baseline flush with subtitle
  ctx.font         = '400 20px "Schoolbell", cursive';
  ctx.fillStyle    = '#e8d5b8';
  ctx.globalAlpha  = 0.78;
  const attrW = ctx.measureText(ATTR).width;
  ctx.fillText(ATTR, W - W * 0.035 - attrW, H * 0.955);

  ctx.globalAlpha = 1;
}

// ── Fisher-Yates shuffle (seeded) ─────────────────────────────────────────
function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Entry point ───────────────────────────────────────────────────────────
async function generateOgImage(photos, distDir, seed) {
  if (!photos || photos.length === 0) {
    console.warn('  OG image: no photos — skipping');
    return;
  }

  await ensureFonts();

  // Deterministic seed: changes each calendar month (caller may pass a shared seed)
  if (seed === undefined) seed = new Date().getFullYear() * 12 + new Date().getMonth();
  const rand     = seededRand(seed);

  // Pick template
  const tIdx    = Math.floor(rand() * TEMPLATES.length);
  const layout  = TEMPLATES[tIdx];
  const needed  = layout.length;

  // Select and shuffle photos
  const shuffled = shuffle(photos, rand);
  const pool = shuffled.slice(0, needed);
  if (pool.length < needed) {
    if (pool.length === 0) {
      console.warn(`  OG image: no photos available — skipping`);
      return;
    }
    console.warn(`  OG image: need ${needed} photos, only ${pool.length} available — using ${pool.length} card slot(s)`);
  }

  // Load image buffers (in parallel, failures become null)
  const buffers = await Promise.all(pool.map(p => getImageBuffer(p, distDir)));

  // Draw
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawBackground(ctx);

  // Draw cards in z-index order — only the first pool.length slots are used
  const cards = layout
    .slice(0, pool.length)
    .map((card, i) => ({ card, buf: buffers[i] }))
    .sort((a, b) => a.card.z - b.card.z);

  for (const { card, buf } of cards) {
    await drawCard(ctx, buf, card);
  }

  drawVignette(ctx);
  drawText(ctx);

  // Write JPEG
  const outPath = path.join(distDir, 'og-image.jpg');
  const jpeg    = await canvas.encode('jpeg', 92);
  await fs.writeFile(outPath, jpeg);

  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  console.log(`  OG image: template ${tIdx + 1}/${TEMPLATES.length}, ${pool.length} photos → og-image.jpg (${month})`);
}

module.exports = { generateOgImage };
