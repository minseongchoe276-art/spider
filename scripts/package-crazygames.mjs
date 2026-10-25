import { build } from 'vite';
import { zipSync } from 'fflate';
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildReleaseManifest } from './build-release-manifest.mjs';
import { softwareNotices } from './software-notices.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);

console.log('[CrazyGames] Ensuring compiled motion tracks are up to date...');
if (!process.argv.includes('--reuse-compiled-motions')) {
  execFileSync(process.execPath, ['scripts/build-motions.mjs'], { stdio: 'inherit' });
}

console.log('[CrazyGames] Building web assets with Vite...');
await build({ configFile: resolve(root, 'vite.crazygames.config.js'), mode: 'production' });

const buildFolder = resolve(root, 'artifacts/crazygames/build');
const outFolder = resolve(root, 'artifacts/crazygames');

// Write notices and manifest
await writeFile(resolve(buildFolder, 'THIRD_PARTY_NOTICES.txt'), softwareNotices().text);

// Clean up authoring-only assets that are NOT needed at runtime:
// 1. Remove all *.fbx files (runtime character uses /motions/*.json tracks + GLB rigs)
// 2. Remove models/sources directory
const modelsDir = resolve(buildFolder, 'models');
try {
  const modelEntries = await readdir(modelsDir, { withFileTypes: true });
  for (const entry of modelEntries) {
    const fullPath = join(modelsDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.fbx')) {
      await rm(fullPath, { force: true });
    }
  }
} catch (e) {
  console.warn('[CrazyGames] Note reading models dir:', e.message);
}

const sourcesDir = resolve(modelsDir, 'sources');
try {
  await rm(sourcesDir, { recursive: true, force: true });
} catch (e) {
  // Ignore if not present
}

buildReleaseManifest(buildFolder);

// Collect all files for zip packaging
const entries = {};
const files = [];

async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) {
      await collect(path);
    } else {
      const name = relative(buildFolder, path).split('\\').join('/');
      const bytes = await readFile(path);
      if (name.length > 240 || bytes.length > 200 * 1024 ** 2) {
        throw new Error(`CrazyGames file limit exceeded: ${name}`);
      }
      if (/(^|\/)\.|\.map$|\.env/i.test(name)) {
        throw new Error(`Unexpected private/source file in build: ${name}`);
      }
      entries[name] = [bytes, { level: /\.(png|jpg|webp|wasm)$/i.test(name) ? 0 : 6 }];
      files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}

await collect(buildFolder);
const totalUnpacked = files.reduce((sum, file) => sum + file.bytes, 0);

if (!entries['index.html']) {
  throw new Error('index.html must be present at the root of the CrazyGames build');
}
if (files.length > 1500) {
  throw new Error(`CrazyGames allows max 1500 files, found: ${files.length}`);
}

console.log(`[CrazyGames] Compressing ${files.length} files into ZIP archive...`);
const archive = zipSync(entries);

await mkdir(outFolder, { recursive: true });
const zipPath = resolve(outFolder, 'shadow-pulse-crazygames.zip');
await writeFile(zipPath, archive);

const manifest = {
  builtAt: new Date().toISOString(),
  target: 'CrazyGames Developer Portal',
  sdkVersion: 'CrazyGames SDK v3',
  fileCount: files.length,
  uncompressedBytes: totalUnpacked,
  uncompressedMiB: (totalUnpacked / (1024 * 1024)).toFixed(2),
  zipBytes: archive.length,
  zipMiB: (archive.length / (1024 * 1024)).toFixed(2),
  zipSha256: createHash('sha256').update(archive).digest('hex'),
  limitsCheck: {
    initialDownloadUnder50MB: totalUnpacked <= 50 * 1024 * 1024,
    zipUnder250MB: archive.length <= 250 * 1024 * 1024,
    fileCountUnder1500: files.length <= 1500,
    hasRootIndexHtml: true,
  },
};

await writeFile(resolve(outFolder, 'crazygames-manifest.json'), JSON.stringify(manifest, null, 2));

console.log('\n========================================');
console.log('🎉 CrazyGames Build Complete!');
console.log(`- Files: ${files.length} (Limit: 1500)`);
console.log(`- Unpacked Size: ${(totalUnpacked / (1024 * 1024)).toFixed(2)} MiB (CrazyGames Target: < 50 MiB)`);
console.log(`- ZIP File Size: ${(archive.length / (1024 * 1024)).toFixed(2)} MiB`);
console.log(`- Archive Path: ${zipPath}`);
console.log('========================================\n');
