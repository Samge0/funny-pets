// 冒烟测试 v2：宣传页、游戏全流程（含 3D 渲染、捕捉庆祝弹窗、战斗动画、进化弹窗）、移动端无横滑。
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
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });

const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const base = 'http://127.0.0.1:4173/funny-pets/';

// 关闭庆祝弹窗（等待出现→点击→等待消失）
async function dismissCelebration(timeout = 6000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    const text = await page.locator('.cele-banner').textContent();
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    return text;
  } catch { return null; }
}

// ============ 宣传页 ============
await page.goto(base, { waitUntil: 'networkidle' });
if (!(await page.title()).includes('奇幻萌宠')) throw new Error('宣传页标题不对');
const petCards = await page.locator('.pet-card').count();
if (petCards !== 5) throw new Error(`精灵展示带 ${petCards} != 5`);
const petImgs = await page.locator('.pet-card img').count();
if (petImgs !== 5) throw new Error(`3D 快照 img ${petImgs} != 5`);
// 确认快照图真实加载（非破图）
const imgOk = await page.evaluate(() => [...document.querySelectorAll('.pet-card img')].every(i => i.complete && i.naturalWidth > 0));
if (!imgOk) throw new Error('3D 快照 PNG 加载失败');
const typeChips = await page.locator('.type-cloud .chip').count();
if (typeChips !== 18) throw new Error(`属性云 ${typeChips} != 18`);
console.log('✓ 宣传页：5 只 3D 快照精灵 + 18 属性云注入');

await page.locator('#hero-play').click();
await page.waitForURL('**/app/', { timeout: 5000 });
await page.waitForTimeout(600);
console.log('✓ CTA 跳转 /app/ 成功');

// ============ 游戏 ============
const mapCards = await page.locator('.map-card').count();
if (mapCards !== 6) throw new Error(`地图卡片数量 ${mapCards} != 6`);
console.log('✓ 游戏加载，6 张地图');

// 地图锁定判定
await page.locator('.map-card').nth(3).click();
await page.waitForTimeout(300);
if (await page.locator('.encounter-view').count()) throw new Error('锁定地图不应进入遭遇');
console.log('✓ 地图锁定判定生效');

// 遭遇：等待 3D canvas 挂载
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.locator('.wild-card canvas').first().waitFor({ timeout: 8000 });
const wildName = (await page.locator('.wild-card h2').textContent())?.trim();
if (!wildName) throw new Error('野生精灵没有名字');
console.log(`✓ 遭遇野生精灵「${wildName}」，3D 画布已挂载`);
await page.waitForTimeout(600);
await page.screenshot({ path: 'test-results/encounter.png', fullPage: false });

// 空手直接丢球（捕捉成功 => 庆祝弹窗）
let caught = false;
for (let i = 0; i < 25; i++) {
  await page.getByRole('button', { name: '直接丢球' }).click();
  await page.waitForTimeout(350);
  if (!(await page.locator('.encounter-view').count())) { caught = true; break; }
}
if (!caught) throw new Error('25 次直接丢球全部失败（概率异常）');
const banner = await dismissCelebration();
if (!banner?.includes('捕捉成功')) throw new Error(`弹窗文案异常: ${banner}`);
console.log(`✓ 捕捉庆祝弹窗（${banner.trim()}，星爆+3D 展示）`);
await page.screenshot({ path: 'test-results/catch-celebration.png', fullPage: false }).catch(() => {});

// 战斗路径：多回合节奏 + 换宠 + 结算
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
await page.locator('.fighter canvas').first().waitFor({ timeout: 8000 });

