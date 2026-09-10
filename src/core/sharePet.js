// 分享链接编解码：宠物数据 → URL hash（#p=...），纯前端无后端。
// 查看者打开后进入只读观赏模式：3D 展示 + 随机跳动 + 点击触发跳动，
// 禁聊天；可用自己的宠物挑战（战斗引擎复用，挑战结果不影响分享者存档）。
//
// 安全（红队审计 2026-09-10）：#p= 是完整的不可信输入面——任何人的浏览器都能构造。
// 此前 decodeSharePet 只校验 4 个字段的类型，导致：
//   - 非法 types（如 "dragonZZZ"）→ CHART[-1] undefined → battleTurn 崩溃/白屏
//   - level=2^53 / power=1e15 / base=1e15 → 数值溢出与 NaN HP 不死怪
//   - 10000 个 moves / 5000 个 extraParts → URL 放大 + 渲染卡死
//   - 缺 base/iv/nature → withStats(statsAt) 读 undefined.hp 直接崩
// 现在按白名单 + 范围严格校验，任何字段越界即整体拒绝（返回 null 走"链接无效"路径）。

import { TYPES } from '../data/types.js';

// 精简字段名（URL 长度敏感；JSON 键映射表双向）
const FIELDS = {
  n: 'name', s: 'seed', lv: 'level', ph: 'phase', ty: 'types',
  bt: 'bodyType', ra: 'rarity', lk: 'look', ex: 'extraParts', mv: 'moves', lo: 'lore',
  bs: 'base', iv: 'iv', na: 'nature', ex0: 'exp',
};

// ---- 白名单（与 data/ 定义保持同源；渲染与战斗只接受这些值）----
const BODY_TYPES = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];
const LOOK_ENUMS = {
  body: ['round', 'slim', 'stocky', 'fluffy', 'exotic'],
  ears: ['none', 'round', 'pointy', 'long', 'fin'],
  tail: ['none', 'stub', 'curl', 'fluff', 'spark'],
  pattern: ['none', 'spots', 'stripe', 'belly'],
  accessory: ['none', 'flower', 'leaf', 'horn', 'gem'],
  eyes: ['dot', 'round', 'sleepy', 'sparkle'],
};
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legend'];
const STAT_KEYS = ['hp', 'atk', 'def', 'spd'];
const LOOK_PARTS = ['ears', 'tail', 'accessory', 'body'];

// 数值夹取：安全整数 + 范围内才接受，否则用默认值
const clampInt = (v, lo, hi, dflt) => (Number.isSafeInteger(v) && v >= lo && v <= hi ? v : dflt);

export function encodeSharePet(pet) {
  const o = {};
  for (const [k, full] of Object.entries(FIELDS)) {
    if (pet[full] !== undefined && pet[full] !== null) o[k] = pet[full];
  }
  // moves 只留 name/type/power（战斗需要），look 原样
  if (Array.isArray(o.mv)) o.mv = o.mv.map(m => ({ name: m.name, type: m.type, power: m.power, priority: m.priority, hits: m.hits })).filter(Boolean);
  const json = JSON.stringify(o);
  return encodeURIComponent(json);
}

