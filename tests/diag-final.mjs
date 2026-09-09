// 硬刷新 + cache-bust 验证
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
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(4229, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4229/funny-pets/app/?bust=' + Date.now(), { waitUntil: 'networkidle' });
const r = await page.evaluate(async () => {
  window.__earDebug = [];
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const app = await import(appUrl); // 已加载，直接拿
  const build = app.b;
  const mk = (extraParts) => ({
    seed: 555, name: 't', types: ['火'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
    look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot' },
    extraParts,
  });
  const { group: g1 } = build(mk([]));
  const { group: g2 } = build(mk([{ part: 'ears', value: 'long' }]));
  const count = (g) => { let c = 0; g.traverse(() => c++); return c; };
  // earDebug 应被 build 触发（因为 window 存在）
  return { c1: count(g1), c2: count(g2), debug: window.__earDebug };
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); server.close();
