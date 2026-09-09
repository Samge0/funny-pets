// 诊断：bipedal tail 各款快照对比
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const root = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/app' || p === '/funny-pets/app/') p = '/app/index.html';
  const file = join(root, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(4212, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4212/funny-pets/app/', { waitUntil: 'networkidle' });
const snapUrl = await page.evaluate(async () => {
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return base + '/snapshot-' + m[1] + '.js';
});
const shots = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const out = {};
  for (const t of ['none', 'stub', 'curl', 'fluff', 'spark']) {
    const pet = {
      seed: 1234, name: 't', types: ['一般'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
      look: { body: 'round', ears: 'none', tail: t, pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot' },
    };
    out[t] = await renderSnapshotOutlined(pet, 120);
  }
  return out;
}, snapUrl);
for (const [t, url] of Object.entries(shots)) {
  const b64 = url.split(',')[1];
  writeFileSync(`test-results/tail-bipedal-${t}.png`, Buffer.from(b64, 'base64'));
}
console.log('saved:', Object.keys(shots).map(t => `${t}(${shots[t].length}B)`).join(' '));
await browser.close(); server.close();
