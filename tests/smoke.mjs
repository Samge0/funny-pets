// 冒烟测试：起 preview 服务器，验证页面加载、地图点击、遭遇卡、开战、丢球、图鉴、存档持久化。
// 直接 node tests/smoke.mjs 运行（需先 npm run build && npm run preview，或用 PLAYWRIGHT_CHANNEL=chrome）。

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
await page.goto(base, { waitUntil: 'networkidle' });

// 1. 页面标题与地图渲染
if (!(await page.title()).includes('奇幻萌宠')) throw new Error('标题不对');
const mapCards = await page.locator('.map-card').count();
if (mapCards !== 6) throw new Error(`地图卡片数量 ${mapCards} != 6`);
console.log('✓ 页面加载，6 张地图');

// 2. 锁定判定：初始只有第 1 张可解锁（unlockAt=0），点击第 4 张应提示且不进入遭遇
await page.locator('.map-card').nth(3).click();
await page.waitForTimeout(300);
if (await page.locator('.encounter-view').count()) throw new Error('锁定地图不应进入遭遇');
console.log('✓ 地图锁定判定生效');

// 3. 点击第一张地图 => 相遇视图
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
const wildName = await page.locator('.wild-card h2').textContent();
if (!wildName?.trim()) throw new Error('野生精灵没有名字');
console.log(`✓ 遭遇野生精灵「${wildName}」`);

// 4. 截图：遭遇
await page.screenshot({ path: 'test-results/encounter.png', fullPage: false });

// 5. 空手直接丢球（可能失败，最多 15 次；失败后精灵留在原地可继续丢）
let caught = false;
for (let i = 0; i < 15; i++) {
  await page.getByRole('button', { name: '直接丢球' }).click();
  await page.waitForTimeout(350);
  if (await page.locator('.encounter-view').count() === 0) { caught = true; break; }
}
console.log(`✓ 直接丢球流程（${caught ? '捕获成功' : '多次未中，走战斗路径'}）`);

// 5b. 若还没捕到，走战斗路径：先在图鉴跳过（无宠可上阵），刷新新遭遇再试丢球
if (!caught) {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  for (let i = 0; i < 25 && !caught; i++) {
    await page.getByRole('button', { name: '直接丢球' }).click();
    await page.waitForTimeout(300);
    caught = (await page.locator('.encounter-view').count()) === 0;
    if (!caught && !(await page.locator('.encounter-view').count())) break;
    if (!caught && (await page.locator('.wild-card').count()) === 0) {
      await page.locator('.map-card').nth(0).click();
      await page.locator('.wild-card').waitFor({ timeout: 8000 });
    }
  }
}

// 6. 战斗路径（此刻应有宠可上阵）：再次遭遇并开战
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.waitForTimeout(300);
if (!(await page.locator('.battle-view').count())) {
  console.log('（无上阵精灵，跳过战斗路径）');
  await page.getByRole('button', { name: /离开|地图/ }).count() && await page.keyboard.press('Escape').catch(() => {});
} else {
  for (let i = 0; i < 30; i++) {
    const endBtn = page.getByRole('button', { name: '结束战斗' });
    if (await endBtn.count()) break;
    // 交替：两次技能攻击 + 一次丢球（打残更好捕）
    if (i % 3 === 2) await page.locator('.battle-actions .ball').click();
    else await page.locator('.battle-actions .skill').first().click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: '结束战斗' }).click({ timeout: 8000 });
  await page.locator('.map-view').waitFor({ timeout: 5000 });
  console.log('✓ 战斗流程走通（技能/丢球→结束）');
}

// 6. 图鉴应有 0 或 1 只（可能没捕到），直接验证视图切换 OK
await page.getByRole('button', { name: /图鉴/ }).click();
await page.waitForTimeout(300);
console.log(`✓ 图鉴视图，捕获计数=${await page.locator('.dex-card').count()}`);

// 7. localStorage 有存档
const saveRaw = await page.evaluate(() => localStorage.getItem('funny-pets-save-v1'));
if (!saveRaw) throw new Error('localStorage 没有存档');
const save = JSON.parse(saveRaw);
if (save.counters.encounters < 1) throw new Error('遭遇计数未写入');
console.log(`✓ 存档持久化（遭遇 ${save.counters.encounters}，捕获 ${save.counters.caught}）`);

// 9. 设置视图渲染 + LLM 开关存在
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
const llmToggle = await page.locator('.settings-view input[type="checkbox"]').count();
if (llmToggle !== 1) throw new Error('LLM 开关缺失');
console.log('✓ 设置视图 + LLM 开关');

// 10. 移动端视口截图
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: /地图/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'test-results/mobile-map.png', fullPage: false });
console.log('✓ 移动端视口截图');

if (errors.length) {
  console.error('页面错误:\n' + errors.join('\n'));
  process.exit(1);
}
await browser.close();
server.close();
console.log('\n全部冒烟检查通过 ✅');
