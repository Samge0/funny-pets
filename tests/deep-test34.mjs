// 深度测试 34（FIXED-ARENA 系列，2026-09-10）：战斗竞技场固定，操作区内部滚动
// 背景：技能多时操作区变高 → 整页滚动把顶部对战视图顶出视口，看不到战斗画面。
// 修复：battle-view 高度锁视口内（100dvh-顶栏-padding），arena 固定在外层；
//       操作区+换宠面板+战报包进 .battle-scroll 内部滚动（overscroll-behavior: contain）。
// FA-1 基线（4 技能）：整页无滚动，arena 可见
// FA-2 溢出场景（6 技能+换宠面板）：battle-scroll 内部可滚
// FA-3 滚动到底 arena 视口位置不变（固定核心断言）
// FA-4 滚动态下技能按钮仍可点击
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
const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
page.on('dialog', d => d.accept().catch(() => {}));
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [
    { name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' },
    { name: '水流护体', power: null, effect: 'defup', type: '水' }, { name: '泡泡束', power: 60, type: '水' },
    { name: '液态旋涡', power: 55, type: '水' }, { name: '寒冰激流', power: 50, type: '水' },
  ],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});

async function enterBattle(pets, partyIds) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(({ src, pets, partyIds }) => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: pets.map(p => mkPet(p.uid, p.seed)), nextUid: 3, dexSeen: {}, partyIds,
      counters: { encounters: 1, caught: 2, battlesWon: 0, evolutions: 0 },
    }));
  }, { src: mkPet.toString(), pets, partyIds });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
}

// FA-1: 基线
await enterBattle([{ uid: 1, seed: 999 }], [1]);
const base1 = await page.evaluate(() => ({
  docH: document.documentElement.scrollHeight, vh: innerHeight,
  arenaTop: document.querySelector('.battle-arena').getBoundingClientRect().top,
}));
report('FA-1', '基线：整页无滚动且 arena 可见', base1.docH > base1.vh + 2 || base1.arenaTop < 0 || base1.arenaTop > 400,
  `doc=${base1.docH} vh=${base1.vh} arenaTop=${Math.round(base1.arenaTop)}`);

// 溢出场景：2 只队伍 + 展开换宠面板
await enterBattle([{ uid: 1, seed: 999 }, { uid: 2, seed: 555 }], [1, 2]);
await page.locator('.switch-toggle').click();
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
  const sc = document.querySelector('.battle-scroll');
  return {
    arenaTop: document.querySelector('.battle-arena').getBoundingClientRect().top,
    scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    docH: document.documentElement.scrollHeight, vh: innerHeight,
  };
});
// FA-2: 内部滚动生效
report('FA-2', '溢出时 battle-scroll 内部可滚', before.scrollH <= before.clientH,
  `内容${before.scrollH} > 容器${before.clientH}`);
// FA-3: 滚到底 arena 固定
await page.evaluate(() => { document.querySelector('.battle-scroll').scrollTop = 99999; });
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  arenaTop: document.querySelector('.battle-arena').getBoundingClientRect().top,
  scrolled: document.querySelector('.battle-scroll').scrollTop,
}));
report('FA-3', '滚动后 arena 视口位置不变（固定）',
  Math.abs(before.arenaTop - after.arenaTop) >= 2,
  `top ${Math.round(before.arenaTop)}→${Math.round(after.arenaTop)}, 内滚${after.scrolled}px`);
// FA-4: 滚动态下技能可点
const clickable = await page.locator('.battle-actions .skill:not([disabled])').first().click({ timeout: 3000 }).then(() => true).catch(() => false);
report('FA-4', '滚动态下技能按钮可点击', !clickable, `clicked=${clickable}`);
// 整页无滚动
report('FA-5', '溢出场景整页仍无滚动', before.docH > before.vh + 2, `doc=${before.docH} vh=${before.vh}`);

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 34 完成 ====');
