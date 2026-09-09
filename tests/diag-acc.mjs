// 诊断：bipedal accessory 各款对比
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
await new Promise(r => server.listen(4213, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4213/funny-pets/app/', { waitUntil: 'networkidle' });
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
  for (const a of ['none', 'gem', 'flower', 'leaf', 'horn']) {
    const pet = {
      seed: 1234, name: 't', types: ['一般'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
      look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: a, eyes: 'dot' },
    };
    out[a] = await renderSnapshotOutlined(pet, 120);
  }
  return out;
}, snapUrl);
for (const [a, url] of Object.entries(shots)) {
  writeFileSync(`test-results/acc-bipedal-${a}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log('sizes:', Object.entries(shots).map(([a, u]) => `${a}=${u.length}`).join(' '));
await browser.close(); server.close();
