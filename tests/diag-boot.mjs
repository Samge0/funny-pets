
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = join(process.cwd(), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/app/' || p === '/funny-pets/app') p = '/app/index.html';
  if (p === '/funny-pets/' || p === '/funny-pets') p = '/index.html';
  const file = join(root, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/funny-pets/app/`;
const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN' });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log('#app innerHTML head:', (await page.evaluate(() => document.getElementById('app')?.innerHTML?.slice(0, 200)) ?? 'EMPTY'));
console.log('map-cards:', await page.locator('.map-card').count());
console.log('errors:', errors.slice(0, 5));
await browser.close(); server.close();
