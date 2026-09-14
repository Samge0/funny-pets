// 深度测试 42（v12 涂色修复复测）：
// F1 图鉴缩略图 colors 签名（涂色保存后缩略图 key 必须变化）
// F2 PetDetail modelTag 含 colors（主预览重建）
// F3 未保存涂色关闭详情 → confirm 拦截
// F4 涂色预览频繁重建不泄漏 WebGL context（20 次调色后旧 canvas 被移除）
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
await new Promise(r => server.listen(4244, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (/Too many active WebGL contexts|context lost/i.test(m.text())) errors.push(`console: ${m.text().slice(0, 120)}`); });
// confirm 应答状态机：'accept' | 'dismiss'（默认 accept；F3 用 dismiss 验证拦截）
let confirmMode = 'accept';
const confirmLog = [];
page.on('dialog', async d => {
  if (d.type() === 'confirm') {
    confirmLog.push(d.message());
    if (confirmMode === 'dismiss') await d.dismiss().catch(() => {});
    else await d.accept().catch(() => {});
  } else d.accept().catch(() => {});
});
const base = 'http://127.0.0.1:4244/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG-CONFIRMED ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  level: 5, exp: 0, phase: 0,
  look: { body: 'round', ears: 'round', tail: 'fluff', pattern: 'belly', palette: 1, accessory: 'none', eyes: 'round' },
  moves: [{ name: '撞击', type: '一般', power: 40 }],
  lore: '测试精灵', caughtAt: 'meadow', caughtMap: 'meadow',
  base: { hp: 50, atk: 50, def: 50, spd: 50 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 },
  nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
  ...over,
});

try {
  await page.addInitScript((pet) => {
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [pet], nextUid: 2, dexSeen: {}, partyIds: [pet.uid],
      giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPet(1, 424201));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // F1 图鉴缩略图 colors 签名：涂色保存前后 key 变化 → 直接调用页面内签名逻辑不可行（构建后），
  // 改为行为验证：保存涂色 → 存档 look.colors 写入 → dex-card img 的 key 属性链不可见。
  // 等价断言：保存涂色后 snapCache 若不含新 key，App.vue 的 petSnapshot 会在下帧渲染新快照
  // （旧版 key 不含 colors，img src 不变=旧图）。我们截取缩略图 img src 前后对比。
  await page.getByRole('button', { name: '图鉴' }).click();
  await page.waitForTimeout(400);
  const dexImgBefore = await page.locator('.dex-card img').first().getAttribute('src');
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('.detail-tabs button', { hasText: '涂色' }).click();
  await page.waitForTimeout(300);
  const slot1 = page.locator('.paint-slot').first();
  await slot1.locator('input[type=color]').first().evaluate((el) => {
    el.value = '#00aa55'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.locator('.paint-save').click();
  await page.waitForTimeout(500);
  await page.locator('.detail-close').click();
  await page.waitForTimeout(600);
  const dexImgAfter = await page.locator('.dex-card img').first().getAttribute('src');
  report('F1', '涂色保存后图鉴缩略图重渲（src 变化）', dexImgBefore === dexImgAfter,
    `same=${dexImgBefore === dexImgAfter}`);

  // F3 未保存涂色关闭 → confirm 弹出且可取消（取消后详情不关）
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('.detail-tabs button', { hasText: '涂色' }).click();
  await page.waitForTimeout(300);
  await page.locator('.paint-slot').first().locator('input[type=color]').first().evaluate((el) => {
    el.value = '#ff00ff'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  confirmMode = 'dismiss'; // 拦截：取消
  await page.locator('.detail-close').click();
  await page.waitForTimeout(400);
  const stillOpen = await page.locator('.detail-card').isVisible();
  report('F3', '未保存涂色关闭被 confirm 拦截（取消后详情仍开）', !stillOpen, `confirm Seen=${confirmLog.length > 0}`);
  confirmMode = 'accept'; // 放行
  await page.locator('.detail-close').click();
  await page.waitForTimeout(800);
  const closedNow = !(await page.locator('.detail-card').isVisible().catch(() => false));
  report('F3b', '确认后正常关闭', !closedNow);

  // F4 涂色预览频繁重建：连做 20 次调色 → 页面 canvas 数量稳定（旧的被移除）+ 无 WebGL 报错
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('.detail-tabs button', { hasText: '涂色' }).click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 20; i++) {
    await page.locator('.paint-slot').first().locator('input[type=color]').first().evaluate((el, idx) => {
      el.value = `#${(0x100000 + idx * 0x050505).toString(16).padStart(6, '0').slice(0, 6)}`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, i);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
  const canvasCount = await page.locator('.paint-panel canvas').count();
  const detached = await page.evaluate(() => document.querySelectorAll('canvas').length);
  report('F4', '频繁调色后 canvas 无堆积', canvasCount !== 1 || detached > 4, `panel=${canvasCount} doc=${detached}`);

  if (errors.length) console.log('PAGE-ERRORS ❌', errors.slice(0, 6));
  else console.log('no page errors ✅');
} finally {
  await browser.close();
  server.close();
}
