'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ov, ymlStr, ymlNum, stripImageEmbeds } = require('../build/utils/sidecar');

test('ov (override-with-fallback)', async (t) => {
  await t.test('empty string override falls back to source', () => {
    assert.equal(ov('', 'Fujifilm X-T50'), 'Fujifilm X-T50');
  });

  await t.test('null/undefined override falls back to source', () => {
    assert.equal(ov(null, 'source'), 'source');
    assert.equal(ov(undefined, 'source'), 'source');
  });

  await t.test('non-empty override wins', () => {
    assert.equal(ov('Custom Camera', 'Fujifilm X-T50'), 'Custom Camera');
  });

  await t.test('numeric 0 is a real override, not treated as blank', () => {
    assert.equal(ov(0, 400), 0);
  });
});

test('ymlStr / ymlNum', async (t) => {
  await t.test('ymlStr wraps a value in a leading-space quoted string', () => {
    assert.equal(ymlStr('Fujifilm X-T50'), ' "Fujifilm X-T50"');
  });

  await t.test('ymlStr returns empty string for null/undefined', () => {
    assert.equal(ymlStr(null), '');
    assert.equal(ymlStr(undefined), '');
  });

  await t.test('ymlNum renders a leading-space number', () => {
    assert.equal(ymlNum(400), ' 400');
    assert.equal(ymlNum(0), ' 0');
  });

  await t.test('ymlNum returns empty string for null/undefined', () => {
    assert.equal(ymlNum(null), '');
    assert.equal(ymlNum(undefined), '');
  });
});

test('stripImageEmbeds', async (t) => {
  await t.test('strips a Markdown embed line', () => {
    const body = '![](../local/2026-03-19-new.jpg)\n\nCaption text.';
    assert.equal(stripImageEmbeds(body), 'Caption text.');
  });

  await t.test('strips an Obsidian wikilink embed line', () => {
    const body = '![[2026-03-19-new.jpg]]\n\nCaption text.';
    assert.equal(stripImageEmbeds(body), 'Caption text.');
  });

  await t.test('strips an external URL embed line', () => {
    const body = '![](https://cdn.glass.photo/abc123)\n\nCaption text.';
    assert.equal(stripImageEmbeds(body), 'Caption text.');
  });

  await t.test('leaves non-embed body text untouched', () => {
    const body = 'Just a caption with no embed at all.';
    assert.equal(stripImageEmbeds(body), body);
  });

  await t.test('does not strip an inline (non-standalone) image reference', () => {
    const body = 'See the photo here ![](../local/x.jpg) inline.';
    assert.equal(stripImageEmbeds(body), body.trim());
  });

  await t.test('handles null/empty input', () => {
    assert.equal(stripImageEmbeds(''), '');
    assert.equal(stripImageEmbeds(null), null);
  });
});
