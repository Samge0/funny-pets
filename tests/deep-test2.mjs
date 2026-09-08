// 深度测试 2（修复后回归版）：LLM mock 通路 + 存档边界 + 放归清理 + 导出完整性
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
await new Promise(r => server.listen(4184, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4184/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'STILL-BUG ❌' : 'FIXED     ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function dismissCelebration(timeout = 6000) {
  try {
    await page.locator('.cele-btn').waitFor({ state: 'visible', timeout });
    await page.locator('.cele-btn').click();
    await page.locator('.cele-card').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  } catch {}
}
async function catchOne() {
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  for (let i = 0; i < 40; i++) {
    if (!(await page.locator('.encounter-view').count())) return true;
    const btn = page.locator('.encounter-view .ball');
    if (await btn.isDisabled()) {
      await page.getByRole('button', { name: '离开' }).click();
      await page.locator('.map-card').nth(0).click();
      await page.locator('.wild-card').waitFor({ timeout: 8000 });
      continue;
    }
    await btn.click(); await page.waitForTimeout(280);
  }
  return false;
}

// ============ LLM mock 通路 ============
await page.route('**/chat/completions', async route => {
  const body = route.request().postDataJSON();
  const allText = (body.messages ?? []).map(m => m.content ?? '').join('\n');
  if (allText.includes('精灵生成器')) {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        name: '灵幻兽', types: ['幽灵'], bodyType: 'serpent',
        ears: 'fin', tail: 'spark', pattern: 'stripe', accessory: 'gem', eyes: 'sleepy',
        lore: '测试用 LLM 生成的图鉴描述。' }) } }] }),
    });
  } else if (allText.includes('整理它的长期记忆')) {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '训练家喜欢在深夜和它聊天\n训练家叫它小灵' } }] }),
    });
  } else {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '测试回复喵！\n__STATE__{"affinityDelta": 2, "drift": {"warmth": 0.5}, "memory": "训练家测试了记忆系统"}' } }] }),
    });
  }
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'http://127.0.0.1:4184/v1', model: 'mock', apiKey: '', enabled: true }));
});
await page.reload({ waitUntil: 'networkidle' });

// ---- B5: LLM bodyType 透传 ----
await catchOne();
await dismissCelebration();
const llmPet = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  return raw.pets.find(p => p.name === '灵幻兽') ?? null;
});
report('B5', 'LLM bodyType 字段透传到存档与 3D 构建', !llmPet || llmPet.bodyType !== 'serpent', llmPet ? `bodyType=${llmPet.bodyType}` : '未捕获 LLM 精灵');

if (llmPet) {
  // ---- B7/B8: 聊天 + __STATE__ ----
  await page.getByRole('button', { name: '图鉴' }).click();
  await page.locator('.dex-card').filter({ hasText: '灵幻兽' }).first().click();
  await page.locator('.detail-card').waitFor({ timeout: 3000 });
  const input = page.locator('.chat-input input');
  await input.fill('你好呀');
  await input.press('Enter');
  await page.waitForTimeout(900);
  await input.fill('再聊一句');
  await input.press('Enter');
  await page.waitForTimeout(900);
  const chatStore = await page.evaluate(u => JSON.parse(localStorage.getItem('funny-pets-chats-v1') ?? '{}')[u] ?? null, String(llmPet.uid));
  const userMsgs = chatStore?.messages?.filter(m => m.role === 'user').length ?? 0;
  report('B7', '连续两次聊天消息不丢失', userMsgs < 2, `user 消息数=${userMsgs}`);
  const replyClean = (chatStore?.messages?.filter(m => m.role === 'assistant').map(m => m.content).join('') ?? '').includes('__STATE__') === false;
  report('B13', '__STATE__ 状态行不进聊天正文', !replyClean, '');
  // 记忆页签
  await page.getByRole('button', { name: /记忆/ }).click();
  await page.waitForTimeout(300);
  const memText = await page.locator('.mem-panel').textContent();
  report('B8', '__STATE__ memory 写入长期记忆', !memText.includes('训练家测试了记忆系统'), memText.slice(0, 60));
  // affinity
  const soulData = await page.evaluate(u => JSON.parse(localStorage.getItem('funny-pets-souls-v1'))[u], String(llmPet.uid));
  report('B11', 'affinityDelta 生效', soulData?.relation?.affinity <= 20, `affinity=${soulData?.relation?.affinity}`);
  await page.locator('.detail-close').click();
}

