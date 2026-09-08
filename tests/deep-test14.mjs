// 深度测试 14（N 系列）：上下拖拽俯仰 + 关节动作系统
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
await new Promise(r => server.listen(4208, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4208/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }],
  look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'flower', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 777)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });

// 详情弹窗（free 拖拽模式）
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.waitForTimeout(800);
const sprite = page.locator('.detail-sprite .pet3d');
const box = await sprite.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// ============ N1: 上下拖拽俯仰 ============
const flat = await sprite.screenshot();
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(cx, cy + i * 18, { steps: 1 });
await page.mouse.up();
await page.waitForTimeout(250);
const tilted = await sprite.screenshot();
const pitchWorked = flat.length !== tilted.length || !flat.equals(tilted);
report('N1a', '垂直拖拽俯仰生效（向下拖 144px 画面变化）', !pitchWorked, `flat=${flat.length}B tilted=${tilted.length}B`);

// ============ N2: 关节动作（多帧采样：眨眼/抬头/抬腿等应有明显帧变化） ============
// 采样 10 秒（关节动作 3-8s 间隔触发，眨眼 2-5s）——统计帧多样性
const frames = new Set();
for (let i = 0; i < 26; i++) {
  const buf = await sprite.screenshot();
  frames.add(buf.length + ':' + (buf[10] ?? 0) + (buf[buf.length - 10] ?? 0));
  await page.waitForTimeout(400);
}
report('N2', `关节动作丰富（10s 内 ${frames.size}/26 帧画面互异）`, frames.size < 14, `unique=${frames.size}`);

// ============ N3: 页面内嵌模型 panY（touch-action 正确） ============
await page.locator('.detail-close').click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: '地图' }).click();
await page.waitForTimeout(300);
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
const wildTouch = await page.evaluate(() => getComputedStyle(document.querySelector('.wild-sprite3d .pet3d')).touchAction);
report('N3', '页面内嵌模型 touch-action=pan-y（垂直滑动让给页面滚动）', wildTouch !== 'pan-y', `touch-action=${wildTouch}`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 14 完成 ====');
