module.exports = {

  site: {
    title:       'Memories | TheDataAreClean',
    displayTitle: 'Memories',
    description: 'My experiments behind the viewfinder.',
    // Full URL of your deployed site (no trailing slash).
    // Used for absolute Open Graph image URLs.
    // Can be set via environment variable: SITE_URL=https://example.com npm run build
    url: process.env.SITE_URL || '',
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

  build: {
    outputDir:       './dist',
    cacheDir:        './.cache',
    // How long to reuse the cached Glass API response (minutes)
    cacheTTLMinutes: 60,
  },

};
