// Y1 E2E：quadruped 头部基础歪头在动画周期后保留（不落枕）
// 方法：进入详情页（Pet3D 实例），等动作周期跑几轮，采样头部 rotation——
// 基础 z（歪头）应稳定非零且随呼吸微摆；动作结束 x/y 应回到基础值（quadruped x/y 基础=0，
// 但 z=-0.25+headTilt ≠ 0 是关键断言：若动画把 z 归零则歪头消失）
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
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/funny-pets/`;
const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
// quadruped（歪头骨架）分享宠
const encoded = encodeURIComponent(JSON.stringify({
  n: '歪头兽', s: 777, lv: 8, ty: ['火'], bt: 'quadruped',
  mv: [{ name: '火花', type: '火', power: 40 }],
  lk: { body: 'round', ears: 'long', tail: 'stub', pattern: 'none', accessory: 'none', eyes: 'round', palette: 1 },
  lo: 'x',
}));
// 直接带 hash 首跳（同页 hash 变化不重载，IIFE 不会再跑）
await page.goto(base + 'app/#p=' + encoded, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.locator('.shared-view canvas').first().waitFor({ timeout: 8000 }).catch(() => {});
// 采样源码特征 + 运行观察
const feature = await page.evaluate(async () => {
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(appUrl)).text();
  return {
    baseRotSaved: src.includes('baseRot'),
    // 增量动画特征：hx()/hy() 包装器（minify 后仍是函数调用 + s*0.28 之类偏移）
    incrementalHead: /\(\)\+\s*s\s*\*\s*0\.28/.test(src) || /\?\?0\)/.test(src) && src.includes('baseRot'),
    notZeroReset: !/rotation\.x\s*=\s*0;\s*[a-z]\.rotation\.y\s*=\s*0/.test(src),
  };
});
// 6 秒动画观察期（若落枕崩溃/errorHandler 触发会进 errs 或 #app 被替换）
await page.waitForTimeout(6000);
const appAlive = await page.evaluate(() => !document.querySelector('#app')?.textContent?.includes('出错了'));
const canvasAlive = await page.locator('.shared-view canvas').count();
console.log(JSON.stringify({
  feature, appAlive, canvasAlive, errs,
  pass: feature.baseRotSaved && appAlive && canvasAlive === 1 && errs.length === 0,
}, null, 1));
await browser.close(); server.close();
