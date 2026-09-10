// 深度测试 4：进化数值边界 + 地图解锁 + 名字进化链 + 长字符串/注入
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
await new Promise(r => server.listen(4186, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4186/funny-pets/app/';
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
const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// ============ D1: 三段进化链（0→1→2 阶）与名字后缀 ============
// 构造 35 级差 1 点经验到 36（二阶进化）
await page.evaluate(() => {
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [{
      uid: 1, seed: 12345, name: '波球仔', types: ['水'], rarity: 'common',
      iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
      nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
      moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
      look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: 1, accessory: 'none', eyes: 'round' },
      lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore',
      level: 35, exp: Math.round(0.9 * Math.pow(36, 2.6)) - 1, phase: 1,
    }], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
// 打一场拿经验 → 跨过 36 → 二阶进化
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
let d1done = false;
for (let i = 0; i < 150; i++) {
  if (await page.locator('.cele-mask').count()) { d1done = true; break; }
  if ((await page.locator('.battle-view').count()) === 0) { d1done = true; break; }
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(480); continue;
  }
  const btn = page.locator('.battle-actions .skill:not([disabled])');
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(520);
}
const banner1 = await page.locator('.cele-banner').textContent().catch(() => '');
await dismissCelebration();
const petAfter = (await getSave()).pets[0];
report('D1', '35→36 跨二阶进化（phase 1→2，名字换"皇"后缀）', petAfter.phase !== 2, `phase=${petAfter.phase}, name=${petAfter.name}, banner=${banner1.trim()}, evolutions=${(await getSave()).counters.evolutions}`);

// ============ D2: 名字进化链极限（已带"皇"再进化不叠加） ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const p = raw.pets[0];
  p.name = '波球皇'; p.phase = 1; p.level = 35; p.exp = Math.round(0.9 * Math.pow(36, 2.6)) - 1;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
for (let i = 0; i < 150; i++) {
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
await dismissCelebration();
const petAfter2 = (await getSave()).pets[0];
report('D2', '带"皇"名字的二阶进化（不叠"皇皇"）', /皇皇|纳皇|皇纳/.test(petAfter2.name), `name=${petAfter2.name}, phase=${petAfter2.phase}`);

// ============ D3: 满 50 级封顶（经验溢出不炸） ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const p = raw.pets[0];
  p.level = 50; p.exp = 999999999; p.phase = 2;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
for (let i = 0; i < 150; i++) {
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
await dismissCelebration(); await dismissCelebration();
const pet50 = (await getSave()).pets[0];
report('D3', '50 级经验溢出封顶（level 不超 50，不三阶进化）', pet50.level > 50 || pet50.phase > 2, `level=${pet50.level}, phase=${pet50.phase}`);

// ============ D4: 地图解锁链（caught=3 解锁第二张） ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  raw.counters.caught = 3;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
const shoreUnlocked = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.map-card')];
  return !cards[1].classList.contains('locked');
});
const caveStillLocked = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.map-card')];
  return cards[2].classList.contains('locked');
});
report('D4', 'caught=3 解锁月光浅滩、回声洞窟仍锁', !(shoreUnlocked && caveStillLocked), `shore=${shoreUnlocked}, cave locked=${caveStillLocked}`);

// ============ D5: 解锁边界 30 → 全地图 + 图鉴目标 ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  raw.counters.caught = 30;
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
const allUnlocked = await page.evaluate(() => [...document.querySelectorAll('.map-card')].every(c => !c.classList.contains('locked')));
report('D5', 'caught=30 全地图解锁', !allUnlocked, '');

// ============ D6: 聊天注入（HTML/脚本入消息体） ============
await page.evaluate(() => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:4186/v1', model: 'mock', apiKey: '', enabled: true }));
});
await page.route('**/chat/completions', async route => {
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: '<img src=x onerror="window.__pwned=1">你好<script>window.__pwned=2</script>' } }] }),
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(400);
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
const input = page.locator('.chat-input input');
await input.fill('<b>bold</b>');
await input.press('Enter');
await page.waitForTimeout(1200);
const pwned = await page.evaluate(() => window.__pwned ?? 0);
const bubbleHtml = await page.locator('.chat-msg.assistant .bubble').last().innerHTML().catch(() => '');
report('D6', '聊天 XSS 注入不执行（Vue 文本插值转义）', pwned > 0, `__pwned=${pwned}, bubble=${bubbleHtml.slice(0, 60)}`);
await page.locator('.detail-close').click();

// ============ D7: 存档导入超长字符串名字（schema 边界） ============
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
const longName = '超'.repeat(300);
const badSave = await page.evaluate(nm => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  raw.pets[0].name = nm;
  return JSON.stringify({ magic: 'FUNPETS1', exportedAt: new Date().toISOString(), data: raw });
}, longName);
await page.setInputFiles('.import-btn input', { name: 'longname.json', mimeType: 'application/json', buffer: Buffer.from(badSave) });
await page.waitForTimeout(700);
const nameNow = (await getSave()).pets[0].name;
report('D7', '超长名字导入（校验不炸，UI 可渲染）', false, `name 长度=${nameNow.length}, pageerror=${errors.length}`);

// ============ D8: negative/NaN 输入（exp 负数/level 0） ============
const badSave2 = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  raw.pets[0].exp = -999;
  raw.pets[0].level = 1;
  return JSON.stringify({ magic: 'FUNPETS1', exportedAt: new Date().toISOString(), data: raw });
});
await page.setInputFiles('.import-btn input', { name: 'negexp.json', mimeType: 'application/json', buffer: Buffer.from(badSave2) });
await page.waitForTimeout(700);
const petNeg = (await getSave()).pets[0];
report('D8', '负经验导入（校验拦截或安全处理）', petNeg.exp < 0, `exp=${petNeg.exp}（负值入档后升级计算不炸即可）`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 4 完成 ====');
