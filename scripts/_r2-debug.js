const config = require('../config');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const r2 = config.r2;
console.log('bucket:', r2.bucket);
console.log('endpoint host:', r2.endpointUrl ? new URL(r2.endpointUrl).host : null);
console.log('configured:', !!(r2.bucket && r2.endpointUrl && r2.accessKeyId && r2.secretAccessKey));
const client = new S3Client({ region: 'auto', endpoint: r2.endpointUrl, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey } });

async function main() {
  let firstKey = null;
  try {
    const res = await client.send(new ListObjectsV2Command({ Bucket: r2.bucket }));
    const contents = res.Contents || [];
    console.log('object count:', contents.length);
    console.log('first 5 keys:', contents.slice(0, 5).map(o => o.Key));
    firstKey = contents[0]?.Key;
  } catch (err) {
    console.log('R2 LIST ERROR:', err.name, '|', err.message, '|', JSON.stringify(err.$metadata || {}), '|', err.Code || err.code);
    return;
  }

  if (!firstKey) { console.log('no keys to test GetObject with'); return; }

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: firstKey }));
    console.log('GET OK for', firstKey, '- content-length:', res.ContentLength);
  } catch (err) {
    console.log('R2 GET ERROR:', err.name, '|', err.message, '|', JSON.stringify(err.$metadata || {}), '|', err.Code || err.code);
  }
}

main();
