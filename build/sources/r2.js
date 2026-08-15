'use strict';

/**
 * R2 originals backup/source.
 *
 * `local/` on your Mac is the working folder (and is gitignored — raw
 * originals never enter the repo). A private Cloudflare R2 bucket is the
 * durable backup and the thing CI actually builds from, since a fresh CI
 * checkout never has anything that lives only in `local/`.
 *
 * Two directions:
 *   - uploadNew()   Mac → R2   (the backup step — run via `npm run sync:r2`)
 *   - downloadMissing()  R2 → local/   (the CI step — run before processLocal()
 *     so the build sees the same files it would on your Mac)
 *
 * Both are no-ops if R2 credentials aren't configured, so local dev without
 * R2 set up still works exactly as before.
 */

const fs   = require('fs/promises');
const path = require('path');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tiff', '.tif']);

function isConfigured(config) {
  const r2 = config.r2 || {};
  return !!(r2.endpointUrl && r2.accessKeyId && r2.secretAccessKey && r2.bucket);
}

function getClient(config) {
  const r2 = config.r2;
  return new S3Client({
    region: 'auto',
    endpoint: r2.endpointUrl,
    credentials: {
      accessKeyId:     r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });
}

async function listBucketKeys(client, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents || []) keys.push(obj.Key);
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── R2 → local/ (CI build step) ───────────────────────
async function downloadMissing(config) {
  if (!isConfigured(config)) return { downloaded: 0 };

  const photosDir = path.resolve(config.local.photosDir);
  await fs.mkdir(photosDir, { recursive: true });

  const client = getClient(config);
  const bucket = config.r2.bucket;

  const [keys, existing] = await Promise.all([
    listBucketKeys(client, bucket),
    fs.readdir(photosDir).catch(() => []),
  ]);
  const existingSet = new Set(existing);

  const missing = keys.filter(key => IMAGE_EXTS.has(path.extname(key).toLowerCase()) && !existingSet.has(key));

  await Promise.all(missing.map(async key => {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = await streamToBuffer(res.Body);
    await fs.writeFile(path.join(photosDir, key), buf);
  }));

  if (missing.length > 0) console.log(`  R2: downloaded ${missing.length} original(s) from bucket`);
  return { downloaded: missing.length };
}

// ── local/ → R2 (backup step, run on your Mac) ────────
async function uploadNew(config) {
  if (!isConfigured(config)) {
    console.warn('  R2: not configured — set R2 env vars before running sync:r2');
    return { uploaded: 0 };
  }

  const photosDir = path.resolve(config.local.photosDir);
  const client     = getClient(config);
  const bucket     = config.r2.bucket;

  const [entries, existingKeys] = await Promise.all([
    fs.readdir(photosDir).catch(() => []),
    listBucketKeys(client, bucket),
  ]);
  const existingSet = new Set(existingKeys);

  const toUpload = entries.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !existingSet.has(f));

  for (const filename of toUpload) {
    const body = await fs.readFile(path.join(photosDir, filename));
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: filename, Body: body }));
    console.log(`  R2: uploaded ${filename}`);
  }

  return { uploaded: toUpload.length };
}

// ── Generic single-object upload (used by scripts/backup-glass.js) ───
async function putObject(config, key, buffer) {
  if (!isConfigured(config)) return false;
  const client = getClient(config);
  await client.send(new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, Body: buffer }));
  return true;
}

module.exports = { downloadMissing, uploadNew, putObject, isConfigured };
