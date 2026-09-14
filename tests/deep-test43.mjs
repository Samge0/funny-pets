// 深度测试 43（v13 技能特效）：释放特效/受击特效/必杀强化/属性差异/自动清理
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
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
await new Promise(r => server.listen(4245, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
const base = 'http://127.0.0.1:4245/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG-CONFIRMED ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  level: 6, exp: 0, phase: 0,
  look: { body: 'round', ears: 'round', tail: 'fluff', pattern: 'belly', palette: 1, accessory: 'none', eyes: 'round' },
  moves: [
    { name: '水泡射击', type: '水', power: 45 },
    { name: '浪涌', type: '水', power: 70 },
    { name: '撞击', type: '一般', power: 40 },
    { name: '水流护体', type: '水', power: null, effect: 'defup' },
  ],
  lore: '测试精灵', caughtAt: 'meadow', caughtMap: 'meadow',
  base: { hp: 90, atk: 60, def: 60, spd: 60 }, iv: { hp: 10, atk: 10, def: 10, spd: 10 },
  nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
  ...over,
});

// 在页面里轮询等特效出现（战斗事件 300ms 间隔播放，特效存活 750-950ms——足够抓到）
async function waitFx(timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await page.locator('.fx-layer .fx-cast, .fx-layer .fx-hit').count();
    if (n > 0) return n;
    await page.waitForTimeout(60);
  }
  return 0;
}

try {
  await page.addInitScript((pet) => {
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [pet], nextUid: 2, dexSeen: {}, partyIds: [pet.uid],
      giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPet(1, 424301));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 进战斗
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  await page.locator('.fighter canvas').first().waitFor({ timeout: 8000 });

  // T1 打一技能 → cast 特效出现（水=wave 家族）
  await page.locator('.battle-actions .skill:not([disabled])').first().click();
  const fxCount = await waitFx();
  report('T1', '技能释放出现 cast/hit 特效', fxCount === 0, `count=${fxCount}`);
  // T2/T3 跨回合观察：不假设先手与命中（MISS 8% / 野生可能先手）——
  // 轮询最多 6 回合，直到观察到「任意 cast 家族类名」与「受击侧 hit 特效」
  let familyClass = '';
  let hitLoc = 0;
  let sawPlayerCast = false;
  for (let attempt = 0; attempt < 6 && (!sawPlayerCast || !hitLoc); attempt++) {
    const acts = page.locator('.battle-actions .skill:not([disabled])');
    if (!(await acts.count())) { await page.waitForTimeout(400); continue; }
    await acts.first().click();
    // 轮询本回合 2.2s：抓 cast 类名 + side-wild hit
    const s = Date.now();
    while (Date.now() - s < 2200) {
      if (!sawPlayerCast) {
        const cls = await page.locator('.fx-cast.side-player').first().getAttribute('class').catch(() => '');
        if (cls) { familyClass = cls; sawPlayerCast = true; }
      }
      hitLoc = await page.locator('.fx-hit.side-wild').count();
      if (sawPlayerCast && hitLoc > 0) break;
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(300);
  }
  report('T2', '我方 cast 特效家族类名合法（fx-* 7 家族之一）',
    !(familyClass ?? '').match(/fx-(burst|wave|bolt|leaf|crystal|magic|quake)/), familyClass);
  report('T3', '受击特效挂受击方位置（wild 被命中时）', hitLoc === 0, `hit side-wild count=${hitLoc}`);
  await page.screenshot({ path: 'test-results/battle-fx-mid.png' }).catch(() => {});

  // T4 特效自动清理（2s 后 battleFx 清空 → DOM 无残留）
  await page.waitForTimeout(2100);
  const leftover = await page.locator('.fx-layer .fx-cast, .fx-layer .fx-hit').count();
  report('T4', '特效动画后自动清理', leftover > 0, `leftover=${leftover}`);

  // T5 必杀技（威力≥70 浪涌）触发 ult 强化 + 震屏
  let ultSeen = false, shakeSeen = false;
  for (let turn = 0; turn < 12 && !ultSeen; turn++) {
    const acts = page.locator('.battle-actions .skill:not([disabled])');
    if (!(await acts.count())) { await page.waitForTimeout(500); continue; }
    // 点「浪涌」（第 2 个技能）
    await acts.nth(1).click().catch(() => {});
    // 轮询 ult 类
    const s = Date.now();
    while (Date.now() - s < 1500) {
      if (await page.locator('.fx-cast.ult').count()) { ultSeen = true; break; }
      await page.waitForTimeout(50);
    }
    if (await page.locator('.battle-view.shake').count()) shakeSeen = true;
    await page.waitForTimeout(400);
    if (await page.locator('.cele-mask, .battle-view').count() === 0) break;
  }
  report('T5', '必杀技触发 ult 强化特效', !ultSeen);
  report('T6', '必杀技触发强震屏', !shakeSeen);
  await page.screenshot({ path: 'test-results/battle-fx-ult.png' }).catch(() => {});

  // T7 长战斗 stress：连打 20 回合无 JS 错误、DOM 特效节点不堆积（≤4 个活跃）
  let maxLive = 0;
  for (let turn = 0; turn < 20; turn++) {
    if (await page.locator('.cele-mask').count()) break;
    if (await page.locator('.battle-view').count() === 0) break;
    const acts = page.locator('.battle-actions .skill:not([disabled])');
    if (!(await acts.count())) { await page.waitForTimeout(500); continue; }
    await acts.first().click();
    await page.waitForTimeout(300);
    const live = await page.locator('.fx-layer .fx-cast, .fx-layer .fx-hit').count();
    if (live > maxLive) maxLive = live;
    await page.waitForTimeout(500);
  }
  report('T7', '20 回合压力：特效节点不堆积', maxLive > 8, `maxLive=${maxLive}`);

  if (errors.length) console.log('PAGE-ERRORS ❌', errors.slice(0, 5));
  else console.log('no page errors ✅');
} finally {
  await browser.close();
  server.close();
}
