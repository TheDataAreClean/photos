'use strict';

/**
 * Convert any string to a URL/filename-safe slug.
 * - Strips diacritics, lowercases, collapses non-alphanumeric runs to hyphens.
 * - Trims to maxLen characters, never ending mid-word if possible.
 */
function toSlug(str, maxLen = 48) {
  if (!str) return '';
  const raw = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')      // non-alphanumeric → space
    .trim()
    .replace(/\s+/g, '-');

  if (raw.length <= maxLen) return raw;

  // Trim to maxLen without cutting mid-word
  const cut = raw.slice(0, maxLen);
  const lastHyphen = cut.lastIndexOf('-');
  return lastHyphen > maxLen / 2 ? cut.slice(0, lastHyphen) : cut;
}

/**
 * Build a clean date-based stem from a JS Date + optional title.
 *
 * Examples:
 *   2024-10-15-fuji-at-the-market
 *   2024-10-15-143022          (no title, uses HH MM SS)
 *   2024-10-15                 (no title, no time component)
 */
function dateTitleStem(date, title) {
  const pad = n => String(n).padStart(2, '0');
  const datePart =
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())}`;

  if (title) {
    const slug = toSlug(title);
    if (slug) return `${datePart}-${slug}`;
  }

  // Fall back to time-of-day so same-date photos don't collide
  const timePart =
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`;

  return `${datePart}-${timePart}`;
}

/**
 * Return true if a filename stem already looks clean
 * (starts with YYYY-MM-DD and is all lowercase/hyphens/digits).
 */
function isCleanStem(stem) {
  return /^\d{4}-\d{2}-\d{2}/.test(stem) && !/[A-Z_ ]/.test(stem);
}

module.exports = { toSlug, dateTitleStem, isCleanStem };
