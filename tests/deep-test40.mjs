// 深度测试 40（T 轮·战斗台词语言稳定性 2026-09-10）：
// T1 EN 模式下我方台词 prompt：scene 是英文（不再硬编码中文）
// T2 EN 模式下敌方（野生临时灵魂）台词 prompt：scene 英文 + 末位语言提醒
// T3 台词 prompt 末位带「只输出English」钉子
// T4 localTaunt 本地兜底：EN 模式输出英文台词（LLM 失败降级路径）
// T5 zh 模式 localTaunt 仍是中文
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
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `宠${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 10, atk: 10, def: 10, spd: 12 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '轻快', hp: 1.0, atk: 1.0, def: 1.0, spd: 1.08 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 8, exp: 500, phase: 0, ...over,
});

// 切英文 + 存档 + LLM 配置
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.clear();
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(1, 11)], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'https://mock.local/v1', model: 'mock-1', apiKey: '', enabled: true }));
  localStorage.setItem('funny-pets-lang-v1', 'en');
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });

// mock LLM：台词返回英文，其他场景返回通用
const tauntCalls = [];
await page.route('**/chat/completions', async route => {
  const body = route.request().postDataJSON();
  const all = body.messages.map(m => m.content).join('\n---\n');
  const isTaunt = all.includes('%') && /one line|心声/.test(all);
  tauntCalls.push({ messages: body.messages, all });
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: 'Take that! My bubbles never miss!' } }] }),
  });
});

// 进战斗
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /Battle/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
// 打几回合让双方都出招（台词触发）
for (let i = 0; i < 6; i++) {
  if (await page.locator('.cele-btn').count()) break;
  if ((await page.locator('.battle-view').count()) === 0) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(500); continue;
  }
  const btn = page.locator('.battle-actions .skill:not([disabled])');
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(650);
}

// T1/T2/T3: 检查捕获的台词 prompt
{
  const tauntPrompts = tauntCalls.filter(c => c.messages.some(m => /battle thoughts|心声|invaded your territory/.test(m.content)));
  report('T0', '战斗台词 LLM 调用发生', tauntPrompts.length === 0, `tauntCalls=${tauntPrompts.length}`);
  if (tauntPrompts.length) {
    // scene 是英文（user 消息含 battle thoughts / invaded your territory，无中文场景句）
    const sceneEn = tauntPrompts.filter(c => c.messages.some(m => /battle thoughts|invaded your territory/.test(m.content)));
    report('T1', '我方+敌方台词 scene 均为英文', sceneEn.length < tauntPrompts.length, `en=${sceneEn.length}/${tauntPrompts.length}`);
    // 敌方（wild）通道存在
    const wildChannel = tauntPrompts.filter(c => c.messages.some(m => /invaded your territory/.test(m.content)));
    report('T2', '敌方野生台词通道也走英文 scene', wildChannel.length === 0, `wildCalls=${wildChannel.length}`);
    // 末位语言钉子
    const pinned = tauntPrompts.every(c => /只输出English台词/.test(c.messages[c.messages.length - 1].content) || /only output English/i.test(c.messages[c.messages.length - 1].content));
    report('T3', '台词 prompt 末位有语言提醒（only output English）', !pinned, `pinned=${pinned}/${tauntPrompts.length}`);
  }
}
await page.unroute('**/chat/completions');
// 清场（战斗可能还在打，直接走完）
for (let i = 0; i < 40; i++) {
  if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').dispatchEvent('click'); await page.waitForTimeout(300); continue; }
  if ((await page.locator('.battle-view').count()) === 0) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(450); continue;
  }
  const btn = page.locator('.battle-actions .skill:not([disabled])');
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(500);
}
if (await page.locator('.devour-mask').count()) { await page.locator('.devour-actions .ghost').click(); await page.waitForTimeout(300); }

// T4: EN 模式 localTaunt 兜底（直接断言 llm 模块行为——通过窗口钩子或页面内调用）
{
  const local = await page.evaluate(async () => {
    // 通过动态 import 拿构建后的模块（vite 打包后模块 URL 可从性能条目找）——更稳：直接触发一次无 LLM 战斗
    return null;
  });
  // 改法：禁用 LLM 再打一场，观察台词气泡文本是否英文
  await page.evaluate(() => {
    localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: '', model: '', apiKey: '', enabled: false }));
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1,
      pets: [{ uid: 1, seed: 11, name: '宠1', types: ['水'], rarity: 'common', iv: { hp: 10, atk: 10, def: 10, spd: 12 }, base: { hp: 60, atk: 55, def: 55, spd: 55 }, nature: { name: '轻快', hp: 1, atk: 1, def: 1, spd: 1.08 }, moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }], look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: 1, accessory: 'none', eyes: 'round' }, lore: 'x', caughtAt: 'shore', caughtMap: 'shore', level: 8, exp: 500, phase: 0 }],
      nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /Battle/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  let sawEnTaunt = false, sawZhTaunt = false;
  for (let i = 0; i < 8; i++) {
    if ((await page.locator('.battle-view').count()) === 0) break;
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (!(await btn.count())) break;
    await btn.first().click();
    await page.waitForTimeout(700);
    // 只看真正的台词气泡文本（.taunt-text），不抓容器
    const bubbles = await page.evaluate(() => [...document.querySelectorAll('.taunt-text')].map(x => x.textContent.trim()));
    for (const b of bubbles) {
      if (!b) continue;
      if (/[\u4e00-\u9fff]/.test(b)) sawZhTaunt = true;
      if (/[A-Za-z]{3,}/.test(b)) sawEnTaunt = true;
    }
  }
  report('T4', 'EN 模式本地兜底台词是英文（.taunt-text 无中文）', sawZhTaunt || !sawEnTaunt, `en=${sawEnTaunt}, zhBubble=${sawZhTaunt}`);
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 40 完成 ====');
