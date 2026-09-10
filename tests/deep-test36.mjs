// 深度测试 36（G 轮·赠送功能 2026-09-10）：宠物赠送入口 + 领取克隆
// G1 详情页有「🎁 赠送」按钮（与分享并排），点击生成 #g= 赠送链接并复制
// G2 领取：打开 #g= 链接 → 赠送领取页（3D 展示 + 领取按钮）；点领取 → 入档、
//    队伍/图鉴可见、uid 是领取人自己的新 uid；赠送者存档不受影响（纯克隆）
// G3 赠送链接不含赠送者 LLM 配置（llm 完全不出现在 payload）
// G4 重复领取防护：同一链接领取后按钮变已领取，再开同链接提示已领过（本地去重）
// G5 非法 #g= 载荷（坏 JSON/数值炸弹）不崩、不进存档
// G6 领取后宠物可开详情聊天（LLM 用领取人配置——llmConfig 是本地的，天然不泄赠送者）
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
const base = `http://127.0.0.1:${server.address().port}/funny-pets/app/`;

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
  uid, seed, name: `礼${uid}`, types: ['火'], rarity: 'rare',
  iv: { hp: 12, atk: 12, def: 9, spd: 10 }, base: { hp: 66, atk: 62, def: 58, spd: 60 },
  nature: { name: '开朗', hp: 1.0, atk: 1.1, def: 0.95, spd: 1.15 },
  moves: [{ name: '火花', power: 45, type: '火' }, { name: '喷射火焰', power: 75, type: '火' }, { name: '聚气', power: null, effect: 'atkup', type: '火' }],
  look: { body: 'pear', ears: 'long', tail: 'fluff', pattern: 'stripe', palette: 5, accessory: 'gem', eyes: 'sparkle' },
  lore: '赠送测试精灵。', caughtAt: 'volcano', caughtMap: 'volcano', level: 25, exp: 5000, phase: 1, ...over,
});
const mkPetSrc = mkPet.toString();

const donorSave = JSON.stringify({
  version: 1, pets: [mkPet(7, 1234)], nextUid: 8, dexSeen: {}, partyIds: [7],
  counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
});

// ============ G1: 详情页赠送按钮 → 生成 #g= 链接 ============
await page.goto(base, { waitUntil: 'networkidle' });
{
  await page.evaluate(({ src, save }) => {
    localStorage.clear();
    localStorage.setItem('funny-pets-save-v1', save);
  }, { src: mkPetSrc, save: donorSave });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('nav.tabs button', { hasText: '图鉴' }).click();
  await page.locator('.dex-card').first().click();
  await page.locator('.detail-card').waitFor({ timeout: 5000 });
  const giftBtn = page.locator('.detail-gift');
  const hasBtn = await giftBtn.count();
  report('G1a', '详情页存在「赠送」按钮', hasBtn === 0, `giftBtn=${hasBtn}`);
  if (hasBtn) {
    await giftBtn.click();
    await page.waitForTimeout(600);
    const clip = await page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return null; }
    });
    const isGiftLink = !!(clip && clip.includes('#g='));
    report('G1b', '赠送点击后复制 #g= 链接', !isGiftLink, clip ? clip.slice(0, 80) : 'clipboard null');

    // G3: 链接 payload 不含 llm 字样（apiKey/baseUrl/model 都不可能出现）
    if (isGiftLink) {
      const param = clip.split('#g=')[1];
      const low = param.toLowerCase();
      const leak = /apikey|baseurl|bearer/.test(low);
      report('G3', '赠送链接不含 LLM 配置痕迹', leak, `leak=${leak}`);
    }
  }
}

