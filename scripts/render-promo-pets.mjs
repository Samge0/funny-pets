// Node 侧 3D 精灵快照渲染：用 Playwright 打开本地 file:// 页面（data URL 下 file:// import 被禁），
// 页面通过相对路径 module import 项目源码，渲染 5 只宣传页精灵并输出 PNG。
// 用法：node scripts/render-promo-pets.mjs
// 输出：promo/pets/pet-<i>.png（透明背景 220x220）

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)));
const outDir = join(root, 'promo', 'pets');
mkdirSync(outDir, { recursive: true });

const runnerPath = join(root, 'scripts', 'promo-renderer.html');
const runnerUrl = pathToFileURL(runnerPath).href;

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.goto(runnerUrl, { waitUntil: 'load' });
await page.waitForFunction('window.__done === true', { timeout: 30000 });
const results = await page.evaluate(() => window.__results);

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const b64 = r.dataUrl.replace(/^data:image\/png;base64,/, '');
  const out = join(outDir, `pet-${i}.png`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`${r.name} (${r.types.join('/')} ${r.rarity}) -> ${out}`);
}
await browser.close();
console.log('done');
