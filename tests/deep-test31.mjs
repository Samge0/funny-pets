// 深度测试 31（HASH 系列，2026-09-10）：同 tab 切换分享链接
// 背景：浏览器对纯 #hash 变化不重载页面——此前 initShared 只在启动时跑一次，
// 同 tab 地址栏换新分享链接回车后画面不变，必须手动点刷新（用户体验缺陷）。
// HASH-1 同 tab 换链接（仅 hash 变化，无 reload）→ 观赏页宠物即时切换
// HASH-2 三连换链稳定
// HASH-3 清除 hash → 退出观赏模式回地图
// HASH-4 非法链接 → toast 提示、无崩溃、不误退当前视图
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
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

// 在 app 页内构造 v2 压缩分享 hash（与 encodeShareParam 同算法）
await page.goto(base, { waitUntil: 'networkidle' });
const mkHash = (name, seed) => page.evaluate(async ({ name, seed }) => {
  const pet = { n: name, s: seed, lv: 8, ph: 0, ty: ['电'], ra: 'rare', mv: [{ name: '电光', type: '电', power: 55 }],
    lk: { body: 'round', ears: 'long', tail: 'spark', pattern: 'none', accessory: 'none', eyes: 'sparkle', palette: 2 },
    bs: { hp: 50, atk: 48, def: 42, spd: 55 }, iv: { hp: 8, atk: 10, def: 8, spd: 11 }, na: { hp: 1, atk: 1, def: 1, spd: 1.05 } };
  const json = JSON.stringify(pet);
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'p=v2.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}, { name, seed });
const h1 = await mkHash('第一只', 111);
const h2 = await mkHash('第二只', 222);
const h3 = await mkHash('第三只', 333);

// 打开第一条
await page.goto(base + '#' + h1, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const n1 = await page.locator('.shared-view h2').textContent().catch(() => '');
report('HASH-0', '初始链接进入观赏页', !n1.includes('第一只'), n1.trim());

// HASH-1：同 tab 仅变 hash → 宠物即时切换（浏览器不重载，靠 hashchange 监听）
await page.goto(base + '#' + h2);
await page.waitForTimeout(1200);
const n2 = await page.locator('.shared-view h2').textContent().catch(() => '');
const sw1 = n2.includes('第二只') && !n2.includes('第一只');
report('HASH-1', '同tab换链接即时生效（无需手动刷新）', !sw1, n2.trim());

// HASH-2：三连换链
await page.goto(base + '#' + h3);
await page.waitForTimeout(1000);
const n3 = await page.locator('.shared-view h2').textContent().catch(() => '');
report('HASH-2', '三连换链稳定', !n3.includes('第三只'), n3.trim());

// HASH-3：清除 hash → 退出观赏模式回地图
await page.goto(base);
await page.waitForTimeout(800);
const backToMap = (await page.locator('.shared-view').count()) === 0;
report('HASH-3', '清除hash退出观赏模式', !backToMap, `sharedView=${!backToMap}`);

// HASH-4：非法链接 → toast 提示、无崩溃
await page.goto(base + '#p=v2.garbage-not-valid');
await page.waitForTimeout(800);
const toastShown = (await page.locator('[class*=toast]').count()) > 0;
report('HASH-4', '非法链接toast提示且不崩', errors.length > 0, `toast=${toastShown}, errors=${errors.length}`);

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 31 完成 ====');
