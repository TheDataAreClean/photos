#!/usr/bin/env node
/**
 * rename.js
 *
 * Master rename script — runs local photo and glass sidecar renames in sequence.
 * All flags (e.g. --apply) are forwarded to both sub-scripts.
 *
 * Usage:
 *   npm run rename            # preview both
 *   npm run rename -- --apply # apply both
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const args  = process.argv.slice(2);
const local = path.join(__dirname, 'rename-local.js');
const glass = path.join(__dirname, 'rename-glass.js');

console.log('── Local photos ──────────────────────────────────\n');
try { execFileSync('node', [local, ...args], { stdio: 'inherit' }); } catch {}

console.log('\n── Glass sidecars ────────────────────────────────\n');
try { execFileSync('node', [glass, ...args], { stdio: 'inherit' }); } catch {}
