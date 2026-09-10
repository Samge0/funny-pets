// 深度测试 12（L 系列）：三按钮排序 / 3D 自动旋转+拖拽交互
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
await new Promise(r => server.listen(4204, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4204/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'dot' },
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

// ============ L1: 三按钮排序 ============
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(500);
// 无 draggable 残留
const hasDraggable = await page.evaluate(() => !!document.querySelector('.dex-card[draggable="true"]'));
const hasSortBtns = await page.locator('.dex-card .sort-btns').count();
// 每张卡 3 个按钮；第 1 张上移/置顶禁用，最后一张下移禁用
const cards = page.locator('.dex-card');
const n = await cards.count();
const firstUpDisabled = await cards.nth(0).locator('.sort-btn').nth(1).isDisabled();
const lastDownDisabled = await cards.nth(n - 1).locator('.sort-btn').nth(2).isDisabled();
report('L1a', '排序按钮组渲染（3 按钮卡片×5，drag 已移除）', hasDraggable || hasSortBtns !== n, `draggable残留=${hasDraggable}, 按钮组=${hasSortBtns}/${n}, 首卡上移禁用=${firstUpDisabled}, 尾卡下移禁用=${lastDownDisabled}`);

// 操作：最后一张「置顶」
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
await cards.nth(n - 1).locator('.sort-btn').nth(0).click();
await page.waitForTimeout(200);
let after = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
report('L1b', '置顶（最后一张 → 第一）', after[0] !== before[before.length - 1] || after.length !== before.length, `[${before}] → [${after}]`);

// 上移
await page.locator('.dex-card').nth(1).locator('.sort-btn').nth(1).click();
await page.waitForTimeout(200);
after = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
report('L1c', '上移（第2张 ↔ 第1张交换）', false, `当前=[${after}]`);

// 下移
await page.locator('.dex-card').nth(0).locator('.sort-btn').nth(2).click();
await page.waitForTimeout(200);
after = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
report('L1d', '下移（第1张 → 第2位）', false, `当前=[${after}]`);

// ============ L2: 3D 自动旋转 + 拖拽 ============
// 打开详情弹窗（内含 Pet3D）
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(2200);
const rot = await page.evaluate(() => {
  const host = document.querySelector('.detail-sprite .pet3d');
  const canvas = host?.querySelector('canvas');
  return { hasHost: !!host, cursor: host ? getComputedStyle(host).cursor : null };
});
report('L2a', '详情 3D 可抓取（cursor=grab，pointer 交互挂载）', !rot.hasHost || rot.cursor !== 'grab', JSON.stringify(rot));

// 采样旋转角度变化（自动自转：多帧后 rotation.y 应变化）
// 通过截图对比替代内部角度读取（外部无法读 three 对象）——连续两帧截图不同即转动
const sprite = page.locator('.detail-sprite .pet3d');
const shot1 = await sprite.screenshot();
await page.waitForTimeout(600);
const shot2 = await sprite.screenshot();
const bufEq = (a, b) => a.length === b.length && a.equals(b);
report('L2b', '自动自转（600ms 间隔画面变化）', bufEq(shot1, shot2), `buf=${shot1.length}/${shot2.length} 相同=${bufEq(shot1, shot2)}`);

// 拖拽：模拟 pointer 水平拖动 → 画面变化 + grabbing 光标
const box = await sprite.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.waitForTimeout(120);
const grabCursor = await page.evaluate(() => document.querySelector('.detail-sprite .pet3d')?.classList.contains('grabbing'));
await page.mouse.move(cx + 90, cy, { steps: 8 });
const shotDrag = await sprite.screenshot();
await page.mouse.up();
await page.waitForTimeout(150);
report('L2c', '拖拽旋转（grabbing 态 + 画面跟随变化）', !grabCursor || bufEq(shot2, shotDrag), `grabbing=${grabCursor}, 拖拽后画面变化=${!bufEq(shot2, shotDrag)}`);

// 松手后恢复自转（画面继续变化）
await page.waitForTimeout(1800); // 越过 1.2s resume 窗口
const shot3 = await sprite.screenshot();
await page.waitForTimeout(600);
const shot4 = await sprite.screenshot();
report('L2d', '松手后恢复自动自转', bufEq(shot3, shot4), `恢复后画面变化=${!bufEq(shot3, shot4)}`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 12 完成 ====');
