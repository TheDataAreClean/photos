#!/usr/bin/env node
/**
 * publish-ghost.js
 *
 * Pushes a single Markdown note (e.g. an Obsidian note) to a Ghost blog via
 * the Ghost Admin API. Frontmatter maps to Ghost post fields; the Markdown
 * body is converted to HTML and sent with source=html so Ghost's editor can
 * still open and edit it normally.
 *
 * Usage:
 *   npm run publish:ghost -- path/to/note.md
 *
 * Required env vars:
 *   GHOST_API_URL        e.g. https://yourblog.ghost.io
 *   GHOST_ADMIN_API_KEY  "id:secret" — from Ghost Admin → Settings →
 *                         Integrations → Custom Integration
 *
 * Frontmatter fields (all optional except title):
 *   title:        Post title
 *   slug:         URL slug — Ghost derives one from the title if omitted
 *   tags:         [tag1, tag2]
 *   status:       draft | published  (default: draft — safer default,
 *                 review in Ghost before it goes live)
 *   excerpt:      Custom excerpt/meta description
 *   featureImage: URL, or a local file path to upload as the feature image
 *
 * Everything below the frontmatter is the post body.
 */
'use strict';

const fs      = require('fs');
const path    = require('path');
const matter  = require('gray-matter');
const marked  = require('marked');
const GhostAdminAPI = require('@tryghost/admin-api');

async function main() {
  const notePath = process.argv[2];
  if (!notePath) {
    console.error('Usage: npm run publish:ghost -- path/to/note.md');
    process.exit(1);
  }

  const resolvedPath = path.resolve(notePath);
  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const { data: front, content: body } = matter(raw);

  if (!front.title) {
    console.error('✗ Frontmatter is missing "title" — required by Ghost.');
    process.exit(1);
  }

  const apiUrl = process.env.GHOST_API_URL;
  const apiKey = process.env.GHOST_ADMIN_API_KEY;
  if (!apiUrl || !apiKey) {
    console.error('✗ Set GHOST_API_URL and GHOST_ADMIN_API_KEY before running this script.');
    process.exit(1);
  }

  const api = new GhostAdminAPI({
    url: apiUrl,
    key: apiKey,
    version: 'v5.0',
  });

  let featureImage = front.featureImage || undefined;
  if (featureImage && !/^https?:\/\//.test(featureImage)) {
    const imagePath = path.resolve(path.dirname(resolvedPath), featureImage);
    console.log(`  Uploading feature image: ${imagePath}`);
    const uploaded = await api.images.upload({ file: imagePath });
    featureImage = uploaded.url;
  }

  const html = marked.parse(body);

  const post = {
    title:         front.title,
    html,
    status:        front.status === 'published' ? 'published' : 'draft',
    tags:          Array.isArray(front.tags) ? front.tags : undefined,
    slug:          front.slug || undefined,
    custom_excerpt: front.excerpt || undefined,
    feature_image: featureImage,
  };

  const result = await api.posts.add(post, { source: 'html' });
  console.log(`✓ Pushed "${result.title}" to Ghost as ${result.status} — ${result.url}`);
}

main().catch(err => {
  console.error(`✗ Ghost publish failed: ${err.message}`);
  process.exit(1);
});
