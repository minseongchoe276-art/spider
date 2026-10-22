import { createServer } from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const folder = resolve(import.meta.dirname, '../artifacts/itchio');
const prefix = '/uploads/123456/game/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
await mkdir(resolve(folder, 'validation'), { recursive: true });
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let status = 404;
  try {
    const name = decodeURIComponent(url.pathname.slice(prefix.length));
    const file = resolve(folder, 'build', name);
    if (!url.pathname.startsWith(prefix) || !file.startsWith(resolve(folder, 'build') + '/') || !name || name.endsWith('/')) throw new Error('Invalid path');
    const body = await readFile(file);
    status = 200;
    res.writeHead(status, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(status); res.end('Not found'); }
  await appendFile(resolve(folder, 'validation/requests.jsonl'), JSON.stringify({ url: url.pathname, status }) + '\n');
}).listen(4186, '127.0.0.1');
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>itch.io 업로드 사전 검수</title><style>body{margin:0;background:#07121d;color:#fff;font:16px sans-serif}header{height:44px;display:flex;align-items:center;justify-content:center}iframe{display:block;border:0;width:100vw;height:calc(100vh - 44px)}</style><header>itch.io 모의 임베드 · 중첩 경로 / 교차 출처 / sandbox</header><iframe title="SHADOW PULSE" src="http://127.0.0.1:4186${prefix}index.html${new URL(req.url, 'http://localhost').search}" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms" allow="fullscreen; gamepad; clipboard-write" allowfullscreen></iframe></html>`);
}).listen(4187, '127.0.0.1', () => console.log('itch.io sandbox preview: http://127.0.0.1:4187/'));
