// Y2 页面级：真实应用页配置 mock LLM（带 CORS）→ 点地图 → 生成精灵含"岩甲兽"
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
const appPort = server.address().port;

// mock LLM：带 CORS（应用页 http://127.0.0.1:appPort 跨源访问）
const mockHits = [];
const srv = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    mockHits.push(body.includes('精灵生成器') ? 'generate' : 'other');
    const content = '好的：\n```json\n{"name":"岩甲兽","types":["岩石"],"bodyType":"quadruped","ears":"pointy","tail":"stub","pattern":"spots","accessory":"horn","eyes":"round","lore":"住在山洞里。",}\n```';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const mockPort = srv.address().port;

const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${appPort}/funny-pets/app/`, { waitUntil: 'networkidle' });
// 配置 LLM
await page.evaluate(p => {
  localStorage.setItem('funny-pets-llm-v1', JSON.stringify({
    baseUrl: `http://127.0.0.1:${p}`, model: 'mock', apiKey: '', enabled: true,
  }));
}, mockPort);
// llmConfig 是启动快照（store reactive(readLlmConfig())），必须 reload 生效
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.map-card').nth(0).click();
await page.waitForTimeout(2500);
const wildName = await page.locator('.wild-card h2').textContent().catch(() => null);
console.log(JSON.stringify({
  wildName,
  parsedFenceJson: !!wildName?.includes('岩甲兽'),
  mockHits,
}, null, 1));
await browser.close(); server.close(); srv.close();
