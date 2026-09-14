// V轮三角色审计（2026-09-15）——RED 复现 4 个实锤 bug，修复后转 GREEN：
//   B1 升级属性掷点从未写入 pet.base —— 数值成长是纯装饰（战斗/存档都无效）
//   B2 进化命名 slice(0,4) 按码元截断 —— 英文名 "Sir Fluffington" → "Sir 纳"
//   B3 吞噬弹窗「跳过」=「确认吞噬」 —— 两个按钮同一个 handler，跳过反而吞掉全部
//   B4 VALUE_ZH round 键重复（耳朵'圆'被眼睛'圆眼'覆盖）→ zh 显示错值；
//      v11 新枚举（big/shy/bow/bell/fluffy/droopy/stub 等）裸键泄漏
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
const results = [];
function report(id, desc, pass, detail = '') {
  results.push({ id, desc, pass, detail });
  console.log(`${pass ? '✅' : '❌ BUG-CONFIRMED'} ${id} ${desc}${detail ? ' | ' + detail : ''}`);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/funny-pets/' || p === '/funny-pets') p = '/index.html';
  if (p === '/funny-pets/app' || p === '/funny-pets/app/') p = '/app/index.html';
  const file = join(ROOT, p.replace(/^\/funny-pets\//, ''));
  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'zh-CN' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
const base = 'http://127.0.0.1:' + PORT + '/funny-pets/';

// ============ B2：进化命名截断（Node 级引擎测试） ============
{
  const { evolvePet } = await import('../src/core/evolve.js');
  const pet = {
    seed: 12345, name: 'Sir Fluffington', types: ['火'], level: 18, phase: 0, exp: 0,
    base: { hp: 50, atk: 50, def: 50, spd: 50 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 },
    nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
    moves: [{ name: '扑击', power: 40, type: '一般' }],
    lore: 'x', look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', accessory: 'none', eyes: 'dot', palette: 0 },
  };
  const evo = evolvePet(pet, 1);
  // 修复目标：非 CJK 名保留完整词干 + 后缀（"Sir Fluffington纳"），而不是 4 码元截断
  const ok = evo.name.startsWith('Sir Fluffington') && /[纳皇]$/.test(evo.name);
  report('B2', '进化名不按码元截断（EN 名保留完整词干）', ok, `evolved name = "${evo.name}"`);
}

// ============ B1：升级掷点写入 base（Node 级引擎测试） ============
{
  const { applyExpGain, statsAt } = await import('../src/core/evolve.js');
  // phase=2 已终极形态（不再触发 evolvePet 的 base×growth），隔离出"每级掷点"本身
  const mk = () => ({
    seed: 777, name: '测试', types: ['水'], level: 5, phase: 2, exp: 0,
    base: { hp: 50, atk: 50, def: 50, spd: 50 }, iv: { hp: 8, atk: 8, def: 8, spd: 8 },
    nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
    moves: [{ name: '扑击', power: 40, type: '一般' }],
    look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', accessory: 'none', eyes: 'dot', palette: 0 },
  });
  const pet = mk();
  const r = applyExpGain(pet, 2000); // 升若干级（无进化干扰）
  const grew = r.levels > 0;
  // 对照组：同初始 base、直接把 level 拉到同级的"纯曲线"成长
  const ctrl = mk();
  ctrl.level = pet.level;
  const hpAfter = statsAt(pet, pet.level).hp;
  const hpCtrl = statsAt(ctrl, pet.level).hp;
  // 掷点若写入 base：base 本身增长 + statsAt 感知得到超出纯曲线的成长
  const baseGrew = pet.base.hp > 50 || pet.base.atk > 50 || pet.base.def > 50 || pet.base.spd > 50;
  report('B1', '升级属性掷点写入 pet.base（成长真实生效）', grew && r.evolvedTo === null && baseGrew && hpAfter > hpCtrl,
    `levels=${r.levels} base=${JSON.stringify(pet.base)} hpAfter=${hpAfter} hpCtrl=${hpCtrl}`);
}

// ============ B3：吞噬弹窗「跳过」≠「确认吞噬」（浏览器 E2E） ============
{
  await page.goto(base + 'app/', { waitUntil: 'networkidle' });
  // 注入强宠 + 低等级（打一场必升级 → levelup 满档 60/55% 吞噬概率）
  await page.evaluate(() => {
    const mk = (uid, seed, nm) => ({
      uid, seed, name: nm, types: ['火'], rarity: 'common', level: 2, exp: 0, phase: 0,
      base: { hp: 90, atk: 90, def: 90, spd: 200 }, iv: { hp: 15, atk: 15, def: 15, spd: 15 },
      nature: { name: '平衡', hp: 1, atk: 1, def: 1, spd: 1 },
      moves: [
        { name: '烈焰冲撞', power: 70, type: '火' },
        { name: '火星弹', power: 40, type: '火' },
        { name: '深呼吸', effect: 'atkup', type: '火' },
      ],
      look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', accessory: 'none', eyes: 'dot', palette: 0 },
    });
    const save = {
      version: 1, pets: [mk(1, 111, '小火苗')], nextUid: 2, dexSeen: {},
      partyIds: [1], giftClaimed: [],
      counters: { encounters: 0, caught: 1, battlesWon: 0, evolutions: 0 },
    };
    localStorage.setItem('funny-pets-save-v1', JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'networkidle' });

  let devours = 0, skipLeftUnchanged = null;
  for (let round = 0; round < 10; round++) {
    await page.locator('.map-card').nth(0).click();
    if (!(await page.locator('.wild-card').count())) break;
    await page.getByRole('button', { name: /开战/ }).click();
    await page.locator('.battle-view').waitFor({ timeout: 8000 });
    for (let i = 0; i < 40; i++) {
      if (await page.locator('.cele-card').count()) break;
      if (!(await page.locator('.battle-view').count())) break;
      const btn = page.locator('.battle-actions .skill').first();
      if (await btn.isDisabled()) { await page.waitForTimeout(400); continue; }
      await btn.click();
      await page.waitForTimeout(500);
    }
    for (let i = 0; i < 10 && (await page.locator('.cele-card').count()); i++) {
      await page.locator('.cele-btn').first().click().catch(() => {});
      await page.waitForTimeout(400);
    }
    if (await page.locator('.devour-card').count()) {
      devours++;
      const before = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
        const p = s.pets[0];
        return JSON.stringify({ moves: p.moves.map(m => m.name), look: p.look, extra: p.extraParts ?? [] });
      });
      await page.locator('.devour-actions .ghost').click(); // 「跳过」
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('funny-pets-save-v1'));
        const p = s.pets[0];
        return JSON.stringify({ moves: p.moves.map(m => m.name), look: p.look, extra: p.extraParts ?? [] });
      });
      skipLeftUnchanged = (before === after);
      break;
    }
    await page.waitForTimeout(300);
  }
  report('B3', '吞噬弹窗点「跳过」不改变存档（跳过≠确认）', devours > 0 && skipLeftUnchanged === true,
    devours === 0 ? '10 场未出现吞噬弹窗（概率异常）' : `devours=${devours} skipUnchanged=${skipLeftUnchanged}`);
}

