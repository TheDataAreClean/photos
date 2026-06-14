'use strict';

module.exports = function (eleventyConfig) {
  // ── Static assets ─────────────────────────────────────
  eleventyConfig.addPassthroughCopy('src/styles');
  eleventyConfig.addPassthroughCopy('src/scripts');
  eleventyConfig.addPassthroughCopy('src/images');

  // Favicon files are generated to dist/ by build/gen-favicon.js (monthly variants).
  // Do NOT add passthrough copies here — they would overwrite the generated versions.

  // Live-reload on CSS/JS changes
  eleventyConfig.addWatchTarget('src/styles/');
  eleventyConfig.addWatchTarget('src/scripts/');

  // ── Filters ───────────────────────────────────────────
  // Safe JSON serialisation for inline <script> blocks — escape `</` so a
  // string containing "</script>" can't close the tag early
  eleventyConfig.addFilter('json', val => JSON.stringify(val).replace(/<\//g, '<\\/'));

  // Ensure a URL is absolute — prepends siteUrl only for root-relative paths
  eleventyConfig.addFilter('absUrl', (url, siteUrl) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return (siteUrl || '').replace(/\/$/, '') + url;
  });

  // First N items from an array
  eleventyConfig.addFilter('first', (arr, n) => (arr || []).slice(0, n));

  // Photos belonging to a series, sorted by seriesOrder
  eleventyConfig.addFilter('seriesPhotos', (photos, slug) =>
    (photos || [])
      .filter(p => p.series === slug)
      .sort((a, b) => (a.seriesOrder ?? 9999) - (b.seriesOrder ?? 9999))
  );

  // Feed-safe photo list: collapse each series down to its opening photo (seriesOrder === 1)
  eleventyConfig.addFilter('feedPhotos', photos =>
    (photos || []).filter(p => !p.series || p.seriesOrder === 1)
  );

  // How many chunks of size n cover the array?
  eleventyConfig.addFilter('chunkCount', (arr, n) =>
    Math.ceil((arr || []).length / n)
  );

  // Returns whichever of two ISO dates is later — used for Atom <updated>
  eleventyConfig.addFilter('laterDate', (a, b) => {
    const da = a ? new Date(a) : new Date(0);
    const db = b ? new Date(b) : new Date(0);
    return (da > db ? da : db).toISOString();
  });

  // ISO date → RFC3339 (required by Atom spec)
  eleventyConfig.addFilter('dateToRfc3339', iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toISOString();
  });

  // Plain text → HTML paragraphs (for Atom <content>). Output is wrapped in
  // <![CDATA[...]]> in feed.njk, so escape any literal "]]>" that would
  // otherwise close the CDATA section early.
  eleventyConfig.addFilter('toParagraphs', text => {
    if (!text) return '';
    return text.split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
      .replace(/]]>/g, ']]&gt;');
  });

  // "Monday, January 1, 2024"
  eleventyConfig.addFilter('longDate', iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'UTC',
    });
  });

  // "Jan 1, 2024"
  eleventyConfig.addFilter('shortDate', iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'UTC',
    });
  });

  return {
    dir: {
      input:    'src',
      output:   'dist',
      includes: '../_includes',
      data:     '../_data',
    },
    templateFormats: ['njk', 'html'],
    htmlTemplateEngine: 'njk',
  };
};
