// 深度测试 30（FIT 系列，2026-09-10）：Pet3D 自适应取景——高个宠物完整入镜
// 背景：吞噬预览/详情页的 3D 视口对 bipedal/进化 phase2 宠物裁头（包围盒 y≈2.5，
// 固定相机可视上限 1.52）。Pet3D 现按包围盒自适应调相机（中心对齐+距离伸缩）。
// FIT-1 高个宠（bipedal phase2）canvas 顶/底带均有模型像素（不被上下裁切）
// FIT-2 矮胖宠（mochi phase0）同样完整（自适应不引入回归）
// FIT-3 多骨架像素覆盖 sanity（quadruped/serpent/aquatic phase2）
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
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/funny-pets/app/`;

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}`, types: ['火'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火花', power: 45, type: '火' }],
  look: { body: 'round', ears: 'long', tail: 'fluff', pattern: 'none', palette: 1, accessory: 'horn', eyes: 'sparkle' },
  lore: '测试。', caughtAt: 'meadow', caughtMap: 'meadow', level: 46, exp: 5000, phase: 2, ...over,
});

// 详情页打开指定宠并读 canvas 像素带
async function canvasBands(petOverride) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [mkPet(1, 999)], nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPet.toString());
  if (petOverride) {
    await page.evaluate(o => {
      const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
      Object.assign(raw.pets[0], o);
      localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
    }, petOverride);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '图鉴' }).click();
  await page.waitForTimeout(600);
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 3000 });
  await page.waitForTimeout(1600); // 等 raf 渲染若干帧
  const r = await page.evaluate(() => {
    const cv = document.querySelector('.detail-sprite canvas');
    if (!cv) return null;
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const rowHas = (y) => {
      for (let x = 0; x < cv.width; x++) if (img[(y * cv.width + x) * 4 + 3] > 10) return true;
      return false;
    };
    // 最上/最下有模型像素的行（0-indexed → 百分比）
    let topRow = -1, botRow = -1;
    for (let y = 0; y < cv.height && topRow < 0; y++) if (rowHas(y)) topRow = y;
    for (let y = cv.height - 1; y >= 0 && botRow < 0; y--) if (rowHas(y)) botRow = y;
    if (topRow < 0) return null;
    return {
      topPct: +(topRow / cv.height * 100).toFixed(1),
      botPct: +(botRow / cv.height * 100).toFixed(1),
    };
  });
  await page.locator('.detail-close').click().catch(() => {});
  return r;
}

// 判定标准（2026-09-10 校准）：
// - 顶边 ≥1.2%：头顶被裁的信号是 topPct≈0（第一行就有满宽像素——头顶顶出画布）
// - 底边 ≤99.6%：halo 光环前弧在透视上天然贴底（~99.3% 恒定），属特效元素非本体被裁
// - 修复前基线：bipedal/p2 顶边=0%（王冠+头顶整段被视锥裁掉）
const fits = (r) => r && r.topPct >= 1.2 && r.botPct <= 99.6 && r.botPct > r.topPct;

// FIT-1：高个 bipedal phase2（此前头顶被裁 1.0 单位）
const tall = await canvasBands(null); // mkPet 默认即 bipedal phase2
report('FIT-1', '高个宠(bipedal/p2)完整入镜', !fits(tall),
  tall ? `模型像素行 ${tall.topPct}%~${tall.botPct}%` : 'canvas 未找到');

// FIT-2：矮胖 mochi phase0（自适应不裁矮个/不空放大）
const short = await canvasBands({ bodyType: 'mochi', phase: 0 });
report('FIT-2', '矮胖宠(mochi/p0)完整入镜', !fits(short),
  short ? `模型像素行 ${short.topPct}%~${short.botPct}%` : 'canvas 未找到');

// FIT-3：其余骨架 phase2 sanity
for (const bt of ['quadruped', 'serpent', 'aquatic', 'avian']) {
  const r = await canvasBands({ bodyType: bt });
  report(`FIT-3(${bt})`, `${bt}/p2 完整入镜`, !fits(r),
    r ? `模型像素行 ${r.topPct}%~${r.botPct}%` : 'canvas 未找到');
}

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 30 完成 ====');
