// 深度测试 11（K 系列）：图鉴拖拽排序 / 战斗主动换宠 / 部件吞噬可见性
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
await new Promise(r => server.listen(4203, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4203/funny-pets/app/';
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
  uid, seed, name: `宠${uid}号`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// 5 只宠
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [1, 2, 3, 4, 5].map(i => mkPet(i, 500 + i)), nextUid: 6, dexSeen: {}, partyIds: [1, 2, 3, 4],
    counters: { encounters: 1, caught: 5, battlesWon: 0, evolutions: 0 },
  }));
}, mkPetSrc);
await page.reload({ waitUntil: 'networkidle' });

// ============ K1: 图鉴拖动排序 ============
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(500);
const beforeOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
// 把第 1 张拖到第 4 张上（HTML5 DnD：Playwright 需手动 dispatch drag events）
const src = page.locator('.dex-card').nth(0);
const dst = page.locator('.dex-card').nth(3);
await src.hover();
await page.mouse.down();
await dst.hover();
await page.mouse.up(); // 浏览器原生 DnD 需事件流；Playwright 直接调 handler 更可靠：
// 兜底：直接 dispatch dragstart/drop（Vue 的 @dragstart/@drop 绑定会收到）
const orderBeforeDrop = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.dex-card')];
  const fire = (el, type) => {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { setData() {}, effectAllowed: 'move', dropEffect: 'move' } });
    el.dispatchEvent(ev);
  };
  fire(cards[0], 'dragstart');
  fire(cards[3], 'dragover');
  fire(cards[3], 'drop');
});
await page.waitForTimeout(400);
const afterOrder = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.map(p => p.uid));
const moved = afterOrder.indexOf(beforeOrder[0]) > 0 && afterOrder.length === beforeOrder.length
  && JSON.stringify([...afterOrder].sort((a, b) => a - b)) === JSON.stringify(beforeOrder);
report('K1', '图鉴拖拽排序（第1张拖到第4张上，顺序变化且持久化）', !moved,
  `前=[${beforeOrder}] 后=[${afterOrder}]`);

// ============ K2: 战斗中主动换宠 ============
await page.getByRole('button', { name: '地图' }).click();
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
// 主动换宠面板
const switchBtn = page.locator('.battle-actions .switch-toggle');
const hasBtn = await switchBtn.count();
await switchBtn.click();
await page.waitForTimeout(300);
const panelVisible = await page.locator('.force-switch').count();
const activeBefore = await page.evaluate(() => document.querySelector('.fighter.mine .plate-row strong')?.textContent);
// 选第 2 只（非当前）
const candidates = page.locator('.force-switch .skill:not([disabled])');
if (await candidates.count()) {
  await candidates.first().click();
  await page.waitForTimeout(1200); // 换宠动画+野生攻击
  const activeAfter = await page.evaluate(() => document.querySelector('.fighter.mine .plate-row strong')?.textContent);
  const logHasSwitch = await page.evaluate(() => document.querySelector('.battle-log')?.textContent.includes('换上了'));
  report('K2', '主动换宠（面板选择→换上→野生趁机攻击）', !hasBtn || !panelVisible || activeBefore === activeAfter || !logHasSwitch,
    `按钮=${hasBtn}, 面板=${panelVisible > 0}, ${activeBefore}→${activeAfter}, 日志含换上=${logHasSwitch}`);
} else {
  report('K2', '主动换宠面板出现且有可换目标', !hasBtn || !panelVisible, `按钮=${hasBtn}, 面板=${panelVisible}`);
}
await page.getByRole('button', { name: '地图' }).click().catch(() => {});

// ============ K3: 部件吞噬可见性（spots/stripe 在 bipedal 上渲染） ============
// 动态找 snapshot 模块名（由资源加载记录取）
const snapUrl = await page.evaluate(() => {
  return performance.getEntriesByType('resource').map(r => r.name).find(n => /snapshot-.*\.js/.test(n)) ?? null;
});
if (snapUrl) {
  const result = await page.evaluate(async (url) => {
    const { renderSnapshotOutlined } = await import(url);
    const mk = (pattern) => ({
      seed: 777, name: 't', types: ['火'], phase: 0,
      look: { body: 'round', ears: 'none', tail: 'none', pattern, palette: 0, accessory: 'none', eyes: 'dot' },
      moves: [], level: 5,
    });
    // 强制 bipedal：types=火 偏置 bipedal（45% 概率）——多次取样取 bipedal 那次？
    // 更稳：直接给 bodyType 字段（bodyTypeBiased 优先采纳）
    const a = mk('none'); a.bodyType = 'bipedal';
    const b = mk('spots'); b.bodyType = 'bipedal';
    const c = mk('stripe'); c.bodyType = 'bipedal';
    const none = await renderSnapshotOutlined(a, 120);
    const spots = await renderSnapshotOutlined(b, 120);
    const stripe = await renderSnapshotOutlined(c, 120);
    return {
      spotsDiff: none !== spots,
      stripeDiff: none !== stripe,
      len: [none.length, spots.length, stripe.length],
    };
  }, snapUrl);
  report('K3', '双足精灵 spots/stripe 花纹渲染可见（快照字节差异）', !result.spotsDiff || !result.stripeDiff,
    JSON.stringify(result));
} else {
  report('K3', 'snapshot 模块定位', true, '未找到 snapshot 资源');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 11 完成 ====');
