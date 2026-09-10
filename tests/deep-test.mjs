// 深度测试：验证静态审查发现的疑似 bug（修复前取证）。
// 运行前需 npm run build；复用 smoke 的静态服务器方式。
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
await new Promise(r => server.listen(4183, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4183/funny-pets/app/';
const results = [];
function report(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'BUG-CONFIRMED ❌' : 'NOT-REPRO    ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function dismissCelebration(timeout = 6000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  } catch { /* 无弹窗 */ }
}

// ---------- 准备：捕捉一只 ----------
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
// 直接丢球到成功
for (let i = 0; i < 30; i++) {
  if (!(await page.locator('.encounter-view').count())) break;
  const btn = page.locator('.encounter-view .ball');
  if (await btn.isDisabled()) {
    await page.getByRole('button', { name: '离开' }).click();
    await page.locator('.map-card').nth(0).click();
    await page.locator('.wild-card').waitFor({ timeout: 8000 });
    continue;
  }
  await btn.click();
  await page.waitForTimeout(300);
}
await dismissCelebration();
const hasPet = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.length >= 1);
if (!hasPet) { console.error('前置失败：没能捕捉到宠物'); process.exit(1); }

// ---------- B2: 清空存档后 souls/chats 残留 ----------
const keysBeforeReset = await page.evaluate(() => Object.keys(localStorage).sort());
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
await page.getByRole('button', { name: /清空存档/ }).click();
await page.waitForTimeout(1500); // location.reload()
await page.waitForLoadState('load');
await page.waitForTimeout(800);
const keysAfterReset = await page.evaluate(() => Object.keys(localStorage).sort());
report('B2', '清空存档后灵魂/聊天 localStorage 残留', keysAfterReset.length > 0, `重置前 [${keysBeforeReset}] 重置后 [${keysAfterReset}]`);

// ---------- 重新捕捉两只（后续测试用） ----------
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
for (let i = 0; i < 30; i++) {
  if (!(await page.locator('.encounter-view').count())) break;
  const btn = page.locator('.encounter-view .ball');
  if (await btn.isDisabled()) {
    await page.getByRole('button', { name: '离开' }).click();
    await page.locator('.map-card').nth(0).click();
    await page.locator('.wild-card').waitFor({ timeout: 8000 });
    continue;
  }
  await btn.click();
  await page.waitForTimeout(300);
}
await dismissCelebration();

// ---------- B45: 战斗中点击「相遇」tab → 内容区空白 ----------
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
await page.getByRole('button', { name: '相遇' }).click();
await page.waitForTimeout(400);
// 强制换宠面板消失的断言（deep-test 用）：
// 修复后「相遇」tab 在战斗中点击 → view='battle' → battle-view 正常显示
const mainVisible = await page.evaluate(() => !!document.querySelector('main .content') && document.querySelector('main .content').children.length > 0);
const battleStillThere = await page.locator('.battle-view').count();
report('B45', '战斗中点「相遇」tab 内容区空白', !mainVisible && battleStillThere === 0, `content 有子元素=${mainVisible}, battle-view=${battleStillThere}`);
await page.screenshot({ path: 'test-results/deep-b45-encounter-tab-blank.png' }).catch(() => {});
// 回到战斗继续（重新遭遇）
await page.getByRole('button', { name: '地图' }).click();
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });

// ---------- B3: 逃跑成功后战斗界面卡死 ----------
let ranOk = false, stuckTicks = 0;
for (let i = 0; i < 60 && !ranOk; i++) {
  const logText = await page.evaluate(() => document.querySelector('.battle-log')?.textContent ?? '');
  if (logText.includes('成功逃走')) { ranOk = true; break; }
  const runBtn = page.locator('.battle-actions .ghost:not([disabled])');
  if (await runBtn.count()) { await runBtn.click(); await page.waitForTimeout(500); }
  else await page.waitForTimeout(400);
}
if (ranOk) {
  await page.waitForTimeout(1200);
  const stillBattle = await page.locator('.battle-view').count();
  const actionBtns = await page.locator('.battle-actions button:not([disabled])').count();
  const forcePanel = await page.locator('.force-switch').count();
  const stuck = stillBattle > 0 && actionBtns === 0 && forcePanel === 0;
  report('B3', '逃跑成功后战斗界面卡死（无按钮无返回）', stuck, `battle-view=${stillBattle}, 可点按钮=${actionBtns}, 强制换宠面板=${forcePanel}`);
  await page.screenshot({ path: 'test-results/deep-b3-ran-stuck.png' }).catch(() => {});
} else {
  report('B3', '逃跑成功后战斗界面卡死', false, '60 轮内未成功逃跑，未复现');
}

// ---------- B1: 进化计数器不递增 ----------
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const pet = raw.pets[raw.pets.length - 1];
  pet.level = 17; pet.exp = Math.round(0.9 * Math.pow(17, 2.6)) + 200;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
let evolved = false;
for (let i = 0; i < 80; i++) {
  if (await page.locator('.cele-mask').count()) { evolved = true; break; }
  if ((await page.locator('.battle-view').count()) === 0) { evolved = true; break; }
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(500); continue;
  }
  const btn = page.locator('.battle-actions .skill:not([disabled])');
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(500);
}
await dismissCelebration(); await dismissCelebration();
const counters = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).counters);
const petPhase = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  return raw.pets[raw.pets.length - 1].phase ?? 0;
});
report('B1', '进化后 counters.evolutions 不递增', petPhase > 0 && counters.evolutions === 0, `宠物 phase=${petPhase}, evolutions=${counters.evolutions}`);

// ---------- B4: 清空聊天记录不持久化（刷新后复活） ----------
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('funny-pets-chats-v1') ?? '{}');
  const uid = String(JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].uid);
  store[uid] = { messages: [{ role: 'user', content: '旧消息A', t: 1 }, { role: 'assistant', content: '旧回复B', t: 2 }], total: 2, compressedAt: 0 };
  localStorage.setItem('funny-pets-chats-v1', JSON.stringify(store));
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(300);
const msgBefore = await page.locator('.chat-msg').count();
await page.getByRole('button', { name: /清空记录/ }).click(); // dialog 自动 accept
await page.waitForTimeout(400);
const msgAfterClear = await page.locator('.chat-msg').count();
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(300);
const msgAfterReload = await page.locator('.chat-msg').count();
report('B4', '清空聊天后刷新，聊天记录复活', msgBefore > 0 && msgAfterClear === 0 && msgAfterReload > 0, `清空前=${msgBefore}, 清空后=${msgAfterClear}, 刷新后=${msgAfterReload}`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度取证完成 ====');
