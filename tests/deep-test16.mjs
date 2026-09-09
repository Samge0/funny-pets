// 深度测试 16（P 系列）：吞噬实时预览 / 进化炫酷度 / 预览属性色一致
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
await new Promise(r => server.listen(4216, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4216/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['火'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火星弹', power: 45, type: '火' }, { name: '烈焰冲撞', power: 70, type: '火' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'volcano', caughtMap: 'volcano', level: 46, exp: 100, phase: 2, ...over,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// ============ P3: 进化炫酷度（引擎级：phase 0/1/2 视觉差异 + 复杂度递增） ============
const snapUrl = await page.evaluate(async () => {
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base2 = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return base2 + '/snapshot-' + m[1] + '.js';
});
const evo = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const out = {};
  for (const ph of [0, 1, 2]) {
    const pet = {
      seed: 888, name: 't', types: ['火'], phase: ph, level: 5, bodyType: 'bipedal', moves: [],
      look: { body: 'round', ears: 'pointy', tail: 'fluff', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot' },
    };
    out[ph] = await renderSnapshotOutlined(pet, 128);
  }
  return out;
}, snapUrl);
const allDiff = evo[0] !== evo[1] && evo[1] !== evo[2] && evo[0] !== evo[2];
const growing = evo[0].length < evo[1].length && evo[1].length < evo[2].length;
report('P3a', '进化视觉差异（phase 0/1/2 三态互异）', !allDiff, `bytes: 0=${evo[0].length} 1=${evo[1].length} 2=${evo[2].length}`);
report('P3b', '进化视觉复杂度递增（字节单调增长：光环+光点+王冠）', !growing, `0=${evo[0].length} < 1=${evo[1].length} < 2=${evo[2].length}`);
for (const [ph, url] of Object.entries(evo)) {
  writeFileSync(`test-results/evo-phase${ph}.png`, Buffer.from(url.split(',')[1], 'base64'));
}

// ============ P1: 吞噬弹窗实时预览联动 ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: '', model: '', apiKey: '', enabled: false }));
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 999)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });
// 确保在地图视图（默认 map，但防御性等待卡片出现）
await page.locator('.map-card').first().waitFor({ state: 'visible', timeout: 8000 });
let sawDevour = false;
for (let round = 0; round < 8 && !sawDevour; round++) {
  // 等结算链走完（cele → 可能紧跟 devour 弹窗有动画延迟）
  await page.waitForTimeout(800);
  for (let w = 0; w < 6; w++) {
    if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').click().catch(() => {}); await page.waitForTimeout(300); continue; }
    if (await page.locator('.devour-card').count()) { sawDevour = true; break; }
    break;
  }
  if (sawDevour) break;
  // 若吞噬遮罩在动画中挡点击，先等它出现或消失
  await page.waitForTimeout(300);
  if (await page.locator('.devour-card').count()) { sawDevour = true; break; }
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('.cele-btn').click().catch(() => {});
  await page.waitForTimeout(400);
}
if (sawDevour) {
  await page.waitForTimeout(700);
  const before = await page.locator('.live-stage').screenshot();
  const hint1 = await page.locator('.live-hint').textContent();
  // 取消勾选第一个部件 → 预览应变化（造型退回）
  const firstPartCb = page.locator('.devour-section .devour-item input[type=checkbox]').first();
  const partsCount = await page.locator('.devour-section .devour-item input[type=checkbox]').count();
  if (partsCount > 0) {
    await firstPartCb.uncheck();
    await page.waitForTimeout(600);
    const after = await page.locator('.live-stage').screenshot();
    const hint2 = await page.locator('.live-hint').textContent();
    const changed = before.length !== after.length || !before.equals(after);
    report('P1a', '实时预览：取消勾选部件 → 预览造型即时变化', !changed, `parts=${partsCount}, hint: "${hint1.trim().slice(0, 30)}" → "${hint2.trim().slice(0, 30)}"`);
    await page.screenshot({ path: 'test-results/p-devour-live.png' });
  } else {
    report('P1a', '实时预览（本场无部件候选）', false, '仅技能候选，跳过部件联动');
  }
  await page.getByRole('button', { name: /跳过/ }).click();
} else {
  report('P1', '吞噬弹窗出现（8 场内）', true, '未触发（概率性）');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 16 完成 ====');
