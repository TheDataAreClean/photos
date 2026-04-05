'use strict';

/**
 * Favicon generator — stacked photo prints, variant 4 (fixed).
 *
 * Build-time: copies src/images/ favicon files directly to dist/ — no rendering.
 * Standalone (npm run gen:favicon): re-renders src/images/ from the variant 4 design.
 */

const { createCanvas } = require('@napi-rs/canvas');
const fs   = require('fs/promises');
const path = require('path');

// ── Variant 4 design ──────────────────────────────────────────────────────
const BG    = '#251108';
const BACK  = '#7a5e38';
const FRONT = '#c4a882';
const VARIANT = { backRot: -5, backOX: -1, backOY: 2, frontRot: 9, frontOX: 2, frontOY: -1 };

// ── Drawing ───────────────────────────────────────────────────────────────
function drawPrintStack(ctx, size) {
  const { backRot, backOX, backOY, frontRot, frontOX, frontOY } = VARIANT;
  const s  = size / 32;
  const cw = 13 * s;
  const ch = 17 * s;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  function drawCard(color, rot, ox, oy) {
    const cx = (16 + ox) * s;
    const cy = (15 + oy) * s;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.shadowColor   = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur    = 2 * s;
    ctx.shadowOffsetY = 1 * s;
    ctx.fillStyle = color;
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.shadowColor = 'transparent';
    ctx.restore();
  }

  drawCard(BACK,  backRot,  backOX,  backOY);
  drawCard(FRONT, frontRot, frontOX, frontOY);
}

function buildSVG() {
  const { backRot, backOX, backOY, frontRot, frontOX, frontOY } = VARIANT;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${BG}"/>
  <rect x="${9.5 + backOX}"  y="${6.5 + backOY}"  width="13" height="17" fill="${BACK}"  transform="rotate(${backRot},${16 + backOX},${15 + backOY})"/>
  <rect x="${9.5 + frontOX}" y="${6.5 + frontOY}" width="13" height="17" fill="${FRONT}" transform="rotate(${frontRot},${16 + frontOX},${15 + frontOY})"/>
</svg>`;
}

// ── Build entry point — copies src/images/ to dist/, no rendering ─────────
async function generateFavicon(distDir) {
  const srcDir = path.resolve('src/images');
  try {
    await fs.mkdir(distDir, { recursive: true });
    await Promise.all([
      fs.copyFile(path.join(srcDir, 'favicon.svg'),          path.join(distDir, 'favicon.svg')),
      fs.copyFile(path.join(srcDir, 'apple-touch-icon.png'), path.join(distDir, 'apple-touch-icon.png')),
      fs.copyFile(path.join(srcDir, 'favicon-32.png'),       path.join(distDir, 'favicon-32.png')),
    ]);
    console.log('  Favicon: copied from src/images/');
  } catch (err) {
    console.warn('  Favicon: copy failed —', err.message);
  }
}

// ── Standalone: npm run gen:favicon ──────────────────────────────────────
async function main() {
  const outDir = path.resolve('src/images');
  await fs.writeFile(path.join(outDir, 'favicon.svg'), buildSVG());
  for (const { file, size } of [
    { file: 'apple-touch-icon.png', size: 180 },
    { file: 'favicon-32.png',       size: 32  },
  ]) {
    const canvas = createCanvas(size, size);
    drawPrintStack(canvas.getContext('2d'), size);
    await fs.writeFile(path.join(outDir, file), canvas.toBuffer('image/png'));
  }
  console.log('  gen:favicon → src/images/');
}

if (require.main === module) {
  main().catch(err => { console.error('gen-favicon failed:', err.message); process.exit(1); });
}

module.exports = { generateFavicon };
