// 深度测试 29（SHARE-3D 系列，2026-09-10）：分享页 Pet3D 交互
// SHARE-1 v2 压缩分享链接打开进入观赏页
// SHARE-2 轻点跳跃（提示文案「点击它会跳一下」承诺的功能，此前未实现）
// SHARE-3 垂直拖拽俯仰（此前 drag-mode=panY 只有水平旋转）
// SHARE-4 拖拽不误触跳跃（tap 判定：位移<6px 且 <400ms）
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/' || p === '/funny-pets') p = '/index.html';
  if (p === '/funny-pets/app' || p === '/funny-pets/app/') p = '/app/index.html';
  const file = join(root, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/funny-pets/app/`;

const browser = await chromium.launch({});
const errors = [];
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

// 在 app 页内构造 v2 压缩分享 hash（与 encodeShareParam 同算法）
const helper = await browser.newPage({ viewport: { width: 1180, height: 900 } });
await helper.goto(base, { waitUntil: 'networkidle' });
const hash = await helper.evaluate(async () => {
  const pet = { n: '跳跳糖', s: 777, lv: 8, ph: 0, ty: ['电'], ra: 'rare', mv: [{ name: '电光', type: '电', power: 55 }],
    lk: { body: 'round', ears: 'long', tail: 'spark', pattern: 'none', accessory: 'none', eyes: 'sparkle', palette: 2 },
    bs: { hp: 50, atk: 48, def: 42, spd: 55 }, iv: { hp: 8, atk: 10, def: 8, spd: 11 }, na: { hp: 1, atk: 1, def: 1, spd: 1.05 } };
  const json = JSON.stringify(pet);
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'p=v2.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
});
await helper.close();

// 查看者：新 context 新 page（真实分享场景）
const viewerCtx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
const page = await viewerCtx.newPage();
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
await page.goto(base + '#' + hash, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// SHARE-1：进入观赏页
const viewOk = (await page.locator('.shared-view').count()) === 1;
report('SHARE-1', 'v2 压缩链接打开进入观赏页', !viewOk, `sharedView=${viewOk}`);

const box = await page.locator('.shared-view .pet3d').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const hops = () => page.evaluate(() => Number(document.querySelector('.shared-view .pet3d')?.dataset.hops ?? 0));
const pitchVal = () => page.evaluate(() => document.querySelector('.shared-view .pet3d')?.dataset.pitch ?? 'none');

if (viewOk) {
  // SHARE-2：轻点 → 跳（dataset.hops 计数；3D 位置动画在 raf 内不可直接断言）
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(250);
  const h1 = await hops();
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(200);
  const h2 = await hops();
  report('SHARE-2', '轻点跳跃可触发且可重复', h1 < 1 || h2 <= h1, `hops=${h1}→${h2}`);

  // SHARE-3：垂直拖拽 → 俯仰（dataset.pitch 记录 free 模式俯仰角）
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(cx, cy + i * 12); await page.waitForTimeout(30); }
  await page.mouse.up();
  const pv = await pitchVal();
  report('SHARE-3', '垂直拖拽俯仰生效（此前 panY 模式被禁）', pv === 'none' || Number(pv) <= 0.05, `pitch=${pv}`);

  // SHARE-4：水平长拖不误触跳跃
  const before = await hops();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + i * 15, cy); await page.waitForTimeout(30); }
  await page.mouse.up();
  const after = await hops();
  report('SHARE-4', '拖拽不误触跳跃（tap 判定）', after !== before, `hops ${before}→${after}`);
}

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 29 完成 ====');
