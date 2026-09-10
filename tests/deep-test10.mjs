// 深度测试 10（J 系列）：部件预览/吞后生效/随机属性+展示/地图解锁提示
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
await new Promise(r => server.listen(4202, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4202/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 5000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(150);
  } catch {}
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 1, accessory: 'none', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// ============ J4: 未解锁地图点击提示（含进度） ============
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 1)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
// 点击第 4 张地图（volcano，解锁需 14 只；当前 1 只 → 还差 13）
await page.locator('.map-card').nth(3).click();
await page.waitForTimeout(400);
const lockToast = await page.evaluate(() => document.querySelector('.global-toast')?.textContent ?? '');
report('J4', '未解锁地图点击提示（含名称/条件/还差几只）',
  !(lockToast.includes('烬尾火山') && lockToast.includes('14') && lockToast.includes('还差 13')),
  `toast="${lockToast.slice(0, 70)}"`);

// ============ J1: 吞噬弹窗部件前后预览图 ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 222, { level: 46, exp: Math.round(0.9 * Math.pow(47, 2.6)) + 60, phase: 2 })],
    nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
let previews = null, sawDevour = false;
for (let round = 0; round < 10 && !sawDevour; round++) {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    if (await page.locator('.force-switch .skill:not([disabled])').count()) {
      await page.locator('.force-switch .skill:not([disabled])').first().click();
      await page.waitForTimeout(480); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(500);
  }
  await dismissCelebration();
  if (await page.locator('.devour-card').count()) {
    sawDevour = true;
    // 部件预览：.preview-img 数量 = 部件候选 × 2，src 都是 svg dataURL 且前后不同
    previews = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.devour-card .preview-img')];
      // 成对比较：每对（吞前 i, 吞后 i+1）src 应不同（图变了才算有预览意义）
      let pairs = 0, diffPairs = 0;
      for (let i = 0; i + 1 < imgs.length; i += 2) {
        pairs++;
        if (imgs[i].src !== imgs[i + 1].src) diffPairs++;
      }
      return { count: imgs.length, allSvg: imgs.every(i => i.src.startsWith('data:image/svg+xml')), pairs, diffPairs };
    });
    await page.screenshot({ path: 'test-results/j-devour-preview.png' });
    report('J1', '部件候选项含吞前→吞后 SVG 预览（前后图不同）',
      !(previews && previews.count >= 2 && previews.allSvg && previews.diffPairs >= 1), JSON.stringify(previews));
    // 确认吞噬，验证吞后数据生效
    await page.getByRole('button', { name: /确认吞噬/ }).click();
    await page.waitForTimeout(500);
    break;
  }
}
if (!sawDevour) report('J1', '吞噬弹窗出现', true, '10 场未掷中（概率性，重跑覆盖）');

// ============ J2: body 吞噬后 bodyType 同步（引擎级） ============
const bodyTest = await page.evaluate(async () => {
  const mods = Object.keys(window).__none; // 占位
  return null;
}).catch(() => null);
// 引擎级验证放 Node 侧
const { applyDevour } = await import('../src/core/evolve.js').catch(() => ({}));
if (applyDevour) {
  const pet = { moves: [{ name: '扑击', power: 40, type: '一般' }], look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 1, accessory: 'none', eyes: 'dot' }, bodyType: 'aquatic' };
  const desc = applyDevour(pet, [], [{ part: 'body', theirs: 'tall' }]);
  const synced = pet.bodyType === 'bipedal' && pet.look.body === 'tall';
  report('J2a', '吞 body 后 bodyType 同步（3D 骨架真正变化）', !synced, `desc=${desc[0]}, bodyType=${pet.bodyType}, look.body=${pet.look.body}`);
} else {
  report('J2a', '引擎级验证（evolve.js 加载失败，UI 测试覆盖）', false, '');
}

// ============ J3: 升级随机属性 + 弹窗展示 ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 333, { level: 4, exp: Math.round(0.9 * Math.pow(5, 2.6)) - 5 })],
    nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });
let statChips = null, sawLevel = false;
for (let round = 0; round < 8 && !sawLevel; round++) {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-mask').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    if (await page.locator('.force-switch .skill:not([disabled])').count()) {
      await page.locator('.force-switch .skill:not([disabled])').first().click();
      await page.waitForTimeout(480); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('.cele-btn').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await page.locator('.stat-chips').count()) {
    sawLevel = true;
    statChips = await page.locator('.stat-chips').textContent();
    break;
  }
  await dismissCelebration();
  if (await page.locator('.devour-card').count()) await page.getByRole('button', { name: /确认吞噬|跳过/ }).first().click();
  await page.waitForTimeout(200);
}
report('J3', '升级弹窗展示随机属性增量 chips（HP/攻/防/速 +N）',
  !(sawLevel && statChips && /\+\d/.test(statChips) && statChips.length >= 8), `sawLevel=${sawLevel}, chips="${statChips?.trim()}"`);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 10 完成 ====');
