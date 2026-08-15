module.exports = {

  site: {
    title:       'Memories | TheDataAreClean',
    displayTitle: 'Memories',
    description: 'My experiments behind the viewfinder.',
    // Full URL of your deployed site (no trailing slash).
    // Used for absolute Open Graph image URLs.
    // Can be set via environment variable: SITE_URL=https://example.com npm run build
    url: (() => {
      const raw = (process.env.SITE_URL || '').trim().replace(/\/$/, '');
      if (!raw) return '';
      try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
        return u.origin;
      } catch { return ''; }
    })(),
  },

  glass: {
    // Your Glass username (the part after glass.photo/@)
    username: 'thedataareclean',
    // Optional auth token — improves rate limits but not required for public profiles.
    // Set via environment variable: GLASS_TOKEN=your_token npm run build
    token: process.env.GLASS_TOKEN || null,
    // Maximum number of Glass photos to fetch
    maxPhotos: 500,
  },

  local: {
    // Folder containing your local photo files (relative to project root).
    // Drop .jpg / .jpeg / .png / .webp / .heic files here.
    // Files are auto-renamed to YYYY-MM-DD-local-slug.ext on build.
    photosDir: './local',
    // Width of grid thumbnails in pixels (originals are served in the lightbox)
    thumbWidth: 800,
  },

  // Private Cloudflare R2 bucket — backup + source of truth for local/
  // originals, since local/ is gitignored and a fresh CI checkout never has
  // them. All optional: unset means sync:r2 and the CI download step no-op.
  r2: {
    bucket:          process.env.R2_BUCKET || null,
    endpointUrl:     process.env.R2_ENDPOINT_URL || null,
    accessKeyId:     process.env.R2_ACCESS_KEY_ID || null,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || null,
  },

  build: {
    outputDir:       './dist',
    cacheDir:        './.cache',
    // How long to reuse the cached Glass API response (minutes)
    cacheTTLMinutes: 60,
  },

};
