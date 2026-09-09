// V1 E2E：驱动真实战斗，验证敌方精灵流式气泡（无 LLM 时本地兜底）出现且与我方独立
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/app' || p === '/funny-pets/app/') p = '/app/index.html';
  const file = join(root, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(4235, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

async function dismissCelebration() {
  try { await page.locator('.cele-btn').first().click({ timeout: 800 }); await page.waitForTimeout(400); } catch { /* 无弹窗 */ }
}

// ---------- 准备：捕捉一只 ----------
await page.goto('http://127.0.0.1:4235/funny-pets/app/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
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
const hasPet = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.length >= 1);
if (!hasPet) { console.error('前置失败：没能捕捉到宠物'); process.exit(1); }

// ---------- 开战 ----------
const result = {};
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });

// 出手：我方攻击 → 敌方反击 → 各自气泡（优先选有威力的攻击技，变化技无伤害事件不触发台词）
for (let round = 0; round < 6; round++) {
  const skills = page.locator('.battle-actions .skill:not(.switch-opt)');
  const n = await skills.count();
  let clicked = false;
  for (let k = 0; k < n; k++) {
    const txt = await skills.nth(k).textContent();
    if (txt && txt.includes('威力')) { await skills.nth(k).click().catch(() => {}); clicked = true; break; }
  }
  if (!clicked && n) await skills.first().click().catch(() => {});
  await page.waitForTimeout(2600);
  const wildB = await page.locator('.taunt-bubble.taunt-wild').count();
  const mineB = await page.locator('.taunt-bubble.taunt-mine').count();
  result[`round${round}`] = { wildB, mineB };
  if (wildB && mineB) break;
  if (await page.locator('.battle-view').count() === 0) break;
}
result.wildText = await page.locator('.taunt-bubble.taunt-wild .taunt-text').textContent().catch(() => null);
result.mineText = await page.locator('.taunt-bubble.taunt-mine .taunt-text').textContent().catch(() => null);
// 敌我气泡左右分离验证
const wildBox = await page.locator('.taunt-bubble.taunt-wild').boundingBox().catch(() => null);
const mineBox = await page.locator('.taunt-bubble.taunt-mine').boundingBox().catch(() => null);
if (wildBox && mineBox) {
  result.separated = wildBox.x + wildBox.width < mineBox.x + 40 || mineBox.x + mineBox.width < wildBox.x + 40;
  result.boxes = { wildX: Math.round(wildBox.x), mineX: Math.round(mineBox.x) };
}
console.log(JSON.stringify(result, null, 1));
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await browser.close(); server.close();
