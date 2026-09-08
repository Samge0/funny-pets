// 深度测试 9（I 系列）：吞噬改版——高概率/任意部件/自选弹窗/升级威力提升
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
await new Promise(r => server.listen(4199, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4199/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 5000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    const banner = await page.locator('.cele-banner').textContent();
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(150);
    return banner;
  } catch { return null; }
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 1, accessory: 'none', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// ============ I1/I2: 高概率 + 任意部件可吞（含 body/eyes/pattern） ============
// 用引擎级验证：直接调 offerDevourParts 1000 次统计覆盖率
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
// 从构建产物提取 evolve 模块（动态 import 主 chunk 后取导出）
const stat = await page.evaluate(async () => {
  const mods = performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('app-'));
  const mod = await import(mods[0]);
  // 主 chunk 不直接导出 evolve……改为经 window 打补丁不可行；改走 localStorage 注入统计法
  return null;
}).catch(() => null);
// 引擎级：在 Node 侧直接 import 源码验证概率与覆盖
const { offerDevourMoves, offerDevourParts, applyDevour, DEVOUR_MOVE_CHANCE, DEVOUR_PART_CHANCE } = await import('../src/core/evolve.js').catch(() => ({}));
if (offerDevourParts) {
  const pet = mkPet(1, 1);
  const wildLook = { body: 'tall', ears: 'pointy', tail: 'curl', pattern: 'spots', eyes: 'sparkle', accessory: 'flower', palette: 3 };
  let hit = { body: 0, ears: 0, tail: 0, pattern: 0, eyes: 0, accessory: 0 };
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const offers = offerDevourParts(pet, wildLook);
    for (const o of offers) hit[o.part]++;
  }
  const allReachable = Object.values(hit).every(c => c > N * 0.2); // 每个维度至少 20%+ 命中率（0.55 期望）
  report('I2', '任意部件可吞（body/eyes/pattern 也在候选池）', !allReachable, JSON.stringify({ 期望命中: Math.round(N * 0.55), 各维度命中: hit }));
  report('I1a', '部件掠夺概率 55%', DEVOUR_PART_CHANCE !== 0.55, `DEVOUR_PART_CHANCE=${DEVOUR_PART_CHANCE}`);
  report('I1b', '技能吞噬概率 60%', DEVOUR_MOVE_CHANCE !== 0.6, `DEVOUR_MOVE_CHANCE=${DEVOUR_MOVE_CHANCE}`);
} else {
  report('I0', 'evolve.js 源码可加载', true, 'Node 直连失败，跳过引擎级验证（UI 测试覆盖）');
}

// ============ I3: 吞噬选择弹窗（自选新增/替换） ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: '', model: '', apiKey: '', enabled: false }));
  // 差一点经验升级；素体无部件——对面野生带部件+独特技能
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 222, { level: 46, exp: Math.round(0.9 * Math.pow(47, 2.6)) + 50, phase: 2 })],
    nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
// 搜索吞噬弹窗（多场直到出现）
let sawDevour = false, devourDetail = '';
for (let round = 0; round < 10 && !sawDevour; round++) {
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
    await page.waitForTimeout(500);
  }
  await dismissCelebration();
  // 吞噬弹窗出现？
  if (await page.locator('.devour-card').count()) {
    sawDevour = true;
    devourDetail = await page.locator('.devour-card').textContent();
    // 验证弹窗结构：技能候选有"新学会"+"替换X"两个选项；部件候选直接勾选
    const hasNew = devourDetail.includes('新学会');
    const hasReplace = devourDetail.includes('替换「');
    report('I3a', '吞噬弹窗：技能候选含 新增/替换 两种方式', !hasNew || !hasReplace, `新学会=${hasNew}, 替换=${hasReplace}`);
    // 选第一个技能的"替换第一个现有技能"，再确认
    const firstRadio = page.locator('.devour-how input[type=radio]').first();
    if (await firstRadio.count()) await firstRadio.check();
    await page.getByRole('button', { name: /确认吞噬/ }).click();
    await page.waitForTimeout(600);
    const toast = await page.evaluate(() => document.querySelector('.global-toast')?.textContent ?? '');
    report('I3b', '确认吞噬后 toast 显示吞噬详情', !toast.includes('吞噬成功'), toast.slice(0, 50));
    break;
  }
}
report('I3', '吞噬选择弹窗出现（高概率下 10 场内必现）', !sawDevour, sawDevour ? devourDetail.slice(0, 60) : '10 场未出现');

// ============ I4: 升级威力提升（对比升级前后技能威力） ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 333, { level: 4, exp: Math.round(0.9 * Math.pow(5, 2.6)) - 5 })],
    nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
const before4 = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].moves.map(m => m.power));
let sawLevel = false;
for (let round = 0; round < 8 && !sawLevel; round++) {
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
    await page.waitForTimeout(500);
  }
  const banner = await page.locator('.cele-banner').textContent().catch(() => '');
  if (banner.includes('等级提升')) sawLevel = true;
  await dismissCelebration();
  // 吞噬弹窗直接确认/跳过
  if (await page.locator('.devour-card').count()) await page.getByRole('button', { name: /确认吞噬|跳过/ }).first().click();
  await page.waitForTimeout(200);
  if ((await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].level)) > 4) break;
}
const after4 = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0]);
const powered = after4.moves.every(m => !m.power || m.power > (before4[after4.moves.findIndex(x => x.name === m.name)] ?? 0));
report('I4', `升级后技能威力同步提升（Lv${4}→Lv${after4.level}）`, sawLevel && !powered, `前=[${before4}] 后=[${after4.moves.map(m => m.power)}]`);

// ============ I5: 进化后威力跃升（+10） ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 444, { level: 17, exp: Math.round(0.9 * Math.pow(18, 2.6)) + 50 })],
    nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
const before5 = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].moves.map(m => m.power));
for (let round = 0; round < 8; round++) {
  const phase = (await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].phase));
  if (phase >= 1) break;
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
    await page.waitForTimeout(500);
  }
  await dismissCelebration();
  if (await page.locator('.devour-card').count()) await page.getByRole('button', { name: /确认吞噬|跳过/ }).first().click();
  await page.waitForTimeout(200);
}
const after5 = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0]);
report('I5', '进化后技能威力跃升（phase 0→1，威力显著提升）', after5.phase >= 1 && !after5.moves.some(m => m.power > (before5[0] ?? 0)),
  `phase=${after5.phase}, 前=[${before5}] 后=[${after5.moves.map(m => m.power)}]`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 9 完成 ====');
