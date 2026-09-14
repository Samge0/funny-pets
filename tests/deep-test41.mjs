// 深度测试 41（v12 涂色）：自由涂色 / 渐变 / AI 按钮态 / 保存生效 / 清除 / 分享链接携带
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
await new Promise(r => server.listen(4241, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4241/funny-pets/app/';
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
  // 预置存档：1 只已捕捉宠物（save 是模块级 reactive——localStorage 注入后首次加载读取）
  await page.addInitScript((pet) => {
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [pet], nextUid: 2, dexSeen: {}, partyIds: [pet.uid],
      giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPet(1, 424101));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // T1 打开详情 + 切到涂色 tab
  await page.getByRole('button', { name: '图鉴' }).click();
  await page.locator('.dex-card').first().click();
  await page.waitForTimeout(400);
  await page.locator('.detail-card').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('.detail-tabs button', { hasText: '涂色' }).click();
  await page.waitForTimeout(300);
  const panelVisible = await page.locator('.paint-panel').isVisible();
  report('P41-1', '涂色 tab 打开面板', !panelVisible);

  // T2 预览模型存在
  const previewCount = await page.locator('.paint-panel .pet3d canvas').count();
  report('P41-2', '涂色预览 3D 渲染', previewCount < 1, `canvas=${previewCount}`);

  // T3 单色涂身体：color input 设值 → 预览 dirty
  const bodyColor = page.locator('.paint-slot').first().locator('input[type=color]').first();
  await bodyColor.evaluate((el) => {
    el.value = '#ff8800';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700); // 等预览重建（key 变化 → Pet3D dispose/init）
  const saveEnabled = await page.locator('.paint-save').isEnabled();
  report('P41-3', '涂色后保存按钮可用（dirty）', !saveEnabled);

  // T4 保存 → 存档里有 colors
  await page.locator('.paint-save').click();
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
    return s.pets?.[0]?.look?.colors ?? null;
  });
  report('P41-4', '保存后 colors 落盘', saved?.body !== '#ff8800', JSON.stringify(saved));

  // T5 渐变模式：身体切渐变 f=#ff0000 t=#0000ff → 保存
  await page.locator('.paint-slot').first().locator('input[type=radio]').nth(1).check();
  await page.waitForTimeout(200);
  const gradInputs = page.locator('.paint-slot').first().locator('input[type=color]');
  await gradInputs.nth(1).evaluate((el) => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await gradInputs.nth(2).evaluate((el) => { el.value = '#0000ff'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(700);
  await page.locator('.paint-save').click();
  await page.waitForTimeout(400);
  const savedGrad = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
    return s.pets?.[0]?.look?.colors?.body ?? null;
  });
  report('P41-5', '渐变涂色保存', !(savedGrad && savedGrad.f === '#ff0000' && savedGrad.t === '#0000ff'), JSON.stringify(savedGrad));

  // T6 AI 按钮态：未配置 AI 时禁用
  const aiDisabled = await page.locator('.ai-btn').isDisabled();
  report('P41-6', '未配置 AI 时 AI 按钮禁用', !aiDisabled);

  // T7 清除全部涂色（confirm 已自动 accept）
  await page.locator('.paint-foot button', { hasText: '清除全部涂色' }).click();
  await page.waitForTimeout(400);
  const afterClear = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
    return s.pets?.[0]?.look?.colors ?? 'gone';
  });
  report('P41-7', '清除全部涂色落盘', afterClear !== 'gone' && afterClear !== null, JSON.stringify(afterClear));

  // T8 关闭详情无报错
  await page.locator('.detail-close').click();
  await page.waitForTimeout(300);

  // T9 分享链路验证：dist 产物经 minify（原名会被改），检查 colors 白名单特征——
  // sharePet 校验里 colors 分支生成的 JSON 色值正则串（严格 6 位 hex）必然保留
  let found = false;
  try {
    const fs = await import('node:fs');
    for (const f of fs.readdirSync(join(root, 'assets'))) {
      if (f.startsWith('app-') && f.endsWith('.js')) {
        const src = fs.readFileSync(join(root, 'assets', f), 'utf8');
        if (/colors/.test(src) && /\^\#\[0-9a-fA-F\]\{6\}/.test(src)) found = true;
      }
    }
  } catch {}
  report('P41-9', '分享链路含 colors 校验（构建产物特征）', !found);

  if (errors.length) console.log('PAGE-ERRORS ❌', errors.slice(0, 5));
  else console.log('no page errors ✅');
} finally {
  await browser.close();
  server.close();
}
