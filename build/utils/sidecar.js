'use strict';

// Override helper: empty string in sidecar falls back to source value
function ov(override, fallback) {
  return (override !== null && override !== undefined && override !== '')
    ? override : fallback;
}

// YAML value serialisers for sidecar stubs
function ymlStr(v) { return v != null ? ` "${v}"` : ''; }
function ymlNum(v) { return v != null ? ` ${v}`   : ''; }

// Strips Obsidian image embeds (wikilink `![[photo.jpg]]` or standard
// Markdown `![alt](url)`, including plain external URLs) out of a sidecar
// body before it's used as a photo's description. Lets you see the photo
// inline while writing the caption without the embed syntax leaking onto
// the live site. Shared by glass.js and local.js.
function stripImageEmbeds(text) {
  if (!text) return text;
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !(/^!\[\[.+\]\]$/.test(t) || /^!\[[^\]]*\]\([^)]+\)$/.test(t));
    })
    .join('\n')
    .trim();
}

module.exports = { ov, ymlStr, ymlNum, stripImageEmbeds };
