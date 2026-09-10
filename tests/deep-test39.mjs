// 深度测试 39（R 轮·图鉴内容语言迁移 2026-09-10）：
// R1 英文模式下图鉴卡「点击查看详情/聊天」翻译正确（本轮 key 修复）
// R2 详情页「🌐 重译」按钮存在（LLM 已启用时）
// R3 重译调用 LLM 且写回存档：名字/图鉴变成目标语言（mock LLM）
// R4 重译失败 toast 提示不崩
// R5 无 LLM 时按钮隐藏
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
const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `幻叶灵皇`, types: ['草'], rarity: 'epic',
  iv: { hp: 12, atk: 12, def: 12, spd: 12 }, base: { hp: 70, atk: 65, def: 65, spd: 65 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '藤鞭', power: 45, type: '草' }, { name: '光合炮', power: 70, type: '草' }, { name: '寄生种子', power: null, effect: 'heal', type: '草' }],
  look: { body: 'tall', ears: 'long', tail: 'fluff', pattern: 'stripe', palette: 5, accessory: 'gem', eyes: 'sparkle' },
  lore: '进化后的幻叶灵。喜欢缠绕在酸雨树的枝干上，沿着电路网络在夜晚旅行。', caughtAt: 'forest', caughtMap: 'forest', level: 38, exp: 50000, phase: 2, ...over,
});

// 中文存档（模拟用户的历史精灵）
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(petSrc => {
  const mkPet = eval('(' + petSrc + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 77)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());

// R5 先验证：无 LLM 时重译按钮隐藏
await page.reload({ waitUntil: 'networkidle' });
{
  await page.locator('nav.tabs button').nth(2).click();
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const noLlmBtn = await page.locator('.detail-retranslate').count();
  report('R5', '无 LLM 时重译按钮隐藏', noLlmBtn > 0, `btn=${noLlmBtn}`);
  await page.locator('.detail-close').click();
  await page.waitForTimeout(300);
}

// 配置 mock LLM + 切英文
const captured = [];
await page.route('**/chat/completions', async route => {
  const body = route.request().postDataJSON();
  captured.push(body.messages.map(m => m.content).join('\n'));
  const isRetrans = /翻译成|translate/i.test(body.messages.map(m => m.content).join('')) && /"name"/.test(body.messages.map(m => m.content).join(''));
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: isRetrans ? '{"name":"Verdant Sovereign","lore":"An evolved spirit that coils around acid-rain trees and travels the circuit network by night."}' : 'ok' } }] }),
  });
});
await page.evaluate(() => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'https://mock.local/v1', model: 'mock-1', apiKey: '', enabled: true }));
  localStorage.setItem('funny-pets-lang-v1', 'en');
});
await page.reload({ waitUntil: 'networkidle' });

// R1: 图鉴卡 hint 英文（先进图鉴页）
await page.locator('nav.tabs button').nth(2).click();
await page.waitForTimeout(500);
{
  const hint = ((await page.locator('.dex-card .lv').first().textContent()) ?? '').trim();
  report('R1', '图鉴卡 hint 英文（Tap for details & chat）', !/Tap for details/.test(hint), `"${hint}"`);
}

// R2/R3: 重译按钮 + 全流程
{
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const btn = await page.locator('.detail-retranslate').count();
  report('R2', 'LLM 启用时重译按钮存在', btn === 0, `btn=${btn}`);
  if (btn) {
    await page.locator('.detail-retranslate').click();
    await page.waitForTimeout(1000);
    // 名字已更新（详情页标题）
    const h2 = ((await page.locator('.detail-card h2').textContent()) ?? '').trim();
    report('R3a', '重译后详情页名字英文', !/Verdant/.test(h2), `"${h2}"`);
    // 存档也更新
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));
    const p0 = stored.pets[0];
    report('R3b', '重译写回存档（name+lore）', p0.name !== 'Verdant Sovereign' || !/acid-rain/.test(p0.lore ?? ''), `name=${p0.name}, lore=${(p0.lore ?? '').slice(0, 30)}`);
    // LLM 被调用且带英文指令
    const called = captured.some(c => /English/.test(c) && /幻叶灵皇/.test(c));
    report('R3c', '重译 prompt 含原中文名+English 指令', !called, `calls=${captured.length}`);
  }
}

// R4: 失败路径（mock 返回垃圾）
{
  await page.unroute('**/chat/completions');
  await page.route('**/chat/completions', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: 'garbage not json' } }] }),
  }));
  await page.locator('.detail-close').click();
  await page.waitForTimeout(300);
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].name);
  await page.locator('.detail-retranslate').click();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets[0].name);
  const toast = await page.evaluate(() => document.body.textContent.includes('Retranslation failed') || document.body.textContent.includes('重译失败'));
  report('R4', '重译失败 toast 提示且存档不变', !toast || before !== after, `toast=${toast}, name stable=${before === after}`);
}

// R6: 重译按钮文案跟随语言 + 操作条不重叠（flex 布局，本轮修复）
{
  // R4 打开的详情可能还开着——先关掉再重开，避免遮挡
  if (await page.locator('.detail-card').count()) {
    await page.locator('.detail-close').click();
    await page.waitForTimeout(300);
  }
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const rbtn = await page.locator('.detail-retranslate').textContent();
  report('R6a', '重译按钮文案英文（Retranslate）', !/Retranslate/.test(rbtn ?? ''), `"${(rbtn ?? '').trim()}"`);
  const geo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.detail-actions-bar button')];
    const rects = btns.map(b => { const x = b.getBoundingClientRect(); return { x: x.x, r: x.x + x.width }; });
    let overlap = false;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (rects[i].x < rects[j].r - 1 && rects[j].x < rects[i].r - 1) overlap = true;
    }
    const bar = document.querySelector('.detail-actions-bar');
    return { overlap, overflow: bar.getBoundingClientRect().width > document.querySelector('.detail-card').clientWidth };
  });
  report('R6b', 'EN 操作条按钮无重叠不溢出', geo.overlap || geo.overflow, JSON.stringify(geo));
  // 切回中文验证按钮变中文
  await page.locator('.detail-close').click();
  await page.waitForTimeout(250);
  await page.locator('nav.tabs button').nth(3).click(); // 设置
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  await page.locator('.lang-select').selectOption('zh');
  await page.waitForTimeout(400);
  await page.locator('nav.tabs button').nth(2).click();
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const rbtnZh = await page.locator('.detail-retranslate').textContent();
  report('R6c', '切回中文按钮文案中文（重译）', !/重译/.test(rbtnZh ?? ''), `"${(rbtnZh ?? '').trim()}"`);
  const geoZh = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.detail-actions-bar button')];
    const rects = btns.map(b => { const x = b.getBoundingClientRect(); return { x: x.x, r: x.x + x.width }; });
    let overlap = false;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (rects[i].x < rects[j].r - 1 && rects[j].x < rects[i].r - 1) overlap = true;
    }
    return { overlap };
  });
  report('R6d', '中文操作条无重叠', geoZh.overlap, JSON.stringify(geoZh));
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 39 完成 ====');
