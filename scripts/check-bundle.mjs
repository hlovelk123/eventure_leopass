#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MAX_GZIP_BYTES = 300 * 1024; // 300 KB
const assetsDir = resolve('web', 'dist', 'assets');

let indexBundle;
try {
  const files = readdirSync(assetsDir);
  indexBundle = files.find((file) => file.startsWith('index-') && file.endsWith('.js'));
  if (!indexBundle) {
    throw new Error('Unable to locate main index bundle in dist/assets. Did you run `npm run build`?');
  }
} catch (error) {
  console.error(`[check-bundle] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
  process.exit();
}

const bundlePath = join(assetsDir, indexBundle);
const bundleBuffer = readFileSync(bundlePath);
const gzipSize = gzipSync(bundleBuffer).length;

if (gzipSize > MAX_GZIP_BYTES) {
  console.error(
    `[check-bundle] Bundle ${indexBundle} exceeds budget: ${(gzipSize / 1024).toFixed(1)} KB gz (limit 300 KB).`
  );
  process.exitCode = 1;
} else {
  console.log(
    `[check-bundle] Bundle ${indexBundle} within budget: ${(gzipSize / 1024).toFixed(1)} KB gz (limit 300 KB).`
  );
}
