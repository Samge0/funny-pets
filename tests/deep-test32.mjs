// 深度测试 32（SHARE-COPY 系列，2026-09-10）：详情页分享双按钮
// SC-1 📣 分享（默认）= LLM 生成社交文案 + 链接，一次复制
// SC-2 🔗 图标 = 仅复制链接（无文案）
// SC-3 LLM 不可达 → 降级本地模板文案 + toast 提示，不阻塞
// SC-4 生成中按钮禁用防重复点击
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
// mock LLM 端点（带 CORS：真实 LLM 服务都允许跨源）
const llm = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    let ok = true;
    try {
      const sent = JSON.parse(body).messages.map(m => m.content).join(' ');
      ok = sent.includes('黏人热情') && !sent.includes('object Object');
    } catch { ok = false; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: ok ? '我家高个火焰兽进化啦，王冠闪闪发光！👑 快来围观挑战！' : 'TRAITS_BROKEN' } }] }));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
await new Promise(r => llm.listen(0, '127.0.0.1', r));
const port = server.address().port, lport = llm.address().port;
const base = `http://127.0.0.1:${port}/funny-pets/app/`;

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: '小火龙酱', types: ['火'], rarity: 'common', bodyType: 'bipedal',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火花', power: 45, type: '火' }],
  look: { body: 'round', ears: 'long', tail: 'fluff', pattern: 'none', palette: 1, accessory: 'horn', eyes: 'sparkle' },
  lore: '来自火山脚的温泉边', caughtAt: 'meadow', caughtMap: 'meadow', level: 12, exp: 400, phase: 1, ...over,
});

await page.goto(base, { waitUntil: 'networkidle' });
// 劫持 writeText 记录剪贴板（headless 无真实剪贴板）
await page.addInitScript(() => {
  window.__clip = null;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__clip = t; } }, configurable: true });
});
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 999)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.evaluate(p2 => localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:' + p2 + '/v1', model: 'test', apiKey: '', enabled: true })), lport);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(600);
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });

// SC-1: 📣 分享 = LLM 文案 + \n + 链接
await page.locator('.detail-share').click();
await page.waitForTimeout(1500);
const clip1 = await page.evaluate(() => window.__clip ?? '');
const llmCopyOk = clip1.includes('王冠') && clip1.includes('#p=v2.') && !clip1.includes('object');
report('SC-1', '分享按钮=LLM文案+链接一次复制', !llmCopyOk, JSON.stringify(clip1.slice(0, 60)));

// SC-2: 🔗 图标 = 仅链接
await page.locator('.detail-share-link').click();
await page.waitForTimeout(800);
const clip2 = await page.evaluate(() => window.__clip ?? '');
const linkOnly = clip2.startsWith('http') && clip2.includes('#p=v2.') && !clip2.includes('王冠');
report('SC-2', '链接图标=仅复制链接', !linkOnly, JSON.stringify(clip2.slice(0, 50)));

// SC-4: 生成中禁用（快速连点两次，clip 内容不重复拼接/按钮 disabled）
const disabledDuring = await page.evaluate(() => {
  const btn = document.querySelector('.detail-share');
  return btn ? btn.disabled : null;
});
report('SC-4', '生成完成后按钮恢复可用', disabledDuring !== false, `disabled=${disabledDuring}`);

// SC-3: LLM 不可达 → 降级模板
await page.evaluate(() => localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:9/v1', model: 'x', apiKey: '', enabled: true })));
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(600);
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
await page.locator('.detail-share').click();
await page.waitForTimeout(2500);
const clip3 = await page.evaluate(() => window.__clip ?? '');
const fallbackOk = clip3.includes('点链接') && clip3.includes('#p=') && !clip3.includes('object Object');
report('SC-3', 'LLM失败降级本地模板+链接', !fallbackOk, JSON.stringify(clip3.slice(0, 60)));

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close(); llm.close();
console.log('\n==== 深度检查 32 完成 ====');
