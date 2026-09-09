// P2 引擎级矩阵：6 骨架 × 6 部件维度的吞噬视觉差异验证（快照字节对比）
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
await new Promise(r => server.listen(4211, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4211/funny-pets/app/', { waitUntil: 'networkidle' });

const snapUrl = await page.evaluate(async () => {
  // 从入口 chunk 的 import 映射解析 snapshot chunk 名
  const main = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  if (!main) return null;
  const src = await (await fetch(main)).text();
  const m = src.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const base = new URL(main).pathname.replace(/\/[^/]*$/, '');
  return m ? base + '/snapshot-' + m[1] + '.js' : null;
});

const result = await page.evaluate(async (url) => {
  const { renderSnapshotOutlined } = await import(url);
  const BODIES = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];
  // 每部件维度的代表候选值（覆盖所有可吞值）
  const PARTS = {
    ears: ['none', 'round', 'pointy', 'long', 'fin'],
    tail: ['none', 'stub', 'curl', 'fluff', 'spark'],
    accessory: ['none', 'flower', 'leaf', 'horn', 'gem'],
    pattern: ['none', 'spots', 'stripe', 'belly'],
    eyes: ['dot', 'round', 'sleepy', 'sparkle'],
    body: ['round', 'pear', 'tall', 'blob', 'drop'],
  };
  const mk = (over) => ({
    seed: 1234, name: 't', types: ['一般'], phase: 0, level: 5,
    look: { body: 'round', ears: 'none', tail: 'none', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot', ...over.look },
    bodyType: over.bodyType, moves: [],
  });
  const out = {};
  for (const bt of BODIES) {
    out[bt] = {};
    for (const [part, values] of Object.entries(PARTS)) {
      const shots = [];
      for (const v of values) {
        const look = { [part]: v };
        let pet;
        if (part === 'body') {
          // body 值走 BODY_MAP（applyDevour 逻辑）
          const MAP = { round: 'mochi', pear: 'bipedal', tall: 'bipedal', blob: 'quadruped', drop: 'serpent' };
          pet = mk({ look: {}, bodyType: MAP[v] });
        } else {
          pet = mk({ look, bodyType: bt });
        }
        shots.push(await renderSnapshotOutlined(pet, 96));
      }
      // 各值快照应互异（相同=该部件在此骨架上无视觉效果）
      const uniq = new Set(shots).size;
      out[bt][part] = `${uniq}/${values.length}`;
    }
  }
  return out;
}, snapUrl);

// 汇总：列出所有"无差异"组合
const bad = [];
for (const [bt, parts] of Object.entries(result)) {
  for (const [part, ratio] of Object.entries(parts)) {
    const [u, t] = ratio.split('/').map(Number);
    if (u < t) bad.push(`${bt}/${part}: ${ratio}`);
  }
}
console.log('=== 骨架×部件 视觉差异矩阵（uniq/total） ===');
for (const [bt, parts] of Object.entries(result)) {
  console.log(bt.padEnd(11), Object.entries(parts).map(([p, r]) => `${p}=${r}`).join(' '));
}
console.log('\n=== 无视觉差异组合 ===');
console.log(bad.length ? bad.join('\n') : '无 —— 全部部件在全部骨架上有可见效果');

await browser.close(); server.close();
