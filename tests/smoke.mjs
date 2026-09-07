// 冒烟测试：静态起 dist，验证宣传页（含注入精灵/无横滑）、游戏全流程、存档持久化。
// 直接 node tests/smoke.mjs 运行（需先 npm run build；可用 PLAYWRIGHT_CHANNEL=chrome）。

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
  } else {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(4173, r));
console.log('static server on :4173');

const channel = process.env.PLAYWRIGHT_CHANNEL;
const browser = await chromium.launch(channel ? { channel } : {});
const page = await browser.newPage({ viewport: { width: 1180, height: 860 } });

const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const base = 'http://127.0.0.1:4173/funny-pets/';

// ============ 宣传页 ============
await page.goto(base, { waitUntil: 'networkidle' });
if (!(await page.title()).includes('奇幻萌宠')) throw new Error('宣传页标题不对');
const petCards = await page.locator('.pet-card').count();
if (petCards !== 5) throw new Error(`精灵展示带 ${petCards} != 5`);
const svgCount = await page.locator('.pet-card svg').count();
if (svgCount !== 5) throw new Error('精灵 SVG 未注入');
const typeChips = await page.locator('.type-cloud .chip').count();
if (typeChips !== 18) throw new Error(`属性云 ${typeChips} != 18`);
console.log('✓ 宣传页：5 只展示精灵 + 18 属性云注入');

// 宣传页 CTA 跳转到 /app/
await page.locator('#hero-play').click();
await page.waitForURL('**/app/', { timeout: 5000 });
await page.waitForTimeout(500);
console.log('✓ CTA 跳转 /app/ 成功');

// ============ 游戏本体 ============
// 1. 地图渲染
const mapCards = await page.locator('.map-card').count();
if (mapCards !== 6) throw new Error(`地图卡片数量 ${mapCards} != 6`);
console.log('✓ 游戏加载，6 张地图');

// 2. 锁定判定
await page.locator('.map-card').nth(3).click();
await page.waitForTimeout(300);
if (await page.locator('.encounter-view').count()) throw new Error('锁定地图不应进入遭遇');
console.log('✓ 地图锁定判定生效');

// 3. 遭遇
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
const wildName = await page.locator('.wild-card h2').textContent();
if (!wildName?.trim()) throw new Error('野生精灵没有名字');
console.log(`✓ 遭遇野生精灵「${wildName}」`);

// 4. 截图：遭遇
await page.screenshot({ path: 'test-results/encounter.png', fullPage: false });

// 5. 空手直接丢球
let caught = false;
for (let i = 0; i < 15; i++) {
  await page.getByRole('button', { name: '直接丢球' }).click();
  await page.waitForTimeout(350);
  if ((await page.locator('.encounter-view').count()) === 0) { caught = true; break; }
}
console.log(`✓ 直接丢球流程（${caught ? '捕获成功' : '多次未中'}）`);

// 6. 战斗路径
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.waitForTimeout(300);
if (!(await page.locator('.battle-view').count())) {
  console.log('（无上阵精灵，跳过战斗路径）');
} else {
  for (let i = 0; i < 30; i++) {
    const endBtn = page.getByRole('button', { name: '结束战斗' });
    if (await endBtn.count()) break;
    if (i % 3 === 2) await page.locator('.battle-actions .ball').click();
    else await page.locator('.battle-actions .skill').first().click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: '结束战斗' }).click({ timeout: 8000 });
  await page.locator('.map-view').waitFor({ timeout: 5000 });
  console.log('✓ 战斗流程走通（技能/丢球→结束）');
}

// 7. 图鉴
await page.getByRole('button', { name: /图鉴/ }).click();
await page.waitForTimeout(300);
console.log(`✓ 图鉴视图，捕获计数=${await page.locator('.dex-card').count()}`);

// 8. 存档
const saveRaw = await page.evaluate(() => localStorage.getItem('funny-pets-save-v1'));
if (!saveRaw) throw new Error('localStorage 没有存档');
const save = JSON.parse(saveRaw);
if (save.counters.encounters < 1) throw new Error('遭遇计数未写入');
console.log(`✓ 存档持久化（遭遇 ${save.counters.encounters}，捕获 ${save.counters.caught}）`);

// 9. 设置视图 + LLM 开关
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
if ((await page.locator('.settings-view input[type="checkbox"]').count()) !== 1) throw new Error('LLM 开关缺失');
console.log('✓ 设置视图 + LLM 开关');

// 10. 移动端：游戏地图 + 宣传页均无横向滚动
await page.setViewportSize({ width: 375, height: 812 });
await page.getByRole('button', { name: /地图/ }).click();
await page.waitForTimeout(400);
const gameOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (gameOverflow) throw new Error('游戏移动端出现横向滚动');
await page.screenshot({ path: 'test-results/mobile-map.png', fullPage: false });

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const promoOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (promoOverflow) throw new Error('宣传页移动端出现横向滚动');
await page.screenshot({ path: 'test-results/mobile-promo.png', fullPage: false });
console.log('✓ 移动端 375px：游戏与宣传页均零横向滚动');

// 11. 宣传页整页截图（桌面）
await page.setViewportSize({ width: 1180, height: 860 });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'test-results/promo-desktop.png', fullPage: true });
console.log('✓ 宣传页桌面整页截图');

if (errors.length) {
  console.error('页面错误:\n' + errors.join('\n'));
  process.exit(1);
}
await browser.close();
server.close();
console.log('\n全部冒烟检查通过 ✅');
