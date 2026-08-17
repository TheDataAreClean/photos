const config = require('../config');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const r2 = config.r2;
console.log('bucket:', r2.bucket);
console.log('endpoint host:', r2.endpointUrl ? new URL(r2.endpointUrl).host : null);
console.log('configured:', !!(r2.bucket && r2.endpointUrl && r2.accessKeyId && r2.secretAccessKey));
const client = new S3Client({ region: 'auto', endpoint: r2.endpointUrl, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey } });
client.send(new ListObjectsV2Command({ Bucket: r2.bucket })).then(res => {
  console.log('object count:', (res.Contents || []).length);
  console.log('first 5 keys:', (res.Contents || []).slice(0, 5).map(o => o.Key));
}).catch(err => {
  console.log('R2 LIST ERROR:', err.name, err.message);
});
