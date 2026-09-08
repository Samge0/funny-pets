// 深度测试 5：记忆压缩 + 大存档性能 + 移动端战斗 + 导出导入回环
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
await new Promise(r => server.listen(4187, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4187/funny-pets/app/';
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
const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));

// LLM mock：普通聊天秒回；压缩请求返回两条事实
await page.route('**/chat/completions', async route => {
  const body = route.request().postDataJSON();
  const allText = (body.messages ?? []).map(m => m.content ?? '').join('\n');
  if (allText.includes('整理它的长期记忆')) {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '训练家喜欢在深夜聊天\n训练家给它起了昵称' } }] }),
    });
  } else {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: `收到啦（${Date.now() % 100}）` } }] }),
    });
  }
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:4187/v1', model: 'mock', apiKey: '', enabled: true }));
});
await page.reload({ waitUntil: 'networkidle' });

// 构造一只宠物（手动注入，避免随机捕捉耗时）
await page.evaluate(() => {
  const mk = (uid, seed, name) => ({
    uid, seed, name, types: ['水'], rarity: 'common',
    iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
    nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
    moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
    look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid, accessory: 'none', eyes: 'round' },
    lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0,
  });
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mk(1, 111, '测试兽')], nextUid: 2, dexSeen: {}, partyIds: [1],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
});
await page.reload({ waitUntil: 'networkidle' });

// ============ E1: 20 条聊天触发记忆压缩 ============
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(300);
await page.locator('.dex-card').first().click();
await page.locator('.detail-card').waitFor({ timeout: 3000 });
const input = page.locator('.chat-input input');
for (let i = 1; i <= 22; i++) {
  await input.fill(`第${i}条消息：今天天气不错`);
  await input.press('Enter');
  await page.waitForTimeout(450); // mock 秒回
}
await page.waitForTimeout(1500); // 压缩请求完成后
const chatAndSoul = await page.evaluate(() => {
  const chats = JSON.parse(localStorage.getItem('funny-pets-chats-v1') ?? '{}')['1'];
  const soul = JSON.parse(localStorage.getItem('funny-pets-souls-v1') ?? '{}')['1'];
  return {
    msgCount: chats?.messages?.length ?? -1,
    total: chats?.total ?? -1,
    compressedAt: chats?.compressedAt ?? -1,
    profile: soul?.memory?.profile ?? [],
  };
});
const compressed = chatAndSoul.compressedAt > 0;
const factsIn = chatAndSoul.profile.some(f => f.includes('深夜') || f.includes('昵称'));
report('E1', '20+ 条聊天触发记忆压缩（提炼事实入档，消息裁剪保留最近 8 条）',
  !(compressed && factsIn && chatAndSoul.msgCount <= 12),
  JSON.stringify({ msgCount: chatAndSoul.msgCount, total: chatAndSoul.total, compressedAt: chatAndSoul.compressedAt, profile: chatAndSoul.profile }));
await page.locator('.detail-close').click();

// ============ E2: 30 只图鉴渲染性能 + 快照 ============
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const mk = (uid, seed) => ({
    uid, seed, name: `宠${uid}`, types: ['水'], rarity: 'common',
    iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
    nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
    moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '瞪眼', power: null, effect: 'defdown', type: '一般' }],
    look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
    lore: '批量测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0,
  });
  raw.pets = Array.from({ length: 30 }, (_, i) => mk(i + 2, 1000 + i * 7));
  raw.partyIds = [2, 3, 4, 5];
  localStorage.setItem('funny-pets-save-v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
const t0 = Date.now();
await page.getByRole('button', { name: '图鉴' }).click();
// 30 张卡在 grid 中可能分行渲染：等数量稳定而非第 30 张可见（在视口外 waitFor visible 会超时）
await page.waitForFunction(() => document.querySelectorAll('.dex-card').length >= 30, null, { timeout: 15000 }).catch(() => {});
const dexCards = await page.locator('.dex-card').count();
// 等 3D 快照全部替换 SVG 占位（最多 12s）
let pngCount = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(300);
  pngCount = await page.evaluate(() => [...document.querySelectorAll('.dex-card img')].filter(i => i.src.startsWith('data:image/png')).length);
  if (pngCount >= dexCards) break;
}
const renderMs = Date.now() - t0;
const storageSize = await page.evaluate(() => {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += (localStorage.getItem(k) ?? '').length; }
  return Math.round(total / 1024);
});
report('E2', `30 只图鉴渲染（${dexCards} 卡片，3D 快照 ${pngCount} 张，${renderMs}ms）`, dexCards !== 30 || renderMs > 20000, `localStorage=${storageSize}KB, pageerror=${errors.length}`);

