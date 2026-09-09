// 读叠耳的世界坐标 bbox——确认是否在画面内
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
await new Promise(r => server.listen(4226, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4226/funny-pets/app/', { waitUntil: 'networkidle' });
const r = await page.evaluate(async () => {
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const appSrc = await (await fetch(appUrl)).text();
  const m = appSrc.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(appUrl).pathname.replace(/\/[^/]*$/, '');
  const snap = await import(base + '/snapshot-' + m[1] + '.js');
  const app = await import(appUrl);
  const build = app.b;

  // 手动复刻 renderSnapshotOutlined 但保留场景引用
  const THREE = (await import(base + '/snapshot-' + m[1] + '.js')).default ?? null;
  // 直接用 window.THREE？不行——从 three chunk import
  const threeUrl = appSrc.match(/from"(\.\/three-[^"]+)"\)/)?.[1] ?? null;
  return { snapKeys: Object.keys(snap), threeUrl };
});
console.log(JSON.stringify(r));
await browser.close(); server.close();
