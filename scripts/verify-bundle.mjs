import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const assetsDir = resolve('dist/assets');
const maxChunkBytes = 500 * 1024;
const javascriptAssets = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'));

if (javascriptAssets.length === 0) {
  console.error('FAIL aucun chunk JavaScript généré dans dist/assets');
  process.exit(1);
}

const chunks = await Promise.all(javascriptAssets.map(async (name) => ({
  name,
  bytes: (await stat(resolve(assetsDir, name))).size,
})));
const oversized = chunks.filter(({ bytes }) => bytes > maxChunkBytes);
const largest = chunks.toSorted((a, b) => b.bytes - a.bytes).slice(0, 5);

for (const { name, bytes } of largest) {
  console.log(`${(bytes / 1024).toFixed(2)} KiB  ${name}`);
}

if (oversized.length > 0) {
  for (const { name, bytes } of oversized) {
    console.error(`FAIL ${name} dépasse 500 KiB (${(bytes / 1024).toFixed(2)} KiB)`);
  }
  process.exit(1);
}

console.log(`PASS ${chunks.length} chunks JavaScript restent sous 500 KiB.`);
