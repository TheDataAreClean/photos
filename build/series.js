'use strict';

const fs     = require('fs/promises');
const path   = require('path');
const matter = require('gray-matter');

const SERIES_DIR = path.resolve('series');

async function loadSeries() {
  const map = {};
  let entries;
  try { entries = await fs.readdir(SERIES_DIR); } catch { return map; }

  const mdFiles = entries.filter(f => f.endsWith('.md'));

  await Promise.all(mdFiles.map(async file => {
    try {
      const content = await fs.readFile(path.join(SERIES_DIR, file), 'utf8');
      const parsed  = matter(content);
      const slug    = path.parse(file).name;
      // photos: list of IDs in display order; each becomes { id, order } (1-indexed)
      const rawPhotos = Array.isArray(parsed.data.photos) ? parsed.data.photos : [];
      const photos = rawPhotos.map((item, i) =>
        typeof item === 'string'
          ? { id: item, order: i + 1 }
          : { id: item.id, order: item.order ?? i + 1 }
      );

      const hiddenGlassPhotos = Array.isArray(parsed.data.hiddenGlassPhotos)
        ? parsed.data.hiddenGlassPhotos.filter(id => typeof id === 'string')
        : [];

      map[slug] = {
        slug,
        title:             parsed.data.title       || slug,
        description:       parsed.content?.trim()   || null,
        coverPhoto:        parsed.data.coverPhoto   || null,
        photos,
        hiddenGlassPhotos,
      };
    } catch {}
  }));

  return map;
}

module.exports = { loadSeries };
