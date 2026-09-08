// 深度测试 13（M 系列）：真转身 / 拖拽生效 / 出战顺序联动 / 图鉴出战优先
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
await new Promise(r => server.listen(4207, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4207/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }],
  look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'flower', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [1, 2, 3, 4, 5].map(i => mkPet(i, 500 + i)), nextUid: 6, dexSeen: {}, partyIds: [1, 2],
    counters: { encounters: 1, caught: 5, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });

// ============ M3: 上阵宠默认排前（导入整理） ============
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(400);
let order = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
report('M3a', '图鉴初始：出战宠(1,2)排在前面', !(order[0] === 1 && order[1] === 2), `[${order}]`);

// toggleParty 上阵 5 → 按 partyIds 顺序排到出战区末位（1,2 之后），非出战宠排后
await page.locator('.dex-card').filter({ hasText: '宠5号' }).locator('.party-toggle').click();
await page.waitForTimeout(300);
order = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
report('M3b', '上阵后进入前排序列（宠5号排在出战区末位=第3）', !(order[0] === 1 && order[1] === 2 && order[2] === 5), `[${order}]`);

// ============ M2: 出战顺序 = 图鉴顺序 ============
// 图鉴排后 partyIds 顺序同步变化：手动调整排序（把宠2号上移到宠5号前）再开战看首发
const cards = page.locator('.dex-card');
const idxOf2 = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.findIndex(p => p.uid === 2));
await cards.nth(idxOf2).locator('.sort-btn').nth(0).click(); // 置顶宠2号
await page.waitForTimeout(200);
order = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
await page.getByRole('button', { name: '地图' }).click();
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
const firstName = await page.evaluate(() => document.querySelector('.fighter.mine .plate-row strong')?.textContent);
report('M2', '出战首发 = 图鉴排序第一只（置顶的宠2号）', firstName !== '宠2号', `图鉴=[${order.slice(0, 4)}], 首发=${firstName}`);

// ============ M1: 真转身（自动自转跨过半圈） ============
// 战斗里我方模型连续采样：20s 内应观察到"背影"（转过 ~180°）
// 用详情弹窗（模型更大）采样多帧截图多样性
await page.getByRole('button', { name: '地图' }).click().catch(() => {});
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(300);
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(800);
const sprite = page.locator('.detail-sprite .pet3d');
// 采样 12 帧（每 250ms），像素级互异比例（转过不同角度画面不同）
const frames = [];
for (let i = 0; i < 12; i++) {
  const buf = await sprite.screenshot();
  frames.push(buf.length + ':' + buf[buf.length >> 2]);
  await page.waitForTimeout(250);
}
const unique = new Set(frames).size;
report('M1a', `自动转身连续变化（3s 内 ${unique}/12 帧互异）`, unique < 8, `unique=${unique}`);

// 拖拽大幅旋转：拖 200px（≈144°），前后画面显著不同
const before = await sprite.screenshot();
const box = await sprite.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - i * 20, box.y + box.height / 2, { steps: 1 });
await page.mouse.up();
await page.waitForTimeout(250);
const after = await sprite.screenshot();
const dragChanged = before.length !== after.length || !before.equals(after);
report('M1b', '拖拽大幅旋转生效（200px 拖动画面变化）', !dragChanged, `before=${before.length}B after=${after.length}B 变化=${dragChanged}`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 13 完成 ====');
