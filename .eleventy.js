'use strict';

module.exports = function (eleventyConfig) {
  // ── Static assets ─────────────────────────────────────
  eleventyConfig.addPassthroughCopy('src/styles');
  eleventyConfig.addPassthroughCopy('src/scripts');
  eleventyConfig.addPassthroughCopy('src/images');

  // Favicon files served from root
  eleventyConfig.addPassthroughCopy({ 'src/images/favicon.svg':         'favicon.svg'         });
  eleventyConfig.addPassthroughCopy({ 'src/images/apple-touch-icon.png': 'apple-touch-icon.png' });
  eleventyConfig.addPassthroughCopy({ 'src/images/favicon-32.png':       'favicon-32.png'       });

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
