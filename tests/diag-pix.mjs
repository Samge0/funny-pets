// 行为级验证：bipedal 各 accessory 的场景 mesh 数量差异
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
await new Promise(r => server.listen(4215, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4215/funny-pets/app/', { waitUntil: 'networkidle' });
const snapUrl = await page.evaluate(async () => {
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return base + '/snapshot-' + m[1] + '.js';
});
// 旁路 renderSnapshotOutlined：直接数快照渲染后的 PNG 与场景无关——
// 改为：利用 renderSnapshotOutlined 渲染大图（256px）+ 斜侧相机？不可改内部。
// 换个思路：leaf/horn 挂 headGroup（y=0.98 上方）——快照相机 y=1.05 lookAt(0,0.05)，
// 头顶部件在画面上部应该可见。用像素统计：上部 1/3 区域的非透明像素数。
const r = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const out = {};
  for (const a of ['none', 'gem', 'flower', 'leaf', 'horn']) {
    const pet = {
      seed: 1234, name: 't', types: ['一般'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
      look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: a, eyes: 'dot' },
    };
    const url2 = await renderSnapshotOutlined(pet, 128);
    // 画到 canvas 统计上部非透明像素
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = url2; });
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const top = ctx.getImageData(0, 0, 128, 42).data; // 上部 1/3
    let solid = 0;
    for (let i = 3; i < top.length; i += 4) if (top[i] > 40) solid++;
    out[a] = { topSolid: solid, bytes: url2.length };
  }
  return out;
}, snapUrl);
console.log(JSON.stringify(r, null, 1));
await browser.close(); server.close();
