'use strict';

/**
 * Generates src/images/apple-touch-icon.png (180×180) and
 * src/images/favicon-32.png (32×32) using @napi-rs/canvas.
 *
 * Run manually:  node build/gen-favicon.js
 */

const { createCanvas } = require('@napi-rs/canvas');
const fs   = require('fs/promises');
const path = require('path');

const OUT_TOUCH = path.resolve('src/images/apple-touch-icon.png');
const OUT_32    = path.resolve('src/images/favicon-32.png');

// Site colours
const BG     = '#1a1208';
const STROKE = '#c4a882';

// 6-blade aperture iris matching favicon.svg
// Points on a circle of radius 11 at 60° intervals from the top:
//   (16,5), (25.5,10.5), (25.5,21.5), (16,27), (6.5,21.5), (6.5,10.5)
const BLADES = [
  [[16,5],    [25.5,10.5], 0.90],
  [[25.5,10.5],[25.5,21.5], 0.60],
  [[25.5,21.5],[16,27],    0.90],
  [[16,27],   [6.5,21.5],  0.60],
  [[6.5,21.5],[6.5,10.5],  0.90],
  [[6.5,10.5],[16,5],      0.60],
];

function drawAperture(ctx, size) {
  const s = size / 32;
  const cx = 16 * s, cy = 16 * s;

  ctx.clearRect(0, 0, size, size);

  // ── Background circle ────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 16 * s, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();

  // ── 6 aperture blades ────────────────────────────
  for (const [[x1, y1], [x2, y2], opacity] of BLADES) {
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(cx,       cy);
    ctx.lineTo(x1 * s,  y1 * s);
    ctx.lineTo(x2 * s,  y2 * s);
    ctx.closePath();
    ctx.fillStyle = STROKE;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Centre hole ───────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
}

async function main() {
  const sizes = [
    { path: OUT_TOUCH, size: 180 },
    { path: OUT_32,    size: 32  },
  ];

  for (const { path: outPath, size } of sizes) {
    const canvas = createCanvas(size, size);
    drawAperture(canvas.getContext('2d'), size);
    const png = canvas.toBuffer('image/png');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, png);
    console.log(`  Favicon: ${size}×${size} → ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch(err => { console.error('gen-favicon failed:', err.message); process.exit(1); });
