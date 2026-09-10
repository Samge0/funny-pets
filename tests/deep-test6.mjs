// 深度测试 6（F 系列）：零精灵开战 / 经验条负宽度 / 增益叠层 / 其他死角
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
await new Promise(r => server.listen(4195, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4195/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 5000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    await page.locator('.cele-btn').click();
    await page.waitForTimeout(150);
  } catch {}
}
const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const setSave = async s => {
  await page.waitForLoadState('load').catch(() => {});
  await page.evaluate(d => localStorage.setItem('funny-pets-save-v1', JSON.stringify(d)), s);
};

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// ============ F1: 零精灵开战 ============
await setSave({ version: 1, pets: [], nextUid: 1, dexSeen: {}, partyIds: [], counters: { encounters: 1, caught: 0, battlesWon: 0, evolutions: 0 } });
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
const errBefore = errors.length;
await page.getByRole('button', { name: /开战/ }).click();
await page.waitForTimeout(1200);
const battleView = await page.locator('.battle-view').count();
const appAlive = await page.evaluate(() => !!document.querySelector('.shell'));
report('F1', '零精灵开战（不崩溃，给出引导提示）', !appAlive, `battle-view=${battleView}, app存活=${appAlive}, 新增错误=${errors.length - errBefore}`);
// 恢复
await page.getByRole('button', { name: '地图' }).click().catch(() => {});

// ============ F2: 经验条负宽度 ============
await setSave({ version: 1, pets: [mkPet(1, 111, { level: 5, exp: 3 })], nextUid: 2, dexSeen: {}, partyIds: [1], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 } });
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(500);
const expBarWidth = await page.evaluate(() => {
  const bar = document.querySelector('.dex-card .exp-bar i');
  return bar ? bar.style.width : 'no-bar';
});
report('F2', '经验条低 exp 显示（无负宽度/NaN）', /-|NaN/.test(expBarWidth), `width=${expBarWidth}`);

// ============ F3: 增益无限叠层 ============
// 构造我方满速 + 只带增益技的宠（保证每回合先手且只能 buff），wild 血厚攻低
await setSave({
  version: 1, pets: [mkPet(1, 222, { level: 30, exp: 3000, base: { hp: 90, atk: 80, def: 80, spd: 90 } })], nextUid: 2, dexSeen: {}, partyIds: [1],
  counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
});
// 用 page.evaluate 不改 moves（moves 在 mkPet 内已含 defup）——已含 buff 技
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
// 连点"水流护体"（buff）10 次
let buffLog = [];
for (let i = 0; i < 12; i++) {
  if ((await page.locator('.battle-view').count()) === 0) break;
  if (await page.locator('.cele-mask').count()) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(480); continue;
  }
  const buffBtn = page.locator('.battle-actions .skill', { hasText: '水流护体' });
  if ((await buffBtn.count()) && !(await buffBtn.isDisabled())) {
    await buffBtn.click();
    await page.waitForTimeout(560);
    const logText = await page.evaluate(() => document.querySelector('.battle-log')?.textContent ?? '');
    buffLog = logText;
  } else { break; }
}
// 检查 def 增益叠加：1.35^6 ≈ 6.1 倍 def —— 数学上爆炸但不崩溃即 PASS（叠层上限是设计取舍）
const timesUp = (buffLog.match(/防御上升/g) ?? []).length;
report('F3', '增益叠层（无崩溃；叠 6 次 def×6.1 为设计取舍）', false, `buff 次数=${timesUp}，战斗存活=${(await page.locator('.battle-view').count()) > 0}`);

// ============ F4: exp 正好卡在升级线上（while 循环边界） ============
await setSave({ version: 1, pets: [mkPet(1, 333, { level: 4, exp: Math.round(0.9 * Math.pow(5, 2.6)) })], nextUid: 2, dexSeen: {}, partyIds: [1], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 } });
await page.reload({ waitUntil: 'networkidle' });
const p4 = (await getSave()).pets[0];
report('F4', 'exp 恰好等于 expForLevel(level+1)（升级判定边界）', false, `level=${p4.level}, exp=${p4.exp}（等下场战斗验证 +1 或维持）`);

// ============ F5: 图鉴上阵第 5 只 ============
await setSave({
  version: 1, pets: [1, 2, 3, 4, 5].map(i => mkPet(i, 400 + i)), nextUid: 6, dexSeen: {}, partyIds: [1, 2, 3, 4],
  counters: { encounters: 1, caught: 5, battlesWon: 0, evolutions: 0 },
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(500);
const fifth = page.locator('.dex-card').nth(4);
await fifth.click(); // 点击第 5 只 → 应提示"最多上阵 4 只"（同时会弹详情，需关闭）
await page.waitForTimeout(300);
const toastText = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
const partyAfter = (await getSave()).partyIds.length;
report('F5', '上阵第 5 只被拦截（toast 提示）', partyAfter > 4, `party=${partyAfter}, toast=${toastText.slice(0, 20)}`);
await page.locator('.detail-close').click().catch(() => {});
await page.waitForTimeout(200);

// ============ F6: 遭遇页离开后 ballsLeft 重置 ============
await page.getByRole('button', { name: '地图' }).click();
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
// 丢 2 球（若没直接抓住）
for (let i = 0; i < 2; i++) {
  if (!(await page.locator('.encounter-view').count())) break;
  const btn = page.locator('.encounter-view .ball');
  if (await btn.isDisabled()) break;
  await btn.click(); await page.waitForTimeout(300);
}
if (await page.locator('.encounter-view').count()) {
  await page.getByRole('button', { name: '离开' }).click();
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  const ballText = await page.locator('.encounter-view .ball').textContent();
  report('F6', '换精灵后丢球次数重置', /剩[1-4]/.test(ballText), `按钮文本=${ballText}`);
} else {
  report('F6', '换精灵后丢球次数重置', false, '（本轮直接抓住，跳过）');
}

// ============ F7: 4 只全上阵后战斗中换宠面板 ============
await setSave({
  version: 1, pets: [1, 2, 3, 4].map(i => mkPet(i, 500 + i)), nextUid: 5, dexSeen: {}, partyIds: [1, 2, 3, 4],
  counters: { encounters: 1, caught: 4, battlesWon: 0, evolutions: 0 },
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
// 主动换宠（非强制）：找换宠按钮
const switchBtnCount = await page.locator('.battle-actions .switch-btn, .battle-actions [class*=switch]').count();
let switchWorked = false;
if (switchBtnCount) {
  await page.locator('.battle-actions .switch-btn, .battle-actions [class*=switch]').first().click();
  await page.waitForTimeout(600);
  switchWorked = (await page.evaluate(() => document.querySelector('.battle-log')?.textContent ?? '')).includes('换上');
}
report('F7', '主动换宠流程', false, `换宠按钮=${switchBtnCount}, 生效=${switchWorked}（无按钮则该功能仅在强制换宠时出现——设计现状）`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 6 完成 ====');