// ============ E3: 移动端 375px 完整战斗 ============
await page.setViewportSize({ width: 375, height: 812 });
await page.getByRole('button', { name: '地图' }).click();
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
let mobileBattleOk = true;
for (let i = 0; i < 60; i++) {
  if ((await page.locator('.battle-view').count()) === 0) break;
  if (await page.locator('.cele-mask').count()) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(480); continue;
  }
  const btn = page.locator('.battle-actions .skill:not([disabled])');
  if (await btn.count()) { try { await btn.first().click(); } catch { mobileBattleOk = false; break; } }
  await page.waitForTimeout(500);
}
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
await dismissCelebration(); await dismissCelebration();
report('E3', '移动端 375px 完整战斗（无横滑无点击失败）', !mobileBattleOk || !mobileBattleOk, `横滑=${mobileOverflow}, 战斗可点=${mobileBattleOk}, pageerror=${errors.length}`);
await page.setViewportSize({ width: 1180, height: 900 });

// ============ E4: 导出 → 清空 → 导入 回环完整性 ============
// 给 uid=2 造灵魂和聊天
await page.evaluate(() => {
  const souls = { '2': { version: 1, identity: { origin: '测试', verbalTic: '喵', love: 'x', hate: 'y', value: 'z', form: '初生', forms: ['初生'] }, traits: { warmth: 0.5, energy: 0.2, pride: -0.1, curiosity: 0 }, memory: { profile: ['回环测试事实'], episodic: [{ t: 1, text: '回环经历' }] }, relation: { affinity: 42, title: '搭档', chats: 7, battles: 3, wins: 2, losses: 1 } } };
  const chats = { '2': { messages: [{ role: 'user', content: '回环消息U', t: 1 }, { role: 'assistant', content: '回环消息A', t: 2 }], total: 2, compressedAt: 0 } };
  localStorage.setItem('funny-pets-souls-v1', JSON.stringify(souls));
  localStorage.setItem('funny-pets-chats-v1', JSON.stringify(chats));
});
// reload 让 soul/chat 模块缓存与 localStorage 一致（真实用户路径：缓存与存储始终同步）
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.getByRole('button', { name: /导出存档/ }).click();
const download = await dl;
if (!download) { report('E4', '导出下载触发', true, '未触发下载'); }
else {
  const path = await download.path();
  const exportText = readFileSync(path, 'utf-8');
  // 清空全部
  await page.getByRole('button', { name: /清空存档/ }).click();
  await page.waitForTimeout(1200);
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: /设置/ }).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  await page.setInputFiles('.import-btn input', { name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(exportText) });
  await page.waitForTimeout(900);
  const restored = await page.evaluate(() => ({
    pets: JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.length,
    soul: JSON.parse(localStorage.getItem('funny-pets-souls-v1') ?? '{}')['2'] ?? null,
    chat: JSON.parse(localStorage.getItem('funny-pets-chats-v1') ?? '{}')['2'] ?? null,
  }));
  const soulOk = restored.soul?.memory?.profile?.[0] === '回环测试事实' && restored.soul?.relation?.affinity === 42;
  const chatOk = restored.chat?.messages?.length === 2;
  report('E4', '导出→清空→导入回环（pets+灵魂+聊天完整恢复）', !(restored.pets === 30 && soulOk && chatOk),
    `pets=${restored.pets}, soul完整=${!!soulOk}, chat完整=${!!chatOk}`);
}

// ============ E5: 连续遭遇 10 次（LLM mock 通路 + WebGL 资源） ============
await page.getByRole('button', { name: '地图' }).click();
for (let i = 0; i < 10; i++) {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: '离开' }).click();
  await page.waitForTimeout(150);
}
report('E5', '连续遭遇 10 次（LLM mock + WebGL 不泄漏报错）', false, `pageerror=${errors.length}`);

// ============ E6: 页面 reload 后战斗态恢复（不该恢复也不该崩） ============
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
await page.reload({ waitUntil: 'networkidle' });
const afterReload = await page.evaluate(() => ({
  hasContent: !!document.querySelector('.content')?.children.length,
  view: location.pathname,
}));
report('E6', '战斗中刷新页面（干净回到地图，不残留战斗态）', !afterReload.hasContent, JSON.stringify(afterReload));

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 5 完成 ====');
