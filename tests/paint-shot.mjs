// 涂色面板视觉留样：打开涂色 tab → 涂渐变 → 截图
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
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
await new Promise(r => server.listen(4243, r));
const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const pet = { uid: 1, seed: 424101, name: '涂涂', types: ['妖精'], rarity: 'rare', level: 8, exp: 0, phase: 1, look: { body: 'round', ears: 'fluffy', tail: 'fluff', pattern: 'belly', palette: 10, accessory: 'bow', eyes: 'big' }, moves: [{ name: '撞击', type: '一般', power: 40 }], lore: '爱涂色的萌宠', caughtAt: 'meadow', caughtMap: 'meadow', base: { hp: 50, atk: 50, def: 50, spd: 50 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 }, nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 } };
await page.addInitScript((p) => {
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({ version: 1, pets: [p], nextUid: 2, dexSeen: {}, partyIds: [p.uid], giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 } }));
}, pet);
await page.goto('http://127.0.0.1:4243/funny-pets/app/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: '图鉴' }).click();
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.locator('.detail-tabs button', { hasText: '涂色' }).click();
await page.waitForTimeout(500);
// 身体渐变 粉→紫
const slot1 = page.locator('.paint-slot').first();
await slot1.locator('input[type=radio]').nth(1).check();
const inputs = slot1.locator('input[type=color]');
await inputs.nth(1).evaluate(el => { el.value = '#ffd6e0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await inputs.nth(2).evaluate(el => { el.value = '#a88fe0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(900);
await page.locator('.detail-card').screenshot({ path: 'test-results/paint-panel.png' });
console.log('saved test-results/paint-panel.png');
await browser.close();
server.close();
