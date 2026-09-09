// X4：mock LLM SSE 服务器 → 真实 tauntWithSoul 流式路径 → 气泡文本无 JSON 泄漏
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/app' || p === '/funny-pets/app/') p = '/app/index.html';
  const file = join(root, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// mock LLM：流式返回正文 + 标记碎片 + 截断 JSON（精确复现用户报告的场景）
const sseApp = createServer((req, res) => {
  const chunks = ['接招', '吧！这招扑击', '如何！', '\n', '__STAT', 'E__{"affinityDelta":2,"drift":{"warm'];
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  let i = 0;
  const timer = setInterval(() => {
    if (i < chunks.length) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i] } }] })}\n\n`);
      i++;
    } else {
      res.write('data: [DONE]\n\n');
      res.end();
      clearInterval(timer);
    }
  }, 40);
});
await new Promise(r => sseApp.listen(0, '127.0.0.1', r));
const ssePort = sseApp.address().port;

const browser = await chromium.launch({});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${port}/funny-pets/app/`, { waitUntil: 'networkidle' });

// 配置 LLM 指向 mock，开启 enabled
await page.evaluate(p => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({
    baseUrl: `http://127.0.0.1:${p}`, model: 'mock-model', apiKey: '', enabled: true,
  }));
}, ssePort);
await page.reload({ waitUntil: 'networkidle' });

// 真实战斗流程走到 taunt
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
for (let i = 0; i < 30; i++) {
  if (!(await page.locator('.encounter-view').count())) break;
  const btn = page.locator('.encounter-view .ball');
  if (await btn.isDisabled()) {
    await page.getByRole('button', { name: '离开' }).click();
    await page.locator('.map-card').nth(0).click();
    await page.locator('.wild-card').waitFor({ timeout: 8000 });
    continue;
  }
  await btn.click(); await page.waitForTimeout(280);
}
try { await page.locator('.cele-btn').first().click({ timeout: 1500 }); await page.waitForTimeout(300); } catch {}
await page.locator('.map-card').nth(0).click();
await page.locator('.wild-card').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: /开战/ }).click();
await page.locator('.battle-view').waitFor({ timeout: 5000 });

const samples = [];
const seenTexts = new Set(); // sanity：记录气泡出现过的文本（证明 mock LLM 真的被调用）
for (let r = 0; r < 2; r++) {
  const skills = page.locator('.battle-actions .skill:not(.switch-opt):not([disabled])');
  if (await skills.count()) {
    let clicked = false;
    const n = await skills.count();
    for (let k = 0; k < n; k++) {
      const txt = await skills.nth(k).textContent();
      if (txt && txt.includes('威力')) { await skills.nth(k).click().catch(() => {}); clicked = true; break; }
    }
    if (!clicked) await skills.first().click().catch(() => {});
  }
  // 流式过程中高频采样气泡文本（抓碎片闪现；每回合 ~2.4s）
  for (let s = 0; s < 12; s++) {
    await page.waitForTimeout(200);
    const mine = await page.locator('.taunt-bubble.taunt-mine .taunt-text').textContent().catch(() => null);
    const wild = await page.locator('.taunt-bubble.taunt-wild .taunt-text').textContent().catch(() => null);
    for (const t of [mine, wild]) {
      if (t) seenTexts.add(t);
      if (t && (t.includes('__STATE__') || t.includes('__STAT') || t.includes('affinityDelta') || t.includes('"drift"'))) {
        samples.push(t);
      }
    }
  }
  while (await page.locator('.cele-btn').count()) { await page.locator('.cele-btn').first().click().catch(() => {}); await page.waitForTimeout(250); }
  while (await page.locator('.devour-mask').count()) {
    await page.getByRole('button', { name: /跳过/ }).click().catch(() => page.getByRole('button', { name: /确认吞噬/ }).click().catch(() => {}));
    await page.waitForTimeout(350);
  }
  if (!(await page.locator('.battle-view').count())) break;
}
console.log(JSON.stringify({
  leakSamples: samples.length,
  samples: samples.slice(0, 5),
  sanityBubbleTexts: [...seenTexts].slice(0, 6), // 非空 = mock LLM 确实渲染进气泡了
  pageErrors: errs,
}, null, 1));
await browser.close(); server.close(); sseApp.close();