// ============ G2: 领取克隆（独立 context 模拟领取人——localStorage 隔离） ============
{
  const rctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1180, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const receiver = await rctx.newPage();
  const rErrors = [];
  receiver.on('pageerror', e => rErrors.push(e.message));
  receiver.on('dialog', d => d.accept().catch(() => {}));
  await receiver.goto(base, { waitUntil: 'networkidle' });
  // 领取人先有自己的存档和一只宠
  await receiver.evaluate(src => {
    const mkPet = eval('(' + src + ')');
    localStorage.setItem('funny-pets-save-v1', JSON.stringify({
      version: 1, pets: [mkPet(1, 999, { name: '自己的', level: 10 })], nextUid: 2, dexSeen: {}, partyIds: [1],
      counters: { encounters: 1, caught: 1, battlesWon: 0, evolutions: 0 },
    }));
  }, mkPetSrc);
  // 关键：注入存档后必须 reload——后续 goto(giftLink) 与当前页只差 hash，
  // 是同文档导航不会重载页面，App 内存 save 还是注入前的旧状态
  await receiver.reload({ waitUntil: 'networkidle' });

  // 从赠送者页面拿链接（剪贴板是多行文案+URL，取最后一个 http 链接行）
  const clip = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return null; }
  });
  const link = (clip?.match(/https?:\/\/\S+/g) ?? [])[0] ?? null;
  if (!link || !link.includes('#g=')) {
    report('G2', '领取克隆全流程（前置：无赠送链接，跳过）', false, 'no gift link');
  } else {
    await receiver.goto(link, { waitUntil: 'networkidle' });
    await receiver.waitForTimeout(700);
    const giftView = await receiver.locator('.gift-view').count();
    const claimBtn = await receiver.locator('.gift-claim').count();
    report('G2a', '打开赠送链接进入赠送领取页', giftView === 0, `giftView=${giftView}, claimBtn=${claimBtn}`);
    if (claimBtn) {
      await receiver.locator('.gift-claim').first().click();
      await receiver.waitForTimeout(800);
      // 庆祝弹窗（领取也应有仪式感）→ 关掉
      if (await receiver.locator('.cele-btn').count()) {
        await receiver.locator('.cele-btn').dispatchEvent('click');
        await receiver.waitForTimeout(400);
      }
      const stored = await receiver.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));
      // 找名字匹配且 uid != 1（领取人原有宠 uid=1，克隆应是新分配的 uid=2）
      const got = (stored.pets ?? []).find(p => p.name === '礼7' && p.uid !== 1);
      report('G2b', '领取后克隆入档（名字找到）', !got, got ? `uid=${got.uid}, lv=${got.level}, moves=${got.moves?.length}` : 'not found');
      if (got) {
        report('G2c', '克隆 uid 是领取人新 uid（非赠送者 uid=7）', got.uid === 7, `uid=${got.uid} (expect 2, donor=7)`);
        report('G2d', '克隆保留外观/等级/技能', !(got.look?.body === 'pear' && got.level === 25 && got.moves?.length >= 3),
          `body=${got.look?.body}, lv=${got.level}, moves=${got.moves?.length}`);
        report('G2e', '克隆不带战斗残留（hp 字段不存在）', 'hp' in got, `hp=${got.hp}`);
        report('G2f', '领取计数 caught +1', stored.counters?.caught !== 2, `caught=${stored.counters?.caught}`);
      }
      // G4: 同一链接再开 → 提示已领取
      await receiver.goto(link, { waitUntil: 'networkidle' });
      await receiver.waitForTimeout(700);
      const toastOrDisabled = await receiver.evaluate(() => {
        const t = document.body.textContent;
        return t.includes('已经领取过') || t.includes('已领取');
      });
      report('G4', '同链接重复领取被拦截（提示已领过）', !toastOrDisabled, `hintShown=${toastOrDisabled}`);
    }
  }
  report('G2-err', '领取流程无页面错误', rErrors.length > 0, rErrors.slice(0, 2).join(' | ') || 'clean');
  await receiver.close();
  await rctx.close();
}

// ============ G5: 非法 #g= 载荷不崩不进档 ============
{
  // G1 打开的详情弹窗若还在，会拦截点击——先关掉再进入 G5
  if (await page.locator('.detail-close').count()) {
    await page.locator('.detail-close').click();
    await page.waitForTimeout(300);
  }
  const evilPayloads = [
    ['坏JSON', '%%%not-json%%%'],
    ['v2坏流', 'v2.!!!!not-base64!!!!'],
  ];
  for (const [label, payload] of evilPayloads) {
    await page.goto(base + '#g=' + encodeURIComponent(payload), { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({
      appAlive: !!document.querySelector('.shell'),
      giftView: !!document.querySelector('.gift-view'),
      toast: document.body.textContent.includes('无效'),
      pets: JSON.parse(localStorage.getItem('funny-pets-save-v1') || '{"pets":[]}').pets.length,
    }));
    const bad = errors.length > 0 || !st.appAlive || st.giftView;
    report(`G5(${label})`, `非法赠送链接不崩不进领取页（${label}）`, bad,
      `giftView=${st.giftView}, pets=${st.pets}, errs=${errors.length}, toast=${st.toast}`);
    errors.length = 0;
  }
  // 数值炸弹：与 #p= 分享同语义——白名单夹取净化后允许进领取页（观赏无害），
  // 但领取入档后数值必须已被夹取到安全范围（1e15 级别数值不允许落地）。
  {
    const bomb = { n: '炸', s: 1, lv: 9007199254740993, ty: ['火'], mv: [{ name: 'x', type: '火', power: 1e9 }], bs: { hp: 1e9, atk: 1e9, def: 1e9, spd: 1e9 }, iv: { hp: 1e9, atk: 1e9, def: 1e9, spd: 1e9 } };
    await page.goto(base + '#g=' + encodeURIComponent(JSON.stringify(bomb)), { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const noCrash = errors.length === 0 && await page.locator('.gift-view').count();
    report('G5(数值炸弹)', '数值炸弹不崩（净化后可展示）', !noCrash, `giftView=${noCrash ? 1 : 0}, errs=${errors.length}`);
    errors.length = 0;
    if (noCrash) {
      await page.locator('.gift-claim').first().click();
      await page.waitForTimeout(600);
      if (await page.locator('.cele-btn').count()) {
        await page.locator('.cele-btn').dispatchEvent('click');
        await page.waitForTimeout(300);
      }
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('funny-pets-save-v1')));
      const bomb2 = (stored.pets ?? []).find(p => p.name === '炸');
      const safe = bomb2 && bomb2.level <= 50 && bomb2.moves?.every(m => (m.power ?? 0) <= 250)
        && ['hp', 'atk', 'def', 'spd'].every(k => bomb2.base[k] <= 150 && bomb2.iv[k] <= 15);
      report('G5(数值炸弹领取)', '领取数值炸弹后入档值全部被夹取', !safe,
        bomb2 ? `lv=${bomb2.level}, power=${bomb2.moves?.[0]?.power}, base.hp=${bomb2.base?.hp}, iv.hp=${bomb2.iv?.hp}` : 'not found');
      errors.length = 0;
    }
  }
}

if (errors.length) console.log('\n页面错误:\n' + errors.join('\n'));
await browser.close(); server.close();
console.log('\n==== 深度检查 36 完成 ====');
