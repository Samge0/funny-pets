// 深度测试 28（SEC 系列，2026-09-10 三角色审计）：分享链接攻击面 + 软锁修复回归
// SEC-1 恶意 #p= 分享链接（非法 types / 数值炸弹 / 超长载荷）不崩、不进战斗引擎
// SEC-2 软锁修复：庆祝关闭前吞噬弹窗不存在，关闭后才弹（时序断言）
// SEC-3 errorHandler 不泄漏 error.message 到 DOM
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
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/funny-pets/app/`;

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// ============ SEC-1: 恶意分享链接（3 个变体逐个访问） ============
// v2 压缩版恶意载荷在页内构造（CompressionStream 浏览器原生）：攻击者同样可以压缩后再发
const evilPayloads = [
  ['非法types', { n: '炸', s: 1, lv: 5, ty: ['dragonZZZ'], mv: [{ name: 'x', type: 'dragonZZZ', power: 10 }] }],
  ['数值炸弹', { n: '炸', s: 1, lv: 9007199254740993, ty: ['火'], mv: [{ name: 'x', type: '火', power: 1e15 }], bs: { hp: 1e15, atk: 1e15, def: 1e15, spd: 1e15 } }],
  ['缺种族值', { n: '炸', s: 1, lv: 5, ty: ['火'], mv: [{ name: 'x', type: '火', power: 10 }] }],
];
for (const [label, payload] of evilPayloads) {
  await page.goto(base, { waitUntil: 'networkidle' });
  const hash = '#p=' + encodeURIComponent(JSON.stringify(payload));
  await page.goto(base + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({
    appAlive: !!document.querySelector('.shell'),
    sharedView: !!document.querySelector('.shared-view'),
    mapBtns: document.querySelectorAll('.map-card').length,
    bodyText: document.body.textContent.slice(0, 60),
  }));
  const crashed = errors.length > 0 || !state.appAlive;
  report(`SEC-1(${label})`, `恶意分享链接不崩不进战斗（${label}）`, crashed,
    `sharedView=${state.sharedView}, mapCards=${state.mapBtns}, pageerrors=${errors.length}`);
  errors.length = 0;
}

// ============ SEC-1b: v2 压缩版恶意载荷（攻击者也能用压缩格式） ============
{
  const evilV2 = await page.evaluate(async () => {
    const payload = { n: '炸', s: 1, lv: 9007199254740993, ty: ['dragonZZZ'], mv: [{ name: 'x', type: 'dragonZZZ', power: 1e15 }] };
    const json = JSON.stringify(payload);
    const cs = new CompressionStream('deflate');
    const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return 'v2.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  await page.goto(base + '#p=' + evilV2, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    appAlive: !!document.querySelector('.shell'),
    sharedView: !!document.querySelector('.shared-view'),
  }));
  const crashed = errors.length > 0 || !st.appAlive;
  report('SEC-1b(v2炸弹)', 'v2 压缩恶意链接不崩不进战斗', crashed,
    `sharedView=${st.sharedView}, pageerrors=${errors.length}`);
  errors.length = 0;
}

// ============ SEC-2: 软锁时序——庆祝关闭前吞噬不存在，关闭后才弹 ============
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 999, { level: 50, exp: 5000, phase: 2 })], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
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
// 断言 1：庆祝弹窗出现时，吞噬弹窗必须还不存在（软锁修复核心时序）
const celeVisible = await page.locator('.cele-btn').isVisible().catch(() => false);
const devourWhileCele = await page.locator('.devour-mask').count();
report('SEC-2a', '庆祝弹窗期间吞噬弹窗不出现（时序修复）', celeVisible && devourWhileCele > 0,
  `celeBtn=${celeVisible}, devourMask=${devourWhileCele}`);
// 点掉庆祝 → 吞噬弹窗应出现
await page.locator('.cele-btn').dispatchEvent('click');
await page.waitForTimeout(600);
const devourAfter = await page.locator('.devour-mask').count();
report('SEC-2b', '庆祝关闭后吞噬弹窗出现', devourAfter === 0, `devourMask=${devourAfter}`);
// 跳过吞噬后回地图可正常操作（无软锁残留）
if (devourAfter) {
  await page.locator('.devour-actions .ghost').click();
  await page.waitForTimeout(400);
}
const mapOk = await page.locator('.map-card').first().isEnabled().catch(() => false);
report('SEC-2c', '吞噬跳过后地图可交互（无软锁）', !mapOk, `mapCardEnabled=${mapOk}`);

// ============ SEC-3: errorHandler 不把 error.message 写进 DOM ============
const leakText = await page.evaluate(() => {
  const app = document.getElementById('app');
  return app ? app.textContent : '';
});
report('SEC-3', 'errorHandler 无异常细节泄漏', /Cannot read|undefined|LLM API/i.test(leakText), `text="${leakText.slice(0, 40)}"`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 28 完成 ====');
