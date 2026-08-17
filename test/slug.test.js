'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toSlug, dateTitleStem, isCleanStem } = require('../build/utils/slug');

test('toSlug', async (t) => {
  await t.test('lowercases and hyphenates', () => {
    assert.equal(toSlug('Fuji at the Market'), 'fuji-at-the-market');
  });

  await t.test('strips diacritics', () => {
    assert.equal(toSlug('Café León'), 'cafe-leon');
  });

  await t.test('collapses non-alphanumeric runs to a single hyphen', () => {
    assert.equal(toSlug('a!!!b   c--d'), 'a-b-c-d');
  });

  await t.test('empty/falsy input returns empty string', () => {
    assert.equal(toSlug(''), '');
    assert.equal(toSlug(null), '');
    assert.equal(toSlug(undefined), '');
  });

  await t.test('trims to maxLen without cutting mid-word', () => {
    const long = 'this is a very long title that should get trimmed at a word boundary';
    const result = toSlug(long, 20);
    assert.ok(result.length <= 20, `expected length <= 20, got ${result.length}`);
    assert.ok(!long.replace(/ /g, '-').startsWith(result + '-x'), 'sanity: not accidentally matching whole string');
    assert.ok(!result.endsWith('-'), 'should not end with a trailing hyphen from a mid-word cut');
  });

  await t.test('falls back to a hard cut when no hyphen exists before maxLen/2', () => {
    const long = 'supercalifragilisticexpialidocious';
    const result = toSlug(long, 10);
    assert.equal(result.length, 10);
  });
});

test('dateTitleStem', async (t) => {
  await t.test('uses date + slugified title when title is present', () => {
    const d = new Date(Date.UTC(2024, 9, 15, 14, 30, 22));
    assert.equal(dateTitleStem(d, 'Bougainvillea!'), '2024-10-15-bougainvillea');
  });

  await t.test('falls back to HHMMSS when no title', () => {
    const d = new Date(Date.UTC(2024, 9, 15, 14, 30, 22));
    assert.equal(dateTitleStem(d, null), '2024-10-15-143022');
  });

  await t.test('falls back to HHMMSS when title slugifies to empty', () => {
    const d = new Date(Date.UTC(2024, 9, 15, 0, 0, 0));
    assert.equal(dateTitleStem(d, '!!!'), '2024-10-15-000000');
  });

  await t.test('pads single-digit month/day/time components', () => {
    const d = new Date(Date.UTC(2024, 0, 5, 3, 4, 5));
    assert.equal(dateTitleStem(d, null), '2024-01-05-030405');
  });
});

test('isCleanStem', async (t) => {
  await t.test('accepts a well-formed date-slug stem', () => {
    assert.equal(isCleanStem('2026-03-09-bougainvillea'), true);
  });

  await t.test('accepts a date-only stem (no title)', () => {
    assert.equal(isCleanStem('2026-03-09-143022'), true);
  });

  await t.test('rejects a messy camera-default filename', () => {
    assert.equal(isCleanStem('IMG_1234'), false);
  });

  await t.test('rejects uppercase letters', () => {
    assert.equal(isCleanStem('2026-03-09-Bougainvillea'), false);
  });

  await t.test('rejects a stem with spaces', () => {
    assert.equal(isCleanStem('2026-03-09 bougainvillea'), false);
  });

  await t.test('rejects underscores', () => {
    assert.equal(isCleanStem('2026-03-09_bougainvillea'), false);
  });
});
