// 深度测试 33（GH 系列，2026-09-10）：设置页 GitHub 仓库入口
// GH-1 关于面板存在且含 GitHub 链接（图标 SVG + 仓库名 + 外链箭头）
// GH-2 href 指向 Samge0/funny-pets，target=_blank + rel=noopener
// GH-3 链接可见、hover 样式类齐备
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
const port = server.address().port;
const browser = await chromium.launch({});
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

await page.goto(`http://127.0.0.1:${port}/funny-pets/app/`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '设置' }).click();
await page.waitForTimeout(500);

const link = page.locator('.github-link');
const exists = (await link.count()) === 1 && (await link.isVisible());
report('GH-1', '设置页关于面板含 GitHub 链接（图标+文案）',
  !exists || (await link.locator('svg.gh-icon').count()) !== 1 || !(await link.textContent()).includes('Samge0/funny-pets'),
  exists ? 'visible' : 'missing');

const href = await link.getAttribute('href').catch(() => '');
const target = await link.getAttribute('target').catch(() => '');
const rel = await link.getAttribute('rel').catch(() => '');
report('GH-2', 'href 指向仓库 + _blank + noopener',
  href !== 'https://github.com/Samge0/funny-pets' || target !== '_blank' || !rel.includes('noopener'),
  `href=${href}, target=${target}, rel=${rel}`);

// 移动端 375px 下同样可见（零横滑基线）
await page.setViewportSize({ width: 375, height: 740 });
await page.waitForTimeout(400);
const mobileOk = (await page.locator('.github-link').isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= 376));
report('GH-3', '移动端 375px 可见且无横向滚动', !mobileOk, `visible+noHScroll=${mobileOk}`);

if (errors.length) console.log('页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 33 完成 ====');
