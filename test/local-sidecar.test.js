'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { backfillExifLines, sidecarStub } = require('../build/sources/local');

const EXIF = {
  camera: 'Fujifilm X-T50',
  lens: 'XF23mmF2 R WR',
  focalLength: '23mm',
  focalLength35: '35mm',
  aperture: 'ƒ/2.8',
  shutterSpeed: '1/250s',
  iso: 400,
};

test('backfillExifLines', async (t) => {
  await t.test('fills blank frontmatter fields from EXIF', () => {
    const raw = [
      '---',
      'title: "Test"',
      'camera:',
      'lens:',
      'iso:',
      'dateTaken:',
      '---',
      '',
      'Caption body.',
      '',
    ].join('\n');

    const { updated, changed } = backfillExifLines(raw, EXIF, '2026-03-09T08:57:02Z');
    assert.equal(changed, true);
    assert.match(updated, /camera: "Fujifilm X-T50"/);
    assert.match(updated, /lens: "XF23mmF2 R WR"/);
    assert.match(updated, /iso: 400/);
    assert.match(updated, /dateTaken: "2026-03-09T08:57:02Z"/);
  });

  await t.test('never touches a caption body line that looks like a blank EXIF field', () => {
    // Regression test: a body line reading "lens:" (e.g. a shot-log note)
    // must survive untouched — it previously got silently overwritten
    // because the old regex ran against the whole file, not just frontmatter.
    const raw = [
      '---',
      'title: "Test"',
      'camera:',
      'lens:',
      '---',
      '',
      'Shot log:',
      'lens:',
      'aperture:',
      '',
      'Rest of the caption.',
      '',
    ].join('\n');

    const { updated } = backfillExifLines(raw, EXIF, null);

    const body = updated.split('---').slice(2).join('---');
    assert.match(body, /\nlens:\n/, 'body "lens:" line must remain blank');
    assert.match(body, /\naperture:\n/, 'body "aperture:" line must remain blank');
    assert.match(updated, /^camera: "Fujifilm X-T50"$/m, 'frontmatter camera should still be filled');
  });

  await t.test('already-filled fields are left alone (no accidental overwrite)', () => {
    const raw = [
      '---',
      'camera: "Custom Camera"',
      'lens:',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');

    const { updated } = backfillExifLines(raw, EXIF, null);
    assert.match(updated, /camera: "Custom Camera"/);
    assert.match(updated, /lens: "XF23mmF2 R WR"/);
  });

  await t.test('idempotent: second run on already-filled sidecar is a no-op', () => {
    const raw = [
      '---',
      'camera:',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');

    const first = backfillExifLines(raw, EXIF, null);
    const second = backfillExifLines(first.updated, EXIF, null);
    assert.equal(second.changed, false);
    assert.equal(second.updated, first.updated);
  });

  await t.test('no frontmatter block: safely no-ops instead of throwing', () => {
    const raw = 'just some text\ncamera:\n';
    const { updated, changed } = backfillExifLines(raw, EXIF, null);
    assert.equal(changed, false);
    assert.equal(updated, raw);
  });
});

test('sidecarStub', async (t) => {
  await t.test('embeds the photo with a standard Markdown link, not an Obsidian wikilink', () => {
    const stub = sidecarStub(EXIF, '2026-03-09T08:57:02Z', '2026-03-09-bougainvillea.jpg');
    assert.match(stub, /!\[\]\(\.\.\/local\/2026-03-09-bougainvillea\.jpg\)/);
    assert.doesNotMatch(stub, /!\[\[.*\]\]/);
  });

  await t.test('pre-fills EXIF values from the source photo', () => {
    const stub = sidecarStub(EXIF, '2026-03-09T08:57:02Z', 'photo.jpg');
    assert.match(stub, /camera: "Fujifilm X-T50"/);
    assert.match(stub, /iso: 400/);
    assert.match(stub, /dateTaken: "2026-03-09T08:57:02Z"/);
  });

  await t.test('title is left blank for the user to fill in', () => {
    const stub = sidecarStub(EXIF, null, 'photo.jpg');
    assert.match(stub, /^title:$/m);
  });
});
