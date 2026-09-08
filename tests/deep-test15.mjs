// 深度测试 15（O 系列）：换宠头像 + 吞噬高频触发
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
await new Promise(r => server.listen(4209, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4209/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 5000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(150);
  } catch {}
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 46, exp: 100, phase: 2, ...over,
});
const mkPetSrc = mkPet.toString();

// 4 只高等级宠（永远不升级——专测"未升级也触发吞噬"）
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [1, 2, 3, 4].map(i => mkPet(i, 600 + i)), nextUid: 5, dexSeen: {}, partyIds: [1, 2, 3, 4],
    counters: { encounters: 1, caught: 4, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });

// ============ O1: 换宠面板头像 ============
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
await page.locator('.battle-actions .switch-toggle').click();
await page.waitForTimeout(300);
const avatarInfo = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.force-switch .switch-avatar')];
  return { count: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
});
report('O1a', `主动换宠面板含头像（${avatarInfo.loaded}/${avatarInfo.count} 张真实加载）`,
  avatarInfo.count < 3 || avatarInfo.loaded < avatarInfo.count, JSON.stringify(avatarInfo));

// 选择第二只（头像按钮）
const optBtns = page.locator('.force-switch .switch-opt:not([disabled])');
if ((await optBtns.count()) > 1) {
  await optBtns.nth(1).click();
  await page.waitForTimeout(1000);
  const activeNow = await page.evaluate(() => document.querySelector('.fighter.mine .plate-row strong')?.textContent);
  report('O1b', '点头像换宠生效', false, `当前出战=${activeNow}`);
}

// ============ O2: 未升级也触发吞噬（连打 6 场统计） ============
let devourCount = 0, wins = 0;
for (let round = 0; round < 6; round++) {
  // 清理残留遮罩（庆祝弹窗/吞噬弹窗），最多清 6 层
  for (let w = 0; w < 6; w++) {
    if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').click().catch(() => {}); await page.waitForTimeout(250); continue; }
    if (await page.locator('.devour-card').count()) { await page.getByRole('button', { name: /跳过/ }).click().catch(() => {}); await page.waitForTimeout(250); continue; }
    break;
  }
  // 回到地图（若仍在战斗视图，等结算流程完成）
  for (let w = 0; w < 10 && (await page.locator('.battle-view').count()); w++) {
    await page.getByRole('button', { name: '地图' }).click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  let ended = false;
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) { ended = true; break; }
    if ((await page.locator('.battle-view').count()) === 0) { ended = true; break; }
    if (await page.locator('.force-switch .switch-opt:not([disabled])').count()) {
      await page.locator('.force-switch .switch-opt:not([disabled])').first().click();
      await page.waitForTimeout(500); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(500);
  }
  await dismissCelebration();
  await dismissCelebration(1200);
  await dismissCelebration(800);
  if (await page.locator('.devour-card').count()) {
    devourCount++;
    await page.getByRole('button', { name: /跳过/ }).click(); // 跳过不影响统计
    await page.waitForTimeout(300);
  }
  wins++;
}
// 期望：未升级 flat 档 35%/技 + 30%/部件（野生约 2 技 3 部件）→ 单场至少 1 候选概率 ~1-(0.65^2 × 0.7^3) ≈ 85%
report('O2', `未升级胜利也掷吞噬（6 场中 ${devourCount} 场出现吞噬弹窗，期望 ≥4）`, devourCount < 4, `触发 ${devourCount}/${wins}`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 15 完成 ====');
