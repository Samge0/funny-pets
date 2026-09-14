// 深度测试 44（v13.1 特效开关）：设置页开关/持久化/关闭无特效/重新开启恢复
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
await new Promise(r => server.listen(4247, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4247/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG-CONFIRMED ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common', level: 6, exp: 0, phase: 0,
  look: { body: 'round', ears: 'round', tail: 'fluff', pattern: 'belly', palette: 1, accessory: 'none', eyes: 'round' },
  moves: [{ name: '水泡射击', type: '水', power: 45 }, { name: '浪涌', type: '水', power: 70 }, { name: '撞击', type: '一般', power: 40 }, { name: '水流护体', type: '水', power: null, effect: 'defup' }],
  lore: 't', caughtAt: 'meadow', caughtMap: 'meadow',
  base: { hp: 90, atk: 60, def: 60, spd: 60 }, iv: { hp: 10, atk: 10, def: 10, spd: 10 }, nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
});

async function enterBattle() {
  await page.getByRole('button', { name: '地图' }).click();
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  await page.locator('.fighter canvas').first().waitFor({ timeout: 8000 });
}
async function doTurn() {
  const acts = page.locator('.battle-actions .skill:not([disabled])');
  if (!(await acts.count())) { await page.waitForTimeout(500); return false; }
  await acts.first().click();
  // 1.2s 内轮询特效节点
  const s = Date.now();
  let n = 0;
  while (Date.now() - s < 1300) {
    n = await page.locator('.fx-layer .fx-cast, .fx-layer .fx-hit').count();
    if (n > 0) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

try {
  await page.addInitScript((pet) => {
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [pet], nextUid: 2, dexSeen: {}, partyIds: [pet.uid],
      giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPet(1, 424401));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // T1 设置页开关存在且默认开
  await page.getByRole('button', { name: '设置' }).click();
  const toggle = page.locator('.fx-toggle input[type=checkbox]');
  await toggle.waitFor({ timeout: 3000 });
  const defaultOn = await toggle.isChecked();
  report('T1', '设置页战斗特效开关存在且默认开启', !defaultOn);

  // T2 关闭 → localStorage 落盘
  await toggle.uncheck();
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => localStorage.getItem('funny-pets-battle-fx-v1'));
  report('T2', '关闭后偏好持久化', stored !== '0', `stored=${stored}`);

  // T3 关闭状态进战斗 → 打一轮无特效 DOM
  await enterBattle();
  const fxWhileOff = await doTurn();
  report('T3', '关闭后战斗无特效 DOM', fxWhileOff, `fxSeen=${fxWhileOff}`);

  // T4 重开开关（回设置页）→ 进战斗特效恢复
  await page.getByRole('button', { name: '设置' }).click().catch(async () => {
    // 战斗中先逃跑
    const run = page.locator('.battle-actions button', { hasText: /逃跑/ });
    if (await run.count()) { await run.click(); await page.waitForTimeout(600); }
    await page.getByRole('button', { name: '设置' }).click();
  });
  await toggle.waitFor({ timeout: 3000 });
  const stillOff = await toggle.isChecked();
  report('T4', '设置页回读仍为关（UI 同步）', stillOff);
  await toggle.check();
  await page.waitForTimeout(200);
  const storedOn = await page.evaluate(() => localStorage.getItem('funny-pets-battle-fx-v1'));
  report('T5', '重新开启后偏好更新', storedOn !== '1', `stored=${storedOn}`);

  await enterBattle();
  const fxWhileOn = await doTurn();
  report('T6', '重新开启后战斗特效恢复', !fxWhileOn, `fxSeen=${fxWhileOn}`);

  // T7 刷新页面偏好保持（localStorage 持久化跨会话）
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '设置' }).click();
  const afterReload = await page.locator('.fx-toggle input[type=checkbox]').isChecked();
  report('T7', '刷新后开关状态保持', !afterReload);

  if (errors.length) console.log('PAGE-ERRORS ❌', errors.slice(0, 5));
  else console.log('no page errors ✅');
} finally {
  await browser.close();
  server.close();
}
