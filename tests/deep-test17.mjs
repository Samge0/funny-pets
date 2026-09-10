// 深度测试 17（Q 系列）：吞噬弹窗左右布局 / 叠加吞噬 / 实时预览出战宠本体
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
await new Promise(r => server.listen(4217, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4217/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['火'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火星弹', power: 45, type: '火' }, { name: '烈焰冲撞', power: 70, type: '火' }],
  look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'volcano', caughtMap: 'volcano', level: 46, exp: 100, phase: 2, ...over,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// ============ Q2 引擎级：叠加吞噬三模式 ============
const { applyDevour } = await import('../src/core/evolve.js');
{
  // 1) 空槽 → 长出
  const p1 = mkPet(1, 111, { look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot' } });
  const d1 = applyDevour(p1, [], [{ part: 'ears', theirs: 'long' }]);
  // 2) 已有 → 叠加（extraParts 数组）
  const p2 = mkPet(2, 222);
  const d2 = applyDevour(p2, [], [{ part: 'tail', theirs: 'spark' }]);
  const d2b = applyDevour(p2, [], [{ part: 'accessory', theirs: 'flower' }]);
  // 3) body → 替换骨架
  const p3 = mkPet(3, 333);
  const d3 = applyDevour(p3, [], [{ part: 'body', theirs: 'tall' }]);
  report('Q2a', '空槽吞噬=长出（look 直填）', !(p1.look.ears === 'long' && d1[0].includes('长出')), `ears=${p1.look.ears}, desc=${d1[0]}`);
  report('Q2b', '已有部件吞噬=叠加（extraParts 追加，原部件保留）',
    !(p2.look.tail === 'stub' && p2.extraParts.length === 2 && p2.look.accessory === 'gem'),
    `tail=${p2.look.tail}(保留), extra=${JSON.stringify(p2.extraParts)}, desc=${d2[0]}；${d2b[0]}`);
  report('Q2c', 'body 吞噬=体型替换（骨架映射）', !(p3.look.body === 'tall' && p3.bodyType === 'bipedal'), `body=${p3.look.body}, type=${p3.bodyType}`);
}

// ============ Q1: 弹窗布局 + 实时预览 ============
await page.evaluate(src => {
  const mkPet = eval('(' + src + ')');
  localStorage.setItem('funny-pets-save-v1', JSON.stringify({
    version: 1, pets: [mkPet(9, 999)], nextUid: 10, dexSeen: {}, partyIds: [9],
    counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
  }));
}, mkPet.toString());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').first().waitFor({ timeout: 8000 });
let saw = false;
for (let round = 0; round < 10 && !saw; round++) {
  await page.waitForTimeout(800);
  for (let w = 0; w < 6; w++) {
    if (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').click().catch(() => {}); await page.waitForTimeout(300); continue; }
    if (await page.locator('.devour-card').count()) { saw = true; break; }
    break;
  }
  if (saw) break;
  await page.waitForTimeout(300);
  if (await page.locator('.devour-card').count()) { saw = true; break; }
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
if (saw) {
  await page.waitForTimeout(900);
  // 布局：预览面板与候选列表左右并排
  const layout = await page.evaluate(() => {
    const pane = document.querySelector('.preview-pane')?.getBoundingClientRect();
    const choices = document.querySelector('.choices-pane')?.getBoundingClientRect();
    return { hasPane: !!pane, hasChoices: !!choices, sideBySide: pane && choices && pane.right <= choices.left + 4 };
  });
  report('Q1a', '布局：预览与候选列表左右并排', !layout.sideBySide, JSON.stringify(layout));
  // 预览对象是出战宠本体（phase=2 有王冠光环 → canvas 存在且 hint 有名称）
  const stageOk = await page.locator('.live-stage canvas').count();
  // 部件候选带模式标签（长出/叠加/体型替换）
  const modeTags = await page.evaluate(() => [...document.querySelectorAll('.part-mode-tag')].map(t => t.textContent.trim()));
  report('Q1b', `预览为出战宠 3D 本体（canvas=${stageOk}；模式标签含长出/叠加）`,
    stageOk === 0 || modeTags.length === 0, `tags=[${modeTags.join(' | ')}]`);
  // 勾选联动：全取消 → 预览回到本体
  const cbs = page.locator('.devour-section .devour-item input[type=checkbox]');
  const n = await cbs.count();
  if (n > 0) {
    const shotOn = await page.locator('.live-stage').screenshot();
    for (let i = 0; i < n; i++) await cbs.nth(i).uncheck();
    await page.waitForTimeout(600);
    const shotOff = await page.locator('.live-stage').screenshot();
    const changed = shotOn.length !== shotOff.length || !shotOn.equals(shotOff);
    report('Q1c', `勾选联动（取消全部 ${n} 件 → 预览回本体）`, !changed, '');
    await page.screenshot({ path: 'test-results/q-devour-layout.png' });
  }
  await page.getByRole('button', { name: /跳过/ }).click();
} else {
  report('Q1', '吞噬弹窗出现（10 场内）', true, '概率性未触发');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 17 完成 ====');
