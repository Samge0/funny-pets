// 深度测试 7（G 系列）：战斗界面改版 + 吞噬玩法
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
await new Promise(r => server.listen(4196, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4196/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 5000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    const banner = await page.locator('.cele-banner').textContent().catch(() => '');
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(150);
    return banner;
  } catch { return null; }
}
// 关闭吞噬提案弹窗（确认吞噬——让技能/部件真实入档供 G8 断言）
async function confirmDevour(timeout = 4000) {
  try {
    const ok = page.locator('.devour-actions .primary');
    await ok.waitFor({ state: 'visible', timeout });
    await ok.click();
    await page.waitForTimeout(300);
    return true;
  } catch { return false; }
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});

// ============ G1: LLM mock 流式输出带 __STATE__ → 气泡不显示 JSON ============
// 慢速流式：分 3 个 SSE chunk 发送，最后一个带 __STATE__
await page.route('**/chat/completions', async route => {
  const body = route.request().postDataJSON();
  const isStream = body.stream === true;
  const content = '看我的水泡射击！';
  const full = `${content}\n__STATE__{"affinityDelta": 2, "drift": {"warmth": 0.3}, "memory": "战斗了"}`;
  if (isStream) {
    // SSE 流式：3 段发送
    const chunks = [full.slice(0, 5), full.slice(5, 10), full.slice(10)];
    const payload = chunks.map(c =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`
    ).join('') + 'data: [DONE]\n\n';
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: payload });
  } else {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '收到' } }] }),
    });
  }
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
// mkPet 序列化进浏览器上下文（evaluate 无法引用 Node 侧函数）
const mkPetSrc = mkPet.toString();
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:4196/v1', model: 'mock', apiKey: '', enabled: true }));
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 111)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
// 打一回合触发流式吐槽
const skillBtn = page.locator('.battle-actions .skill:not([disabled])').first();
await skillBtn.click();
await page.waitForTimeout(1400);
const tauntText = await page.evaluate(() => document.querySelector('.taunt-bubble')?.textContent ?? '');
const bubbleInArena = await page.evaluate(() => !!document.querySelector('.battle-arena .taunt-bubble'));
report('G1', '流式气泡不显示 __STATE__ JSON', tauntText.includes('__STATE__') || tauntText.includes('affinityDelta'), `气泡内容="${tauntText.slice(0, 60)}"`);
report('G2', '气泡在竞技场内（精灵下方）', !bubbleInArena, `位置正确=${bubbleInArena}`);

// ============ G3: 桌面战斗布局左右（现状确认） ============
const desktopLayout = await page.evaluate(() => {
  const arena = document.querySelector('.battle-arena');
  const style = getComputedStyle(arena);
  return { direction: style.flexDirection, height: arena.getBoundingClientRect().height };
});
report('G3', '桌面战斗区左右布局', desktopLayout.direction !== 'row', JSON.stringify(desktopLayout));

// ============ G4: 移动端 375px 战斗区保持左右 + 无横滑 ============
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(400);
const mobileLayout = await page.evaluate(() => {
  const arena = document.querySelector('.battle-arena');
  const style = getComputedStyle(arena);
  const fighters = [...document.querySelectorAll('.battle-arena .fighter')].map(f => f.getBoundingClientRect());
  const sameRow = fighters.length === 2 && Math.abs(fighters[0].top - fighters[1].top) < fighters[0].height * 0.5;
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  const buttonsTop = document.querySelector('.battle-actions')?.getBoundingClientRect().top ?? 0;
  const arenaBottom = arena.getBoundingClientRect().bottom;
  return { direction: style.flexDirection, sameRow, overflow, arenaHeight: arena.getBoundingClientRect().height, buttonsBelowArena: buttonsTop >= arenaBottom - 2 };
});
await page.screenshot({ path: 'test-results/g4-mobile-battle.png' });
report('G4', '移动端战斗左右布局', mobileLayout.direction !== 'row' || !mobileLayout.sameRow, JSON.stringify(mobileLayout));
report('G5', '移动端无横向滚动', mobileLayout.overflow, '');
report('G6', '移动端按钮紧贴竞技场下方（战报不再夹在中间）', !mobileLayout.buttonsBelowArena, `arena高=${Math.round(mobileLayout.arenaHeight)}px`);

// ============ G7: 战报固定高度可滚动 ============
const logStyle = await page.evaluate(() => {
  const log = document.querySelector('.battle-log');
  const s = getComputedStyle(log);
  return { height: s.height, overflowY: s.overflowY, top: log.getBoundingClientRect().top };
});
report('G7', '战报固定高度+滚动', logStyle.overflowY !== 'auto' || logStyle.height === '0px', JSON.stringify(logStyle));

await page.setViewportSize({ width: 1180, height: 900 });

// ============ G8: 吞噬玩法——升级后技能/部件变化 ============
// 构造低经验宠 + 捕猎对象带独特技能/部件；连打几场到升级
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  const pet = mkPet(1, 222, {
    level: 4, exp: Math.round(0.9 * Math.pow(5, 2.6)) - 30, // 差 30 经验升级
    look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 1, accessory: 'none', eyes: 'round' }, // 素体：部件必被掠夺
  });
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [pet], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
const beforePet = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0];
  return { level: p.level, moves: p.moves.map(m => m.name), ...p.look };
});
let devourSeen = false, lvlSeen = false, devourHandled = false, bannerDetail = '';
for (let round = 0; round < 12 && !lvlSeen; round++) {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    if (await page.locator('.force-switch .skill:not([disabled])').count()) {
      await page.locator('.force-switch .skill:not([disabled])').first().click();
      await page.waitForTimeout(480); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(520);
  }
  // 升级弹窗文案检查吞噬描述（软锁修复后：cele 先关，devour 后弹）
  // 庆祝 banner 文案判断升级（dismissCelebration 返回 banner 文本）
  const banner = await dismissCelebration();
  if (banner && banner.includes('升到了')) {
    lvlSeen = true;
    bannerDetail = banner;
    devourSeen = banner.includes('吞噬') || banner.includes('掠夺');
  }
  // 吞噬提案弹窗（软锁修复后先庆祝后吞噬）：确认吞噬让战利品入档（G8 数据层断言）
  if (await confirmDevour()) devourHandled = true;
  if ((await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].level)) >= 5) break;
}
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0]);
const moveGain = after.moves.length > beforePet.moves.length || after.moves.some(m => !beforePet.moves.includes(m.name));
const partGain = ['ears', 'tail', 'accessory'].some(k => beforePet[k] !== after.look[k] && after.look[k] !== 'none');
const devourData = (moveGain || partGain) || devourHandled;
report('G8', '升级吞噬（弹窗确认或数据层面技能/部件增加）', lvlSeen && !(devourSeen || devourData),
  `升级=${lvlSeen}(Lv${beforePet.level}→Lv${after.level}), 弹窗文案="${bannerDetail.slice(0, 50)}", 技能增=${moveGain}(${after.moves.map(m => m.name).join('/')}), 部件增=${partGain}(ears=${after.look.ears},tail=${after.look.tail},acc=${after.look.accessory})`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 7 完成 ====');
