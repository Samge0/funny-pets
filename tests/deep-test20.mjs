// U 系列 RED 取证：通过 window.__engines 钩子证明两个 bug 存在
// U1: pattern/eyes 选"叠加" → extraParts 有数据但 3D 渲染端跳过 → 吞噬无视觉效果
// U2: evolvePet 改 look.body 但不同步 bodyType → 3D 模式下进化体型变化无效
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
await new Promise(r => server.listen(4233, r));
const browser = await chromium.launch({});
const page = await browser.newPage({ locale: 'zh-CN' });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:4233/funny-pets/app/', { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const out = { hasHook: !!window.__engines };
  if (!window.__engines) return out;
  const { applyDevour, evolvePet } = window.__engines;

  // ---- U1: pattern 选叠加 ----
  const pet = { name: 'T', moves: [], look: { body: 'round', ears: 'none', tail: 'none', pattern: 'spots', eyes: 'dot', accessory: 'none', palette: 0 }, extraParts: [] };
  const desc = applyDevour(pet, [], [{ part: 'pattern', theirs: 'stripe', mode: 'stack' }]);
  out.u1 = { desc, pattern: pet.look.pattern, extraParts: JSON.stringify(pet.extraParts) };
  // 判定：pattern 进 extraParts（渲染端跳过 pattern/eyes）= 吞了白吞 BUG
  out.u1_bug = pet.extraParts.some(e => e.part === 'pattern');

  // ---- U2: evolvePet 骨架同步 ----
  const p3 = { seed: 42, name: '宠', types: ['火'], phase: 0, level: 18, exp: 0,
    base: { hp: 50, atk: 40, def: 35, spd: 45 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 },
    nature: { hp: 1, atk: 1, def: 1, spd: 1 }, moves: [{ name: '火花', type: '火', power: 40 }],
    lore: '', look: { body: 'round', ears: 'none', look: null, tail: 'none', pattern: 'none', eyes: 'dot', accessory: 'none', palette: 0 }, bodyType: 'quadruped' };
  const ev = evolvePet(p3, 1);
  out.u2 = { look_body: ev.look.body, bodyType: ev.bodyType, mapped: { tall: 'bipedal', pear: 'bipedal', blob: 'quadruped', drop: 'serpent' }[ev.look.body] };
  // 判定：look.body 变了但 bodyType 没跟上 = 进化体型在 3D 渲染无效 BUG
  out.u2_bug = ev.look.body !== 'round' && ev.bodyType === 'quadruped' && ev.look.body !== 'blob';

  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log(errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : 'no page errors');
await browser.close(); server.close();
