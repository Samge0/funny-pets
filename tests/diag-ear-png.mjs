// 渲染叠耳 PNG 直接看
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
await new Promise(r => server.listen(4224, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4224/funny-pets/app/', { waitUntil: 'networkidle' });
const r = await page.evaluate(async () => {
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const app = await import(appUrl);
  const build = app.b;
  const mk = (extraParts) => ({
    seed: 555, name: 't', types: ['火'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
    look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
    extraParts,
  });
  return {
    base: await (async () => { const { group } = build(mk([])); return group; })(),
  };
});
// renderSnapshotOutlined 在 snapshot chunk——直接调
const r2 = await page.evaluate(async () => {
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const appSrc = await (await fetch(appUrl)).text();
  const m = appSrc.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(appUrl).pathname.replace(/\/[^/]*$/, '');
  const snapUrl = base + '/snapshot-' + m[1] + '.js';
  const { renderSnapshotOutlined } = await import(snapUrl);
  const mk = (extraParts) => ({
    seed: 555, name: 't', types: ['火'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
    look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
    extraParts,
  });
  const a = await renderSnapshotOutlined(mk([]), 160);
  const b = await renderSnapshotOutlined(mk([{ part: 'ears', value: 'long' }]), 160);
  return { a, b };
});
writeFileSync('test-results/ex-ear-base.png', Buffer.from(r2.a.split(',')[1], 'base64'));
writeFileSync('test-results/ex-ear-with.png', Buffer.from(r2.b.split(',')[1], 'base64'));
console.log('base', r2.a.length, 'with', r2.b.length);
await browser.close(); server.close();
