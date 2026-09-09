// V 系列验证：V1 敌方流式气泡 + V2 叠件贴身锚点
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
await new Promise(r => server.listen(4234, r));
const browser = await chromium.launch({});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:4234/funny-pets/app/', { waitUntil: 'networkidle' });

const r = await page.evaluate(async () => {
  const out = {};
  const appUrl = performance.getEntriesByType('resource').map(r => r.name).find(n => /app-.*\.js/.test(n));
  const base = new URL(appUrl).pathname.replace(/\/[^/]*$/, '');
  const appSrc = await (await fetch(appUrl)).text();
  const m = appSrc.match(/snapshot-([A-Za-z0-9_-]+)\.js/);
  const { renderSnapshotOutlined } = await import(base + '/snapshot-' + m[1] + '.js');
  const mk = (extraParts, look) => ({
    seed: 777, name: 't', types: ['火'], phase: 0, level: 5, bodyType: 'bipedal', moves: [],
    look: { body: 'round', ears: 'pointy', tail: 'stub', pattern: 'none', palette: 0, accessory: 'none', eyes: 'dot', ...look },
    extraParts,
  });
  // V2a: 叠耳渲染差异（bipedal：叠耳挂 headAnchor 内，应可见）
  const base0 = await renderSnapshotOutlined(mk([]), 128);
  const earAdd = await renderSnapshotOutlined(mk([{ part: 'ears', value: 'long' }]), 128);
  out.v2a = { same: earAdd === base0 };
  // V2b: 叠尾
  const tailAdd = await renderSnapshotOutlined(mk([{ part: 'tail', value: 'fluff' }]), 128);
  out.v2b = { same: tailAdd === base0 };
  // V2c: 叠配饰
  const accAdd = await renderSnapshotOutlined(mk([{ part: 'accessory', value: 'flower' }]), 128);
  out.v2c = { same: accAdd === base0 };
  // V2d: 六骨架全测（叠耳每骨架都应可见）
  out.v2d = {};
  for (const bt of ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi']) {
    const a = await renderSnapshotOutlined(mk([]), 96);
    const b = await renderSnapshotOutlined(mk([{ part: 'ears', value: 'long' }]), 96);
    // mk 里 bodyType 固定 bipedal——这里真正按骨架测：直接改 pet.bodyType
    const mkBt = (extraParts, bodyType) => ({ ...mk(extraParts), bodyType });
    const a2 = await renderSnapshotOutlined(mkBt([], bt), 96);
    const b2 = await renderSnapshotOutlined(mkBt([{ part: 'ears', value: 'long' }], bt), 96);
    out.v2d[bt] = { same: a2 === b2, sanity_same_bipedal: a === b };
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await browser.close(); server.close();
