// 深度测试 38（I 轮·UI 全量国际化 2026-09-10）：
// I1 切到 English 后导航/地图卡片/按钮全部变英文（抽查关键元素）
// I2 实体名显示映射：属性 chip / 稀有度 / 地图名 英文
// I3 切回中文即时生效（无刷新）
// I4 战报文案语言跟随（英文 locale 下打一场，战报文本含 "damage"）
// I5 document.title 随语言切换
// I6 zh-TW 繁体生效（抽查导航）
// I7 切语言后 localStorage 持久化 + 刷新保持
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
const base = `http://127.0.0.1:${server.address().port}/funny-pets/app/`;

const browser = await chromium.launch({});
const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// zh-CN 基线 + 存档
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 5)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
{
  const zhNav = await page.locator('nav.tabs button', { hasText: '地图' }).count();
  report('I0', 'zh-CN 基线：导航为中文', zhNav === 0, `zhNav=${zhNav}`);
}

// ============ I1/I2: 切 English ============
{
  await page.getByRole('button', { name: /设置/ }).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  await page.locator('.lang-select').selectOption('en');
  await page.waitForTimeout(400);
  const navEn = await page.locator('nav.tabs button', { hasText: 'Map' }).count();
  const navZh = await page.locator('nav.tabs button', { hasText: '地图' }).count();
  report('I1a', '切 English 后导航变 Map', navEn === 0 || navZh > 0, `Map=${navEn}, 地图=${navZh}`);
  // 设置面板标题
  const saveH3 = await page.locator('.settings-view h3', { hasText: 'Save data' }).count();
  report('I1b', '设置面板英文（Save data）', saveH3 === 0, `saveH3=${saveH3}`);
  // 地图卡片
  await page.locator('nav.tabs button', { hasText: 'Map' }).click();
  await page.waitForTimeout(300);
  const meadow = await page.locator('.map-name', { hasText: 'Breezy Meadow' }).count();
  report('I2a', '地图名英文（Breezy Meadow）', meadow === 0, `meadow=${meadow}`);
  const typeChip = await page.locator('.map-card .chip', { hasText: 'Grass' }).count();
  report('I2b', '属性 chip 英文（Grass）', typeChip === 0, `grass=${typeChip}`);
  // 相遇页（稀有度）
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  const rarityEn = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.wild-card .rarity-chip')];
    return chips.map(c => c.textContent.trim());
  });
  const hasCn = rarityEn.some(x => x === '常见' || x === '少见' || x === '稀有');
  report('I2c', '稀有度英文', hasCn || rarityEn.length === 0, JSON.stringify(rarityEn));
  // 技能按钮
  await page.getByRole('button', { name: /Battle/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  const skillTxt = await page.locator('.battle-actions .skill').first().textContent();
  report('I2d', '技能名英文（技能按钮无中文）', /[\u4e00-\u9fff]/.test(skillTxt ?? ''), JSON.stringify((skillTxt ?? '').trim().slice(0, 30)));
}

// ============ I4: 战报英文 ============
{
  let sawEn = false;
  let sawBattle = false;
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.cele-btn').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    sawBattle = true;
    if (await page.locator('.force-switch .skill:not([disabled])').count()) {
      await page.locator('.force-switch .skill:not([disabled])').first().click();
      await page.waitForTimeout(480); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(520);
    // 每回合检查战报（战斗结束会清场，循环后查不到）
    const logTxt = await page.evaluate(() => document.body.textContent);
    if (/damage|fainted|used|It's/i.test(logTxt)) sawEn = true;
  }
  report('I4', '战报文案英文（damage/fainted/used）', !sawEn || !sawBattle, sawEn ? 'found EN battle text' : (sawBattle ? 'no EN text in battle' : 'battle never started'));
  if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').dispatchEvent('click'); await page.waitForTimeout(300); }
  if (await page.locator('.devour-mask').count()) { await page.locator('.devour-actions .ghost').click(); await page.waitForTimeout(300); }
}

// ============ I5: title ============
{
  const titleEn = await page.title();
  report('I5', 'document.title 英文', !/FunPets|Fantasy/i.test(titleEn), `"${titleEn}"`);
}

// ============ I3: 切回中文即时生效 ============
{
  await page.locator('nav.tabs button', { hasText: 'Settings' }).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  await page.locator('.lang-select').selectOption('zh');
  await page.waitForTimeout(400);
  const navZh = await page.locator('nav.tabs button', { hasText: '地图' }).count();
  report('I3', '切回中文即时生效（无刷新）', navZh === 0, `zhNav=${navZh}`);
}

// ============ I6: zh-TW ============
{
  await page.locator('.lang-select').selectOption('zh-TW');
  await page.waitForTimeout(400);
  const navTw = await page.locator('nav.tabs button', { hasText: '地圖' }).count();
  report('I6', '繁体生效（地圖/圖鑑）', navTw === 0, `twNav=${navTw}`);
  const stored = await page.evaluate(() => localStorage.getItem('funny-pets-lang-v1'));
  report('I7', '持久化 zh-TW', stored !== 'zh-TW', `stored=${stored}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const navTw2 = await page.locator('nav.tabs button', { hasText: '地圖' }).count();
  report('I7b', '刷新后保持繁体', navTw2 === 0, `twNav=${navTw2}`);
}

// ============ 收尾：中文恢复 ============
await page.evaluate(() => localStorage.setItem('funny-pets-lang-v1', 'zh'));
if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 38 完成 ====');
