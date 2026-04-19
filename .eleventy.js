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
  // Safe JSON serialisation for inline <script> blocks
  eleventyConfig.addFilter('json', val => JSON.stringify(val));

  // Ensure a URL is absolute — prepends siteUrl only for root-relative paths
  eleventyConfig.addFilter('absUrl', (url, siteUrl) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return (siteUrl || '').replace(/\/$/, '') + url;
  });

  // First N items from an array
  eleventyConfig.addFilter('first', (arr, n) => (arr || []).slice(0, n));

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

  // Plain text → HTML paragraphs (for Atom <content>)
  eleventyConfig.addFilter('toParagraphs', text => {
    if (!text) return '';
    return text.split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
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