// ============ B14: debuff 技能作用于对手 ============
// 构造一场战斗：我方带"瞪眼"（defdown），使用后检查敌方 def 是否下降（通过伤害上升侧面验证）
// 直接在页面里跑战斗引擎单测（import dist 内模块不可行——用 UI 验证）
await page.evaluate(() => localStorage.clear());
await page.evaluate(() => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: '', model: '', apiKey: '', enabled: false }));
});
await page.reload({ waitUntil: 'networkidle' });
await catchOne();
await dismissCelebration();
await catchOne();
await dismissCelebration();
// 用第二只打一场：观察战斗日志中"下降"类文本的主体
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });
let debuffSelf = null;
for (let i = 0; i < 90; i++) {
  if ((await page.locator('.battle-view').count()) === 0) break;
  if (await page.locator('.cele-mask').count()) break;
  if (await page.locator('.force-switch .skill:not([disabled])').count()) {
    await page.locator('.force-switch .skill:not([disabled])').first().click();
    await page.waitForTimeout(500); continue;
  }
  // 优先点"变化"技能（找带"变化"小字的按钮）
  const statusBtn = page.locator('.battle-actions .skill', { hasText: '变化' }).first();
  const btn = (await statusBtn.count()) && !(await statusBtn.isDisabled()) ? statusBtn : page.locator('.battle-actions .skill:not([disabled])').first();
  if (await btn.count()) await btn.click();
  await page.waitForTimeout(550);
  const logText = await page.evaluate(() => document.querySelector('.battle-log')?.textContent ?? '');
  // 抓取"X使用Y，Z的防御/攻击/速度下降了"的句子验证主体
  const m = logText.match(/([^，。！的]+)使用[^，。！]+，([^，。！]+)的(?:攻击|防御|速度)下降了/);
  if (m) { debuffSelf = { user: m[1].trim(), target: m[2].trim() }; break; }
}
if (debuffSelf) {
  // 主体和目标同名 = 打自己（bug）；不同名 = 打对手（正确）
  report('B14', 'debuff 技能作用于对手（不再打自己）', debuffSelf.user === debuffSelf.target, JSON.stringify(debuffSelf));
} else {
  console.log('SKIP      ⏭ [B14] 本场未出现 debuff 技能（概率性，重跑可覆盖）');
}
await dismissCelebration(); await dismissCelebration();

// ============ B18: 放归清理灵魂/聊天 ============
const beforeRelease = await page.evaluate(() => ({
  souls: Object.keys(JSON.parse(localStorage.getItem('funny-pets-souls-v1') ?? '{}')).length,
  savePets: JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.length,
}));
// 给第一只造灵魂 + 聊天
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const uid = raw.pets[0].uid;
  localStorage.setItem('funny-pets-chats-v1', JSON.stringify({ [String(uid)]: { messages: [{ role: 'user', content: 'hi', t: 1 }], total: 1, compressedAt: 0 } }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '图鉴' }).click();
await page.waitForTimeout(400);
const firstCard = page.locator('.dex-card').first();
const releaseBtn = firstCard.locator('.release');
await releaseBtn.click(); // dialog accept
await page.waitForTimeout(500);
const afterRelease = await page.evaluate(() => ({
  souls: Object.keys(JSON.parse(localStorage.getItem('funny-pets-souls-v1') ?? '{}')).length,
  chats: Object.keys(JSON.parse(localStorage.getItem('funny-pets-chats-v1') ?? '{}')).length,
  savePets: JSON.parse(localStorage.getItem('funny-pets-save-v1')).pets.length,
}));
const releasedOk = afterRelease.savePets === beforeRelease.savePets - 1;
const soulsCleared = afterRelease.souls < beforeRelease.souls || afterRelease.souls === 0;
const chatsCleared = afterRelease.chats === 0;
report('B18', '放归精灵清理灵魂+聊天（无孤儿数据）', !(releasedOk && soulsCleared && chatsCleared), JSON.stringify({ beforeRelease, afterRelease }));

// ============ B10: nextUid 冲突存档导入被拦截 ============
await page.getByRole('button', { name: /设置/ }).click();
await page.locator('.settings-view').waitFor({ timeout: 3000 });
const exported = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  const crafted = { magic: 'FUNPETS1', exportedAt: new Date().toISOString(), data: { ...raw, nextUid: 1 } };
  return JSON.stringify(crafted);
});
// 注入 file input
await page.setInputFiles('.import-btn input', {
  name: 'bad-save.json', mimeType: 'application/json', buffer: Buffer.from(exported),
});
await page.waitForTimeout(600);
const toastOrPets = await page.evaluate(() => {
  // 导入失败 → toast 报错且存档未变；成功（bug）→ nextUid=1
  const raw = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
  return { nextUid: raw.nextUid, pets: raw.pets.length };
});
report('B10', 'nextUid 冲突存档被校验拦截', toastOrPets.nextUid === 1, JSON.stringify(toastOrPets));

// ============ B20: 导出包含 souls/chats ============
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.getByRole('button', { name: /导出存档/ }).click();
const download = await dl;
let exportOk = false, exportDetail = '下载未触发';
if (download) {
  const path = await download.path();
  const text = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(text);
  exportOk = 'souls' in parsed && 'chats' in parsed && parsed.data && parsed.magic === 'FUNPETS1';
  exportDetail = `顶层键=[${Object.keys(parsed).join(',')}]`;
  // 清理
  try { require('node:fs').unlinkSync(path); } catch {}
}
report('B20', '导出存档包含 souls/chats', !exportOk, exportDetail);

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度回归 2 完成 ====');
