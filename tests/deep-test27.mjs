// Y3 E2E：分享链接全链路——生成 → 新 context 打开 → 观赏模式 → 挑战 → 战斗
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
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
const base = `http://127.0.0.1:${server.address().port}/funny-pets/`;
const browser = await chromium.launch({});
const out = {};

// ===== 分享者：捕捉一只 → 详情 → 点分享 → 拿链接 =====
const owner = await browser.newPage({ viewport: { width: 1180, height: 900 } });
await owner.goto(base + 'app/', { waitUntil: 'networkidle' });
await owner.evaluate(() => localStorage.clear());
await owner.reload({ waitUntil: 'networkidle' });
await owner.locator('.map-card').nth(0).click();
await owner.locator('.wild-card').waitFor({ timeout: 8000 });
for (let i = 0; i < 30; i++) {
  if (!(await owner.locator('.encounter-view').count())) break;
  const btn = owner.locator('.encounter-view .ball');
  if (await btn.isDisabled()) {
    await owner.getByRole('button', { name: '离开' }).click();
    await owner.locator('.map-card').nth(0).click();
    await owner.locator('.wild-card').waitFor({ timeout: 8000 });
    continue;
  }
  await btn.click(); await owner.waitForTimeout(280);
}
try { await owner.locator('.cele-btn').first().click({ timeout: 1500 }); await owner.waitForTimeout(300); } catch {}
// 图鉴 → 详情 → 分享按钮
await owner.getByRole('button', { name: /图鉴/ }).click();
await owner.waitForTimeout(1200);
await owner.locator('.dex-card').first().click();
await owner.locator('.detail-card').waitFor({ timeout: 3000 });
const shareBtn = owner.locator('.detail-share');
out.shareBtnVisible = await shareBtn.count();
await owner.evaluate(() => { navigator.clipboard?.writeText?.catch?.(() => {}); });
// 拦截剪贴板拿 URL
let sharedUrl = null;
await owner.evaluate(() => {
  window.__sharedUrl = null;
  const orig = navigator.clipboard?.writeText?.bind(navigator.clipboard);
  if (orig) navigator.clipboard.writeText = t => { window.__sharedUrl = t; return orig(t); };
});
await shareBtn.click();
await owner.waitForTimeout(600);
sharedUrl = await owner.evaluate(() => window.__sharedUrl);
// v2.1：分享按钮复制「AI 文案+链接」多行文本——查看者只需 URL 行
const urlLine = (sharedUrl ?? '').split('\n').find(l => l.includes('#p='));
if (urlLine) sharedUrl = urlLine.trim();
out.urlGenerated = !!sharedUrl && sharedUrl.includes('#p=');
out.urlLen = sharedUrl?.length ?? 0;
await owner.close();

// ===== 查看者：新 context（独立 localStorage）打开链接 =====
if (out.urlGenerated) {
  const viewerCtx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const viewer = await viewerCtx.newPage();
  const errs = [];
  viewer.on('pageerror', e => errs.push(String(e).slice(0, 150)));
  await viewer.goto(sharedUrl, { waitUntil: 'networkidle' });
  await viewer.waitForTimeout(1200);
  out.sharedViewShown = (await viewer.locator('.shared-view').count()) === 1;
  out.sharedHint = await viewer.locator('.shared-owner-hint').textContent().catch(() => null);
  out.hasCanvas = await viewer.locator('.shared-view canvas').count();
  // 查看者没有精灵 → 挑战按钮应提示先捕捉
  const beforeToast = await viewer.evaluate(() => localStorage.getItem('funny-pets-save-v1'));
  out.viewerNoSave = beforeToast === null;
  await viewer.locator('button', { hasText: '挑战' }).click();
  await viewer.waitForTimeout(600);
  out.challengeBlockedNoPet = await viewer.locator('.shared-view').count() === 1; // 仍在观赏页=被拦
  // 查看者造一只精灵再挑战（往存档塞一只）
  await viewer.evaluate(() => {
    const s = localStorage.getItem('funny-pets-save-v1');
    const save = s ? JSON.parse(s) : { version: 1, pets: [], nextUid: 1, dexSeen: {}, partyIds: [], counters: { encounters: 0, caught: 0, battlesWon: 0, evolutions: 0 } };
    // 从分享 URL 解出的宠不塞；用工具生成一只最简宠物（引擎字段校验以 battle 为准）
    const pet = {
      uid: save.nextUid++, seed: 12345, name: '挑战者', types: ['火'], level: 5, exp: 0, phase: 0,
      rarity: 'common', moves: [{ name: '火花', type: '火', power: 40 }],
      look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', accessory: 'none', eyes: 'round', palette: 0 },
      base: { hp: 50, atk: 42, def: 38, spd: 45 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 },
      nature: { hp: 1, atk: 1, def: 1, spd: 1 }, lore: 'x', caughtMap: 'meadow',
    };
    save.pets.push(pet);
    save.partyIds.push(pet.uid);
    localStorage.setItem('funny-pets-save-v1', JSON.stringify(save));
  });
  await viewer.reload({ waitUntil: 'networkidle' });
  await viewer.waitForTimeout(1000);
  out.sharedStillAfterReload = await viewer.locator('.shared-view').count() === 1; // hash 仍在
  await viewer.locator('button', { hasText: '挑战' }).click();
  await viewer.waitForTimeout(1200);
  out.battleStarted = await viewer.locator('.battle-view').count() === 1;
  // 打一场：用技能直到结束
  for (let r = 0; r < 25; r++) {
    const skills = viewer.locator('.battle-actions .skill:not(.switch-opt):not([disabled])');
    if (await skills.count()) {
      let clicked = false;
      const n = await skills.count();
      for (let k = 0; k < n; k++) {
        const txt = await skills.nth(k).textContent();
        if (txt && txt.includes('威力')) { await skills.nth(k).click().catch(() => {}); clicked = true; break; }
      }
      if (!clicked) await skills.first().click().catch(() => {});
    }
    await viewer.waitForTimeout(900);
    while (await viewer.locator('.cele-btn').count()) { await viewer.locator('.cele-btn').first().click().catch(() => {}); await viewer.waitForTimeout(220); }
    while (await viewer.locator('.devour-mask').count()) { await viewer.locator('button', { hasText: '跳过' }).click().catch(() => {}); await viewer.waitForTimeout(280); }
    if (!(await viewer.locator('.battle-view').count())) break;
  }
  out.battleEnded = !(await viewer.locator('.battle-view').count());
  out.backToSharedOrMap = (await viewer.locator('.shared-view').count()) === 1 || (await viewer.locator('.map-view, .map-card').first().isVisible().catch(() => false));
  out.viewerErrors = errs;
  await viewerCtx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
