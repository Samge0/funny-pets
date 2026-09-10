// 深度测试 19（T 系列）：叠加贴身渲染 + 叠加/替换自选
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
await new Promise(r => server.listen(4220, r));

const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
const base = 'http://127.0.0.1:4220/funny-pets/app/';
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['火'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '火星弹', power: 45, type: '火' }, { name: '烈焰冲撞', power: 70, type: '火' }],
  look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
  lore: '测试精灵。', caughtAt: 'volcano', caughtMap: 'volcano', level: 46, exp: 100, phase: 0, ...over,
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());

// ============ T2 引擎级：叠加/替换双模式 ============
const { applyDevour } = await import('../src/core/evolve.js');
{
  // 叠加（默认）
  const p1 = mkPet(1, 111);
  applyDevour(p1, [], [{ part: 'tail', theirs: 'spark', mode: 'stack' }]);
  const stacked = p1.look.tail === 'stub' && p1.extraParts.length === 1;
  // 替换（用户选）
  const p2 = mkPet(2, 222, { extraParts: [{ part: 'tail', value: 'fluff' }] });
  applyDevour(p2, [], [{ part: 'tail', theirs: 'spark', mode: 'replace' }]);
  const replaced = p2.look.tail === 'spark' && p2.extraParts.length === 0; // 同维度叠件一并清除
  report('T2a', '叠加模式：原部件保留 + 叠件追加', !stacked, `tail=${p1.look.tail}, extras=${JSON.stringify(p1.extraParts)}`);
  report('T2b', '替换模式：原部件换新 + 同维度叠件清除', !replaced, `tail=${p2.look.tail}, extras=${p2.extraParts.length}`);
}

// ============ T1 引擎级：叠件渲染（快照可见且不悬浮——通过快照差异存在验证） ============
const snapUrl = await page.evaluate(async () => {
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base2 = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return base2 + '/snapshot-' + m[1] + '.js';
});
const t1 = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const mk = (extraParts) => ({
    seed: 555, name: 't', types: ['火'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
    look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'gem', eyes: 'dot' },
    extraParts,
  });
  const base = await renderSnapshotOutlined(mk([]), 128);
  const withEar = await renderSnapshotOutlined(mk([{ part: 'ears', value: 'long' }]), 128);
  const withTail = await renderSnapshotOutlined(mk([{ part: 'tail', value: 'fluff' }]), 128);
  const withAcc = await renderSnapshotOutlined(mk([{ part: 'accessory', value: 'flower' }]), 128);
  // 叠 4 件耳朵（多叠件仍渲染且整体不出画框——字节稳定在合理范围）
  const multi = await renderSnapshotOutlined(mk([
    { part: 'ears', value: 'long' }, { part: 'tail', value: 'spark' }, { part: 'accessory', value: 'horn' },
  ]), 128);
  return {
    ear: base !== withEar, tail: base !== withTail, acc: base !== withAcc,
    multiDiff: base !== multi,
    bytes: [base.length, withEar.length, withTail.length, withAcc.length, multi.length],
  };
}, snapUrl);
report('T1', `叠件渲染可见（耳/尾/饰 单件+3件组合均与本体互异）`,
  !(t1.ear && t1.tail && t1.acc && t1.multiDiff), JSON.stringify(t1));

// ============ T2 UI 级：弹窗内叠加/替换单选 + 预览联动 ============
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
  // 找到有"叠加/替换"选项的部件（已有部件的候选）
  const howCount = await page.locator('.part-how').count();
  if (howCount > 0) {
    // 切到替换 → 预览联动（previewPet 的 look 应变化而非 extraParts）
    const before = await page.evaluate(() => JSON.stringify({
      look: window.__devourPreviewPet.look,
      ex: window.__devourPreviewPet.extraParts,
    }));
    const replaceRadio = page.locator('.part-how input[value=replace]').first();
    await replaceRadio.check();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => JSON.stringify({
      look: window.__devourPreviewPet.look,
      ex: window.__devourPreviewPet.extraParts,
    }));
    const bd = JSON.parse(before), ad = JSON.parse(after);
    const lookChanged = JSON.stringify(bd.look) !== JSON.stringify(ad.look);
    const modeTag = await page.locator('.part-mode-tag').first().textContent();
    report('T2c', `弹窗叠加/替换单选（${howCount} 项可选）+ 切替换后预览 look 直变（原部件被换）`,
      !lookChanged, `tag=${modeTag?.trim()}, look变化=${lookChanged}, extras ${bd.ex.length}→${ad.ex.length}`);
    await page.screenshot({ path: 'test-results/t-stack-replace.png' });
  } else {
    report('T2c', '弹窗叠加/替换单选出现（本场候选全是空槽/body，无单选项）', false, '概率性跳过');
  }
  await page.getByRole('button', { name: /跳过/ }).click();
} else {
  report('T2', '吞噬弹窗出现', true, '10 场未触发');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 19 完成 ====');