// ============ B4：VALUE_ZH 键冲突 + v11 枚举裸键泄漏 ============
{
  const { valueLabel, setLocale } = await import('../src/core/i18n.js');
  setLocale('zh');
  const earRound = valueLabel('round');
  const earOk = earRound !== '圆眼';
  const { EARS, ACCESSORIES, EYE_STYLES } = await import('../src/data/traits.js');
  const leaks = [];
  for (const e of EARS) if (valueLabel(e.key) === e.key && e.key !== 'none') leaks.push(`ears:${e.key}`);
  for (const a of ACCESSORIES) if (valueLabel(a.key) === a.key && a.key !== 'none') leaks.push(`acc:${a.key}`);
  for (const ey of EYE_STYLES) if (valueLabel(ey.key) === ey.key && ey.key !== 'none') leaks.push(`eyes:${ey.key}`);
  report('B4', 'zh 值标签无键冲突/无裸键泄漏', earOk && leaks.length === 0, `round→"${earRound}"${leaks.length ? ' leaks=' + leaks.join(',') : ''}`);
}

await browser.close();
await new Promise(r => server.close(r));
const fails = results.filter(r => !r.pass);
console.log(`\n===== V轮 RED 结果: ${results.length - fails.length}/${results.length} =====`);
if (pageErrors.length) console.log('pageErrors:', pageErrors.slice(0, 5));
process.exit(fails.length ? 1 : 0);
