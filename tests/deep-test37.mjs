// 深度测试 37（L 轮·语言偏好 2026-09-10）：设置页语言下拉 + LLM 输出语言跟随
// L1 设置页存在语言下拉；默认选中浏览器语言（context locale=en-US → 默认 English）
// L2 切换语言后持久化（localStorage funny-pets-lang-v1），刷新后保持
// L3 精灵生成 prompt 带语言指令（切到日本語后，mock LLM 捕获的 messages 含「日本語」）
// L4 灵魂聊天 prompt 带语言指令
// L5 分享文案 prompt 带语言指令
// L6 损坏的语言存储值回退安全（不崩、回落浏览器/中文）
// L7 长英文名不再被截到 6 字符（parseLlmPet 放宽到 24，兼容非 CJK 语言起名）
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
const base = `http://127.0.0.1:${server.address().port}/funny-pets/app/`;

const browser = await chromium.launch({});
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1180, height: 900 }, locale: 'en-US' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// ============ L1: 语言下拉存在 + 默认浏览器语言（en-US → en） ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [mkPet(1, 5)], nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPetSrc);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /设置/ }).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  const sel = page.locator('.settings-view select.lang-select');
  const cnt = await sel.count();
  report('L1a', '设置页存在语言下拉', cnt === 0, `select=${cnt}`);
  if (cnt) {
    const val = await sel.inputValue();
    report('L1b', '默认选中浏览器语言（en-US→en）', val !== 'en', `selected=${val}`);
    const opts = await sel.locator('option').count();
    report('L1c', '语言选项覆盖面（≥15 种）', opts < 15, `options=${opts}`);
  }
}

// ============ L2: 切换持久化 ============
{
  const sel = page.locator('.settings-view select.lang-select');
  await sel.selectOption('ja');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => localStorage.getItem('funny-pets-lang-v1'));
  report('L2a', '切换后写入 localStorage', stored !== 'ja', `stored=${stored}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /设置/ }).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  const val2 = await page.locator('.settings-view select.lang-select').inputValue();
  report('L2b', '刷新后保持选择', val2 !== 'ja', `selected=${val2}`);
}

// ============ L3/L4/L5: LLM prompt 带语言指令（mock 路由捕获） ============
{
  const captured = [];
  await page.route('**/chat/completions', async route => {
    const body = route.request().postDataJSON();
    captured.push(body.messages.map(m => m.content).join('\n---\n'));
    // 按调用场景返回：精灵生成（要求 JSON）vs 聊天/文案（普通文本）
    const isGen = /name/.test(body.messages.map(m => m.content).join('')) && /JSON/.test(body.messages.map(m => m.content).join(''));
    if (isGen) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '{"name":"Sir Fluffington the Third","types":["水"],"bodyType":"quadruped","ears":"round","tail":"fluff","pattern":"spots","accessory":"none","eyes":"sparkle","lore":"A bubbly aquatic critter that hums while floating."}' } }] }),
      });
    } else {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: 'ぷかぷか…ようじょうごなの！' } }] }),
      });
    }
  });
  await page.evaluate(() => {
    localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'https://mock.local/v1', model: 'mock-1', apiKey: '', enabled: true }));
  });
  await page.reload({ waitUntil: 'networkidle' });

  // L3: 精灵生成（点地图遭遇）
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 15000 });
  const genPrompt = captured[0] ?? '';
  report('L3', '精灵生成 prompt 含「日本語」语言指令', !genPrompt.includes('日本語'),
    `captured=${captured.length}, snippet=${JSON.stringify(genPrompt.slice(0, 60))}`);
  // L7: 长英文名不被截断
  const wildName = (await page.locator('.wild-card h2').textContent())?.trim() ?? '';
  report('L7', '长英文名不被截到 6 字符（≥19 字符保留）', wildName.length < 19, `name="${wildName}" (len=${wildName.length})`);

  // L4: 灵魂聊天
  await page.getByRole('button', { name: /图鉴/ }).click();
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const input = page.locator('.chat-input input');
  await input.fill('你好呀');
  await page.locator('.chat-input button[type=submit]').click();
  await page.waitForTimeout(1200);
  const chatPrompt = captured[1] ?? '';
  report('L4', '灵魂聊天 prompt 含语言指令', !chatPrompt.includes('日本語'), `captured=${captured.length}`);

  // L5: 分享文案（📣 分享按钮走 LLM）
  await page.locator('.detail-share').click();
  await page.waitForTimeout(1500);
  const sharePrompt = captured[2] ?? '';
  report('L5', '分享文案 prompt 含语言指令', !sharePrompt.includes('日本語'), `captured=${captured.length}`);
  await page.unroute('**/chat/completions');
}

// ============ L6: 损坏的语言值回退安全 ============
{
  await page.evaluate(() => localStorage.setItem('funny-pets-lang-v1', '%%%garbage%%%'));
  await page.reload({ waitUntil: 'networkidle' });
  const ok = await page.locator('.shell').count();
  const val = await page.evaluate(() => localStorage.getItem('funny-pets-lang-v1'));
  report('L6', '损坏语言值不崩并回落安全值', errors.length > 0 || !ok, `appAlive=${!!ok}, storedNow=${val}, errs=${errors.length}`);
  errors.length = 0;
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 37 完成 ====');
