// 深度测试 45（i18n 补全验证）：en/ja/zh-TW 下特效开关与涂色面板文案跟随语言
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
await new Promise(r => server.listen(4250, r));

const browser = await chromium.launch({});
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG-CONFIRMED ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}
const pet = { uid: 1, seed: 1, name: '宠1号', types: ['水'], rarity: 'common', level: 5, exp: 0, phase: 0, look: { body: 'round', ears: 'round', tail: 'fluff', pattern: 'belly', palette: 1, accessory: 'none', eyes: 'round' }, moves: [{ name: '撞击', type: '一般', power: 40 }], lore: 't', caughtAt: 'meadow', caughtMap: 'meadow', base: { hp: 50, atk: 50, def: 50, spd: 50 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 }, nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 } };

async function testLocale(page, localeTag, expect) {
  await page.addInitScript((p) => {
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({ version: 1, pets: [p], nextUid: 2, dexSeen: {}, partyIds: [p.uid], giftClaimed: [], counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 } }));
  }, pet);
  await page.goto('http://127.0.0.1:4250/funny-pets/app/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // 设置页切语言（导航第 4 个按钮，文案随语言变用结构定位）
  await page.locator('nav button').nth(3).click();
  await page.locator('.settings-view').waitFor({ timeout: 3000 });
  // 语言下拉是 lang-select（值 auto/en/ja/zh-TW）
  await page.locator('.lang-select').selectOption(localeTag);
  await page.waitForTimeout(300);

  // 断言1：战斗特效开关文案
  const fxLabel = await page.locator('.fx-toggle span').textContent();
  const fxPanel = await page.locator('.settings-view h3', { hasText: expect.fxPanel }).count();
  report(`${localeTag}-1`, `[${localeTag}] 特效面板标题「${expect.fxPanel}」`, !fxPanel, `label=${fxLabel}`);
  report(`${localeTag}-2`, `[${localeTag}] 特效开关文字「${expect.fxLabel}」`, fxLabel?.trim() !== expect.fxLabel, `got=${fxLabel?.trim()}`);
  const stateTxt = await page.locator('.fx-state').textContent();
  report(`${localeTag}-3`, `[${localeTag}] 状态徽标「${expect.on}」`, stateTxt?.trim() !== expect.on, `got=${stateTxt?.trim()}`);

  // 断言2：涂色 tab 文案（导航按钮文案随语言变，用 DOM 结构定位第 3 个 nav 按钮）
  const dexBtn = page.locator('nav button').nth(2);
  await dexBtn.click();
  await page.waitForTimeout(300);
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 3000 });
  const paintTab = await page.locator('.detail-tabs button', { hasText: expect.paintTab }).count();
  report(`${localeTag}-4`, `[${localeTag}] 涂色 tab「${expect.paintTab}」`, !paintTab);
  await page.locator('.detail-tabs button', { hasText: expect.paintTab }).click();
  await page.waitForTimeout(300);
  const saveBtn = await page.locator('.paint-save').textContent();
  report(`${localeTag}-5`, `[${localeTag}] 保存按钮「${expect.save}」`, saveBtn?.trim() !== expect.save, `got=${saveBtn?.trim()}`);
  const slotName = await page.locator('.paint-slot .slot-name').first().textContent();
  report(`${localeTag}-6`, `[${localeTag}] 槽位名「${expect.slotBody}」`, slotName?.trim() !== expect.slotBody, `got=${slotName?.trim()}`);
  await page.locator('.detail-close').click();
  await page.waitForTimeout(300);
}

try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1180, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await testLocale(page, 'en', {
    fxPanel: 'Battle', fxLabel: 'Battle effects', on: 'On',
    paintTab: 'Paint', save: 'Save colors', slotBody: 'Body',
  });
  await page.close();
  const page2 = await browser.newPage({ locale: 'ja-JP', viewport: { width: 1180, height: 900 } });
  page2.on('pageerror', e => errors.push(e.message));
  await testLocale(page2, 'ja', {
    fxPanel: 'バトル', fxLabel: 'バトルエフェクト', on: 'ON',
    paintTab: '塗色', save: '配色を保存', slotBody: 'ボディ',
  });
  // 修正：JA 槽位名 t('身体') 需查 JA 词典——未收录则回落中文，先看实际值
  await page2.close();
  if (errors.length) console.log('PAGE-ERRORS ❌', errors.slice(0, 4));
  else console.log('no page errors ✅');
} finally {
  await browser.close();
  server.close();
}