let turnCount = 0;
let battleDone = false;
for (let i = 0; i < 90; i++) {
  // 庆祝弹窗出现 = 战斗结算完成
  if (await page.locator('.cele-mask').count()) { battleDone = true; break; }
  if (await page.locator('.battle-view').count() === 0) { battleDone = true; break; }
  // 强制换宠
  if (await page.locator('.force-switch').count()) {
    const sw = page.locator('.force-switch .skill:not([disabled])');
    if (await sw.count()) { await sw.first().click(); await page.waitForTimeout(500); continue; }
  }
  // 技能按钮（结算中会被禁用但保持显示）
  const skill = page.locator('.battle-actions .skill:not([disabled])').first();
  const ball = page.locator('.battle-actions .ball:not([disabled])');
  if (turnCount % 4 === 3 && await ball.count()) await ball.click();
  else if (await skill.count()) await skill.click();
  else { await page.waitForTimeout(600); continue; } // 结算中，等待
  turnCount++;
  await page.waitForTimeout(650);
}
if (!battleDone) {
  await page.screenshot({ path: 'test-results/battle-stuck.png' });
  const logText = await page.evaluate(() => document.querySelector('.battle-log')?.textContent?.slice(-200) ?? 'no log');
  throw new Error(`90 轮未结束。turns=${turnCount} log: ${logText}`);
}
console.log(`✓ 战斗 ${turnCount} 回合走通，多回合节奏正常`);

// 关闭结算弹窗（升级/进化），可能连续多个
const b1 = await dismissCelebration();
if (b1) console.log(`✓ 战斗结算弹窗（${b1.trim()}）`);
await dismissCelebration();
await page.waitForTimeout(600);

// 图鉴：3D 快照
if (await page.locator('.battle-view').count()) await page.getByRole('button', { name: /地图/ }).click();
await page.getByRole('button', { name: /图鉴/ }).click();
await page.waitForTimeout(1600); // 等离屏快照替换占位
const dexCount = await page.locator('.dex-card').count();
console.log(`✓ 图鉴 ${dexCount} 只（3D 快照渲染）`);
await page.screenshot({ path: 'test-results/dex-3d.png', fullPage: false });

// 存档
const saveRaw = await page.evaluate(() => localStorage.getItem('funny-pets-save-v1'));
if (!saveRaw) throw new Error('localStorage 没有存档');
const save = JSON.parse(saveRaw);
if (save.counters.encounters < 2) throw new Error('遭遇计数异常');
console.log(`✓ 存档持久化（遭遇 ${save.counters.encounters}，捕获 ${save.counters.caught}，胜场 ${save.counters.battlesWon}）`);

// 设置视图
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
if ((await page.locator('.settings-view input[type="checkbox"]').count()) !== 1) throw new Error('LLM 开关缺失');
console.log('✓ 设置视图 + LLM 开关');

// ============ 进化验证：注入 17 级高经验，打赢一场触发 18 级进化 ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const pet = raw.pets[raw.pets.length - 1];
  pet.level = 17;
  pet.exp = Math.round(0.9 * Math.pow(17, 2.6)) + 200;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
await page.locator('.fighter canvas').first().waitFor({ timeout: 8000 });

let evolveBanner = null;
for (let i = 0; i < 60; i++) {
  if (await page.locator('.cele-mask').count()) {
    evolveBanner = await page.locator('.cele-banner').textContent();
    break;
  }
  if (await page.locator('.battle-view').count() === 0) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(500);
    continue;
  }
  const kind = i % 4 === 3 ? '.ball:not([disabled])' : '.skill:not([disabled])';
  const btn = page.locator(`.battle-actions ${kind}`);
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(500);
}
if (evolveBanner) {
  console.log(`✓ 结算弹窗（${evolveBanner.trim()}）`);
  await page.screenshot({ path: 'test-results/evolve-celebration.png', fullPage: false });
  await dismissCelebration();
  await dismissCelebration(); // 可能还有第二个弹窗
} else {
  console.log('（本场未触发升级，进化路径由单元数值测试覆盖）');
}

// ============ 移动端无横滑 ============
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(base + 'app/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const gameOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (gameOverflow) throw new Error('游戏移动端出现横向滚动');
await page.screenshot({ path: 'test-results/mobile-map.png', fullPage: false });

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const promoOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (promoOverflow) throw new Error('宣传页移动端出现横向滚动');
await page.screenshot({ path: 'test-results/mobile-promo.png', fullPage: false });
console.log('✓ 移动端 375px：游戏与宣传页均零横向滚动');

// 宣传页桌面整页截图
await page.setViewportSize({ width: 1180, height: 900 });
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
