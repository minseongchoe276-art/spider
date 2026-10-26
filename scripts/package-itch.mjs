import { build } from 'vite';
import { zipSync } from 'fflate';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {buildReleaseManifest} from './build-release-manifest.mjs';
import {softwareNotices} from './software-notices.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
// Explicitly reuse the compiled assets only after their source/rig checks pass.
if(!process.argv.includes('--reuse-compiled-motions'))execFileSync(process.execPath, ['scripts/build-motions.mjs'], { stdio: 'inherit' });
await build({ configFile: resolve(root, 'vite.itch.config.js'), mode: 'itch' });
const folder = resolve(root, 'artifacts/itchio');
await writeFile(resolve(folder, 'THIRD_PARTY_NOTICES.txt'), softwareNotices().text);
buildReleaseManifest(resolve(folder,'build'));
const entries = {};
const files = [];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else {
      const name = relative(resolve(folder, 'build'), path).split('\\').join('/');
      const bytes = await readFile(path);
      if (name.length > 240 || bytes.length > 200 * 1024 ** 2) throw new Error(`itch.io file limit: ${name}`);
      if (/(^|\/)\.|\.map$|\.env/i.test(name)) throw new Error(`Unexpected private/source file: ${name}`);
      entries[name] = [bytes, { level: /\.(png|jpg|webp|wasm)$/i.test(name) ? 0 : 6 }];
      files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await collect(resolve(folder, 'build'));
const total = files.reduce((sum, file) => sum + file.bytes, 0);
if (!entries['index.html'] || files.length > 1000 || total > 500 * 1024 ** 2) throw new Error('itch.io archive limits exceeded');
const archive = zipSync(entries);
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, 'shadow-pulse-itch-html5.zip'), archive);
await writeFile(resolve(folder, 'build-manifest.json'), JSON.stringify({
  builtAt: new Date().toISOString(), files: files.length, uncompressedBytes: total,
  zipBytes: archive.length, zipSha256: createHash('sha256').update(archive).digest('hex'),
  onlineTransport: 'Supabase; free roam and tag; custom matches omitted',
  defaultCity: 'procedural', hongKongProxy: 'https://minogame.site/urban-tiles', entries: files,
}, null, 2));
console.log(`itch.io ZIP ready: ${files.length} files, ${(total / 1024 ** 2).toFixed(1)} MiB unpacked, ${(archive.length / 1024 ** 2).toFixed(1)} MiB ZIP`);
