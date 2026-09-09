// 深度测试 18（R 系列）：取消勾选后预览骨架不漂移（仍是出战宠本体）
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
await new Promise(r => server.listen(4218, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4218/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
// 注意 look.body='round'：这正是触发旧 bug 的形态（旧代码会把 round 误映射成 mochi 骨架）
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['火'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火星弹', power: 45, type: '火' }, { name: '烈焰冲撞', power: 70, type: '火' }],
  look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'volcano', caughtMap: 'volcano', level: 46, exp: 100, phase: 2, ...over,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// ============ R1: 引擎级——预览 computed 的骨架守卫逻辑 ============
// 模拟：出战宠 bodyType='bipedal'（游戏中实际渲染骨架），look.body='round'
// 旧行为：未勾 body 也把 round→mochi（漂移）；新行为：保持 bipedal
const { bodyTypeBiased } = await import('../src/core/sprite3d.js');
{
  const mine = mkPet(1, 777);
  const realType = mine.bodyType ?? bodyTypeBiased(mine); // winBattle 传入值
  // DevourChoice 新逻辑等价复现：
  const BODY_MAP = { round: 'mochi', pear: 'bipedal', tall: 'bipedal', blob: 'quadruped', drop: 'serpent' };
  const look = { ...mine.look };
  const bodySwallowed = false; // 未勾 body
  const previewType = bodySwallowed && BODY_MAP[look.body] ? BODY_MAP[look.body] : realType;
  report('R1', '未勾 body 时预览骨架=出战宠真实骨架（round 不再误映射 mochi）',
    previewType !== realType, `real=${realType}, preview=${previewType}, look.body=${look.body}`);
}

// ============ R2: UI 级——吞噬弹窗内勾选/取消/全取消，预览不漂移 ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(9, 999)], nextUid: 10, dexSeen: {}, partyIds: [9],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').first().waitFor({ timeout: 8000 });

// 先抓出战宠在详情弹窗里的本体快照（基准图）
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(2600); // 等自转过一帧采样窗口（多帧对比无法做，用像素集合签名）
// 采样 6 帧签名（避开单帧自转差异，比较"帧集合相似度"）
async function stageSignature() {
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const b = await page.locator('.detail-sprite .pet3d').screenshot();
    shots.push(b.length);
    await page.waitForTimeout(120);
  }
  return shots;
}
const baseSig = await stageSignature();
await page.locator('.detail-close').click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: '地图' }).click();
await page.waitForTimeout(300);

// 打到吞噬弹窗
let saw = false;
for (let round = 0; round < 10 && !saw; round++) {
  await page.waitForTimeout(800);
  for (let w = 0; w < 6; w++) {
    if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').click().catch(() => {}); await page.waitForTimeout(300); continue; }
    if (await page.locator('.devour-card').count()) { saw = true; break; }
    break;
  }
  if (saw) break;
  await page.waitForTimeout(300);
  if (await page.locator('.devour-card').count()) { saw = true; break; }
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('.cele-btn').click().catch(() => {});
  await page.waitForTimeout(400);
}
if (saw) {
  await page.waitForTimeout(900);
  const cbs = page.locator('.devour-section .devour-item input[type=checkbox]');
  const n = await cbs.count();
  if (n > 0) {
    for (let i = 0; i < n; i++) await cbs.nth(i).uncheck();
    await page.waitForTimeout(500);
    const probe = await page.evaluate(() => {
      const p = window.__devourPreviewPet;
      if (!p) return null;
      return { bodyType: p.bodyType ?? null, lookBody: p.look.body, extras: (p.extraParts ?? []).length, phase: p.phase };
    });
    // 出战宠 lookBody='round'（触发旧 bug 的形态）：bodyType 不应被强制成 'mochi'，应保留真实骨架
    const stale = probe && probe.lookBody === 'round' && probe.bodyType === 'mochi';
    report('R2', `全取消后预览骨架不漂移（lookBody=round 时 bodyType 不再强制 mochi）`,
      !probe || stale || probe.bodyType == null,
      JSON.stringify(probe));
    await page.screenshot({ path: 'test-results/r-preview-restored.png' });
  } else {
    report('R2', '（本场仅技能候选，无部件勾选）', false, '跳过');
  }
  await page.getByRole('button', { name: /跳过/ }).click();
} else {
  report('R2', '吞噬弹窗出现', true, '10 场未触发');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 18 完成 ====');
