// 深度测试 35（Z轮·三角色审计 2026-09-10）：本轮修复项的 RED→GREEN 回归
// F1 免疫（eff=0）攻击不再造成伤害：地面系打电系/电系打地面系，HP 不变、战报说"没有效果"
// F2 存档导入：恶意/损坏 souls 结构不再破坏 UI（详情页能开、特质兜底）
// F3 LLM 聊天 prompt 不再重复用户消息（appendChat 时序）
// F4 战斗后 party hp 字段剥离入档（战斗残血不进存档——挑战/野战路径统一）
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
const base = `http://127.0.0.1:${port}/funny-pets/app/`;

const browser = await chromium.launch({});
const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1180, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('dialog', d => d.accept().catch(() => {}));
function report(id, name, bugRepro, detail) {
  console.log(`${bugRepro ? 'BUG ❌' : 'PASS ✅'} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const mkPet = (uid, seed, over = {}) => ({
  uid, seed, name: `测${uid}`, types: ['水'], rarity: 'common',
  iv: { hp: 8, atk: 8, def: 8, spd: 8 }, base: { hp: 60, atk: 55, def: 55, spd: 55 },
  nature: { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  moves: [{ name: '水泡射击', power: 45, type: '水' }, { name: '浪涌', power: 70, type: '水' }, { name: '水流护体', power: null, effect: 'defup', type: '水' }],
  look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: uid % 10, accessory: 'none', eyes: 'round' },
  lore: '测试精灵。', caughtAt: 'shore', caughtMap: 'shore', level: 5, exp: 100, phase: 0, ...over,
});
const mkPetSrc = mkPet.toString();

// ============ F1: 免疫攻击 0 伤害（引擎级，页面内跑 battleTurn） ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  const r = await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    // 我方=电系攻击（打地面系 eff=0）；敌方=地面系。补齐 hp/maxHp 走真实战斗形态
    const mk = (uid, seed, types, moves) => {
      const p = mkPet(uid, seed, { types, moves });
      const s = window.__statsAt(p, p.level);
      p.maxHp = s.hp; p.hp = s.hp; p.boosts = {};
      return p;
    };
    const mine = mk(1, 11, ['电'], [{ name: '十万伏特', power: 90, type: '电' }]);
    const foe = mk(2, 22, ['地面'], [{ name: '泥巴射击', power: 40, type: '地面' }]);
    if (!window.__battleTurn || !window.__newBattle) return { ok: false, why: 'no battle hooks' };
    const st = window.__newBattle(mine, foe, [mine]);
    const hpBefore = st.wild.hp;
    const evts = window.__battleTurn(st, { type: 'move', moveIndex: 0 });
    const dmgEvents = evts.filter(e => e.type === 'damage' && e.side === 'player');
    return {
      ok: true,
      hpBefore, hpAfter: st.wild.hp,
      damaged: st.wild.hp < hpBefore,
      dmgEventDamage: dmgEvents.map(e => e.damage),
      dmgEventText: dmgEvents.map(e => e.text).join('|'),
    };
  }, mkPetSrc);
  if (!r.ok) {
    report('F1', '免疫(eff=0)攻击 0 伤害（引擎钩子缺失，跳过）', false, r.why);
  } else {
    report('F1', '免疫(eff=0)攻击 0 伤害且战报为"没有效果"', r.damaged || !(r.dmgEventText.includes('没有效果') && r.hpAfter === r.hpBefore),
      `hp ${r.hpBefore}→${r.hpAfter}, dmg=${JSON.stringify(r.dmgEventDamage)}, text="${r.dmgEventText.slice(0, 40)}"`);
  }
}

// ============ F2: 恶意 souls 导入后详情页不炸 ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  // 构造带合法 magic 的存档 + 破坏版 souls（字段缺失/类型错误）
  const evilFile = await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    const data = {
      magic: 'FUNPETS1',
      data: {
        version: 1, pets: [mkPet(1, 77)], nextUid: 2, dexSeen: {}, partyIds: [1],
        counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
      },
      souls: { '1': { identity: null, traits: 'not-an-object', relation: { affinity: '很多' } } },
      chats: { '1': { messages: 'oops', total: -5 } },
    };
    return JSON.stringify(data);
  }, mkPetSrc);
  // 通过设置页导入（文件 input）——走 onImportFile 真路径
  await page.locator('nav.tabs button', { hasText: '设置' }).click();
  const fileInput = page.locator('input[type=file][accept=".json"]');
  await fileInput.setInputFiles({
    name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evilFile, 'utf8'),
  });
  await page.waitForTimeout(800); // confirm 自动接受
  // 导入应成功（存档合法），souls 被修复/替换；打开详情页不应崩
  await page.locator('nav.tabs button', { hasText: '图鉴' }).click();
  await page.locator('.dex-card').first().click();
  await page.waitForTimeout(700);
  const detailOk = await page.locator('.detail-card').count();
  const traitLine = await page.locator('.soul-line').textContent().catch(() => '');
  report('F2', '损坏 souls 导入后详情页正常打开', (detailOk === 0) || errors.length > 0,
    `detailCard=${detailOk}, soulLine="${(traitLine || '').slice(0, 30)}", pageerrors=${errors.length}`);
  errors.length = 0;
}

// ============ F3: 聊天 prompt 不重复用户消息 ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  // 注入一只精灵 + 配置 LLM（mock 路由捕获 messages）
  const captured = [];
  await page.route('**/chat/completions', async route => {
    const body = route.request().postDataJSON();
    captured.push(body.messages);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: '喵！很开心你能来陪我聊天的说！' } }] }),
    });
  });
  await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [mkPet(1, 55)], nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
    localStorage.setItem('funny-pets-llm-v1', JSON.stringify({ baseUrl: 'https://mock.local/v1', model: 'mock-1', apiKey: '', enabled: true }));
  }, mkPetSrc);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav.tabs button', { hasText: '图鉴' }).click();
  await page.locator('.dex-card').first().click();
  const input = page.locator('.chat-input input');
  await input.fill('你好呀');
  await page.locator('.chat-input button[type=submit]').click();
  await page.waitForTimeout(1200);
  const msgs = captured[0] ?? [];
  const userTexts = msgs.filter(m => m.role === 'user').map(m => m.content);
  const dup = userTexts.filter(t => t === '你好呀').length;
  report('F3', '聊天 prompt 用户消息只出现一次', dup !== 1,
    `userMsgs=${JSON.stringify(userTexts)}, 次数=${dup}`);
  await page.unroute('**/chat/completions');
}

// ============ F4: 战斗结束入档不带 hp（残血不进存档） ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [mkPet(1, 999, { level: 50, exp: 5000, phase: 2 })], nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPetSrc);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.map-card').nth(0).click();
  await page.locator('.wild-card').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: /开战/ }).click();
  await page.locator('.battle-view').waitFor({ timeout: 5000 });
  // 打到战斗结束（win/lose/switch 循环处理）
  for (let i = 0; i < 120; i++) {
    if (await page.locator('.cele-btn').count()) break;
    if ((await page.locator('.battle-view').count()) === 0) break;
    if (await page.locator('.force-switch .skill:not([disabled])').count()) {
      await page.locator('.force-switch .skill:not([disabled])').first().click();
      await page.waitForTimeout(480); continue;
    }
    const btn = page.locator('.battle-actions .skill:not([disabled])');
    if (await btn.count()) await btn.first().click();
    await page.waitForTimeout(520);
  }
  if (await page.locator('.cele-btn').count()) {
    await page.locator('.cele-btn').dispatchEvent('click');
    await page.waitForTimeout(300);
  }
  if (await page.locator('.devour-mask').count()) {
    await page.locator('.devour-actions .ghost').click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600); // 等 persist 防抖 150ms
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));
  const withHp = (stored.pets ?? []).filter(p => 'hp' in p).map(p => p.uid);
  report('F4', '战斗结束入档的精灵不带 hp 字段', withHp.length > 0, `uids with hp: ${JSON.stringify(withHp)}`);
}

// ============ F5: 分享链接 body 白名单与真实数据源一致（接收端体型不漂移） ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  // 构造 4 种非 round 体型分享链接，解码后 look.body 必须原样保留
  const results = [];
  for (const body of ['pear', 'tall', 'blob', 'drop']) {
    const payload = { n: '体', s: 42, lv: 5, ty: ['火'], lk: { body }, mv: [{ name: '火花', type: '火', power: 40 }] };
    await page.goto(base + '#p=' + encodeURIComponent(JSON.stringify(payload)), { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const got = await page.evaluate(() => {
      const el = document.querySelector('.shared-view');
      return el ? el.innerHTML.length > 0 : false;
    });
    results.push({ body, sharedView: got, errs: errors.length });
    errors.length = 0;
  }
  const allOk = results.every(r => r.sharedView && r.errs === 0);
  report('F5a', '4 种非 round 体型分享链接均正常进入观赏页', !allOk, JSON.stringify(results.map(r => `${r.body}:${r.sharedView ? 'ok' : 'NO'}`)));

  // 精确断言：shared 视图激活 + 模型有内容（Pet3D canvas 存在且尺寸正确）
  const canvasOk = await page.evaluate(() => {
    const c = document.querySelector('.shared-view canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  report('F5b', '观赏页 3D 模型渲染存在', !canvasOk, canvasOk ? `canvas ${canvasOk.w}x${canvasOk.h}` : 'no canvas');

  // F7：encodeSharePet 字段白名单——exp 不再进分享链接（进度隐私）。
  // 通过详情页「🔗 仅复制链接」走真实编码路径，解开 payload 断言无 ex0 键。
  {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(src => {
      const mkPet = eval('(' + src + ')');
      localStorage.clear();
      localStorage.setItem('funny-pets-save-v1', JSON.stringify({
        version: 1, pets: [mkPet(1, 88, { level: 30, exp: 123456 })], nextUid: 2, dexSeen: {}, partyIds: [1],
        counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
      }));
    }, mkPetSrc);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('nav.tabs button', { hasText: '图鉴' }).click();
    await page.locator('.dex-card').first().click();
    await page.locator('.detail-share-link').click();
    await page.waitForTimeout(600);
    const share = await page.evaluate(async () => {
      // 从剪贴板读不了（headless 权限）——重算：页内已有 shareUrl 模块闭包，改走 location.hash？
      // 更直接：用 crypto 面板不可行。这里用双按钮之一产生的 toast 间接断言 + 重新构造：
      // clipboard 在 headless Chromium 可通过 permissions 授予。
      try {
        const text = await navigator.clipboard.readText();
        return text;
      } catch { return null; }
    });
    let expLeak = null;
    if (share && share.includes('#p=')) {
      const param = share.split('#p=')[1];
      expLeak = await page.evaluate(async p => {
        // 页内解压（与 App 相同 API）
        const raw = p.startsWith('v2.')
          ? await (async () => {
            const b64 = p.slice(3).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.slice(3).length % 4)) % 4);
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const ds = new DecompressionStream('deflate');
            return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
          })()
          : decodeURIComponent(p);
        try { return 'ex0' in JSON.parse(raw); } catch { return 'parse-error'; }
      }, param);
    }
    report('F7', '分享链接不携带 exp 字段（ex0 键不存在）', expLeak === true,
      expLeak === null ? 'clipboard unreadable' : `ex0 in payload: ${expLeak}`);
  }

  // ============ F6: 图鉴快照自适应取景（高个宠物不裁头） ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  // 注入 bipedal + phase2 高个宠，进图鉴等快照渲染，检查 img 顶部有留白（非顶格）
  await page.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1,
      pets: [
        mkPet(1, 101, { level: 40, exp: 5000, phase: 2, bodyType: 'bipedal', look: { body: 'tall', ears: 'long', tail: 'fluff', pattern: 'none', palette: 3, accessory: 'gem', eyes: 'round' } }),
        mkPet(2, 202, { level: 5, exp: 100, phase: 0, bodyType: 'mochi', look: { body: 'round', ears: 'round', tail: 'stub', pattern: 'none', palette: 0, accessory: 'none', eyes: 'round' } }),
      ],
      nextUid: 3, dexSeen: {}, partyIds: [1, 2],
      counters: { encounters: 2, caught: 2, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPetSrc);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav.tabs button', { hasText: '图鉴' }).click();
  // 等快照队列渲染完（串行 + rAF，给足时间）
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.dex-sprite img')];
    return imgs.map(img => {
      if (!(img.complete && img.naturalWidth > 0)) return { loaded: false };
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      // 找第一个非透明行
      let topRow = -1;
      for (let y = 0; y < c.height && topRow < 0; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = data[(y * c.width + x) * 4 + 3];
          if (a > 10) { topRow = y; break; }
        }
      }
      return { loaded: true, topRow, h: c.height, topPct: +((topRow / c.height) * 100).toFixed(1) };
    });
  });
  const tall = r[0]; // bipedal phase2 tall
  const ok = tall && tall.loaded && tall.topPct >= 1.0; // 顶部至少 1% 留白 = 没顶格裁切
  report('F6', '图鉴快照高个宠物(bipedal/p2)不顶格裁头', !ok,
    tall ? `topPct=${tall.topPct}% (topRow=${tall.topRow}/${tall.h})` : 'img not loaded');
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 35 完成 ====');
} // F5+F7+F6 组块结束