export function decodeSharePet(encoded) {
  // 总长度闸门：URL hash 传不了这么多合法数据，超长直接拒（防炸弹/放大）
  if (typeof encoded !== 'string' || encoded.length > 8192) return null;
  let o;
  try {
    o = JSON.parse(decodeURIComponent(encoded));
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;

  const pet = {};
  for (const [k, full] of Object.entries(FIELDS)) {
    if (o[k] !== undefined) pet[full] = o[k];
  }

  // ---- 逐字段白名单校验（失败即拒绝，不给部分通过的机会）----
  if (!Number.isSafeInteger(pet.seed) || pet.seed < 0) return null;
  if (typeof pet.name !== 'string' || !pet.name.trim() || pet.name.length > 12) return null;
  if (!Array.isArray(pet.types) || !pet.types.length || pet.types.length > 2
    || !pet.types.every(t => typeof t === 'string' && TYPES.includes(t))) return null;

  pet.level = clampInt(pet.level, 1, 50, 5);
  pet.phase = clampInt(pet.phase, 0, 2, 0);
  pet.exp = clampInt(pet.exp, 0, 1e9, 0);
  if (pet.rarity !== undefined && !RARITIES.includes(pet.rarity)) pet.rarity = 'common';
  if (pet.bodyType !== undefined && !BODY_TYPES.includes(pet.bodyType)) pet.bodyType = undefined;
  if (typeof pet.lore !== 'string') pet.lore = '';
  pet.lore = pet.lore.slice(0, 120);

  // moves：1-6 个；type 必须合法（战斗克制表查表依赖）；power 夹取
  if (!Array.isArray(pet.moves) || !pet.moves.length) return null;
  const moves = pet.moves.slice(0, 6).filter(m => m && typeof m === 'object');
  if (!moves.length) return null;
  pet.moves = moves.map(m => ({
    name: typeof m.name === 'string' ? m.name.slice(0, 8) : '未知技能',
    type: typeof m.type === 'string' && TYPES.includes(m.type) ? m.type : pet.types[0],
    power: Number.isSafeInteger(m.power) ? Math.min(Math.max(m.power, 0), 250) : (m.power == null ? null : 40),
    priority: Number.isSafeInteger(m.priority) ? Math.min(Math.max(m.priority, -3), 3) : undefined,
    hits: Number.isSafeInteger(m.hits) ? Math.min(Math.max(m.hits, 1), 5) : undefined,
  }));

  // look：逐维度白名单（缺省兜底不变；枚举外一律回落 none/round/0）
  const lk = (pet.look && typeof pet.look === 'object' && !Array.isArray(pet.look)) ? pet.look : {};
  const oneOf = (v, pool, dflt) => (typeof v === 'string' && pool.includes(v) ? v : dflt);
  pet.look = {
    body: oneOf(lk.body, LOOK_ENUMS.body, 'round'),
    ears: oneOf(lk.ears, LOOK_ENUMS.ears, 'none'),
    tail: oneOf(lk.tail, LOOK_ENUMS.tail, 'none'),
    pattern: oneOf(lk.pattern, LOOK_ENUMS.pattern, 'none'),
    accessory: oneOf(lk.accessory, LOOK_ENUMS.accessory, 'none'),
    eyes: oneOf(lk.eyes, LOOK_ENUMS.eyes, 'round'),
    palette: clampInt(lk.palette, 0, 9, 0),
  };

  // extraParts：上限 8 件（渲染叠件锚点按 index 布局，超大数组会拖垮渲染）
  if (Array.isArray(pet.extraParts)) {
    pet.extraParts = pet.extraParts
      .filter(e => e && typeof e === 'object' && LOOK_PARTS.includes(e.part)
        && LOOK_ENUMS[e.part] && LOOK_ENUMS[e.part].includes(e.value))
      .slice(0, 8)
      .map(e => ({ part: e.part, value: e.value }));
  } else {
    pet.extraParts = [];
  }

  // base/iv/nature：挑战路径 withStats→statsAt 必需；缺失或非法时按等级生成保守默认值
  const num01 = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
  const bs = (pet.base && typeof pet.base === 'object' && !Array.isArray(pet.base)) ? pet.base : {};
  const iv = (pet.iv && typeof pet.iv === 'object' && !Array.isArray(pet.iv)) ? pet.iv : {};
  pet.base = {};
  pet.iv = {};
  for (const k of STAT_KEYS) {
    pet.base[k] = clampInt(bs[k], 1, 150, 50);
    pet.iv[k] = clampInt(iv[k], 0, 15, 8);
  }
  const na = (pet.nature && typeof pet.nature === 'object' && !Array.isArray(pet.nature)) ? pet.nature : {};
  pet.nature = { name: '平衡' };
  for (const k of STAT_KEYS) {
    const v = na[k];
    pet.nature[k] = (typeof v === 'number' && Number.isFinite(v)) ? Math.min(Math.max(v, 0.8), 1.2) : 1;
  }

  pet.hp = undefined; // 战斗时由 withStats 满血计算
  return pet;
}

// 生成完整分享 URL
export function shareUrl(pet) {
  const u = new URL(location.href);
  u.hash = 'p=' + encodeSharePet(pet);
  return u.toString();
}

// 启动时解析（main.js 或 App 挂载时调用一次）
export function readSharedFromHash() {
  const m = location.hash.match(/^#p=(.+)$/);
  if (!m) return null;
  const pet = decodeSharePet(m[1]);
  return pet ? { pet, raw: m[1] } : null;
}
