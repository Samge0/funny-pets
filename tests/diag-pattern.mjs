// 诊断：各骨架 pattern 各值配对（找出与 none 相同的值）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
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
await new Promise(r => server.listen(4219, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4219/funny-pets/app/', { waitUntil: 'networkidle' });
const snapUrl = await page.evaluate(async () => {
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return base + '/snapshot-' + m[1] + '.js';
});
const result = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const out = {};
  for (const bt of ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi']) {
    const shots = {};
    for (const pat of ['none', 'spots', 'stripe', 'belly']) {
      const pet = {
        seed: 4321, name: 't', types: ['一般'], phase: 0, level: 5, bodyType: bt, moves: [],
        look: { body: 'round', ears: 'none', tail: 'none', pattern: pat, palette: 0, accessory: 'none', eyes: 'dot' },
      };
      shots[pat] = await renderSnapshotOutlined(pet, 96);
    }
    out[bt] = {
      spots_vs_none: shots.none !== shots.spots,
      stripe_vs_none: shots.none !== shots.stripe,
      belly_vs_none: shots.none !== shots.belly,
      stripe_vs_spots: shots.spots !== shots.stripe,
    };
  }
  return out;
}, snapUrl);
for (const [bt, r] of Object.entries(result)) {
  const bad = Object.entries(r).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(bt.padEnd(11), bad.length ? `❌ 无差异: ${bad.join(', ')}` : '✅ 全部有差异');
}
await browser.close(); server.close();
