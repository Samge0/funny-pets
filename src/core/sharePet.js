// 分享链接编解码：宠物数据 → URL hash，纯前端无后端。
// 查看者打开后进入只读观赏模式：3D 展示 + 随机跳动 + 点击触发跳动，
// 禁聊天；可用自己的宠物挑战（战斗引擎复用，挑战结果不影响分享者存档）。
//
// v2 编码（2026-09-10）：明文 JSON → deflate 压缩 → base64url。
// 目的：① 链接短且不透明（明文 JSON 里的名字/描述/数值直接暴露在 URL 里，
// 分享出去观感差）；② deflate 对这种重复键 JSON 压缩率 ~60-75%。
// 格式：#p=v2.<base64url>（v2 前缀区分版本；无前缀 = v1 明文，继续兼容读取）。
// 兼容性：CompressionStream/DecompressionStream 浏览器 2023 起全支持（Chrome 80+/
// Firefox 113+/Safari 16.4+）；Node 18+ 原生（deep-test 可直接跑）。都不在时降级 v1 明文。
//
// 安全（红队审计 2026-09-10）：#p= 是完整的不可信输入面——任何人的浏览器都能构造。
// decode 侧不关心载荷是压缩还是明文：解出对象后走同一套白名单校验，
// 任何字段越界即整体拒绝（返回 null 走"链接无效"路径）。

import { TYPES } from '../data/types.js';

// ---- 精简字段名（URL 长度敏感；JSON 键映射表双向）----
// 注意：全字段导出会把 lore（图鉴描述）原样带上——分享链接是公开可见的，
// 与 v2 压缩"不透明"目标一致；字段名缩写降低可读性但非加密。
const FIELDS = {
  n: 'name', s: 'seed', lv: 'level', ph: 'phase', ty: 'types',
  bt: 'bodyType', ra: 'rarity', lk: 'look', ex: 'extraParts', mv: 'moves', lo: 'lore',
  bs: 'base', iv: 'iv', na: 'nature', ex0: 'exp',
};

// 分享编码前的字段级脱敏：exp 不进链接。
// exp 是纯养成进度（渲染与战斗都不读它——statsAt 只用 level），分享链接却把它
// 原样带出去：链接给谁，谁就能解开压缩看你练到多少经验（进度隐私）。
// base/iv/nature 保留：挑战战斗需要它们还原好友精灵的真实数值（核心玩法）。
export function encodeSharePet(pet) {
  const o = {};
  // 允许进入分享链接的字段白名单（exp/ex0 排除）
  const SHARE_FIELDS = ['n', 's', 'lv', 'ph', 'ty', 'bt', 'ra', 'lk', 'ex', 'mv', 'lo', 'bs', 'iv', 'na'];
  for (const [k, full] of Object.entries(FIELDS)) {
    if (!SHARE_FIELDS.includes(k)) continue;
    if (pet[full] !== undefined && pet[full] !== null) o[k] = pet[full];
  }
  // moves 只留 name/type/power（战斗需要）
  if (Array.isArray(o.mv)) o.mv = o.mv.map(m => ({ name: m.name, type: m.type, power: m.power, priority: m.priority, hits: m.hits })).filter(Boolean);
  return o; // 明文对象；压缩/编码在 encodeShareParam 里做
}

// ---- 白名单（与 data/ 定义保持同源；渲染与战斗只接受这些值）----
// 红队审计 2026-09-10（Z轮）：body 白名单此前抄错成 slim/stocky/fluffy/exotic——
// 真实数据源 traits.js BODY_SHAPES 是 round/pear/tall/blob/drop。白名单外的值会被
// 兜底成 'round'，所有分享出去的 pear/tall/blob/drop 体型在接收端全部静默变成圆滚滚。
const BODY_TYPES = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];
const LOOK_ENUMS = {
  body: ['round', 'pear', 'tall', 'blob', 'drop'],
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

// ---- v2 压缩编解码（deflate + base64url，无 padding）----
function bytesToB64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa 输出含 +/=：URL 安全替换 + 去 padding
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hasCompressionStreams = typeof CompressionStream === 'function'
  && typeof DecompressionStream === 'function';

async function deflateBytes(text) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
async function inflateBytes(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

// 总长度闸门（压缩后）：正常分享压缩后 <1KB；>8192 无一例外是攻击载荷
const MAX_ENCODED = 8192;

/** v2：对象 → 压缩 base64url 参数（异步）。环境不支持时降级 v1 JSON。 */
export async function encodeShareParam(pet) {
  const o = encodeSharePet(pet);
  const json = JSON.stringify(o);
  if (hasCompressionStreams) {
    try {
      const compressed = await deflateBytes(json);
      const param = 'v2.' + bytesToB64Url(compressed);
      // 压缩后反而更长（极小载荷理论可能）：取短者
      const plain = encodeURIComponent(json);
      return param.length <= plain.length ? param : json;
    } catch { /* 压缩失败降级明文 */ }
  }
  return json;
}

/** 入口统一解码：v2.<b64url> → inflate；v1 明文 JSON → 直接 parse。异步。 */
export async function decodeShareParam(param) {
  if (typeof param !== 'string' || !param.length || param.length > MAX_ENCODED) return null;
  let json = null;
  if (param.startsWith('v2.')) {
    if (!hasCompressionStreams) return null;
    try {
      json = await inflateBytes(b64UrlToBytes(param.slice(3)));
    } catch {
      return null; // 损坏/伪造的压缩流
    }
  } else {
    json = param; // v1 明文（可能是 encodeURIComponent 过的 JSON）
    if (json.startsWith('%7B') || json.startsWith('%5B')) {
      try { json = decodeURIComponent(json); } catch { return null; }
    }
  }
  let o;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  return o;
}

// ---- 校验：v1/v2 共用（decodeSharePet 保留同步版本供旧调用方/测试）----
function validatePet(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;

  const pet = {};
  for (const [k, full] of Object.entries(FIELDS)) {
    if (o[k] !== undefined) pet[full] = o[k];
  }

  // ---- 逐字段白名单校验（失败即拒绝，不给部分通过的机会）----
  if (!Number.isSafeInteger(pet.seed) || pet.seed < 0) return null;
  // 名字上限 24：与 parseLlmPet 对齐（i18n 后 LLM 会起英文长名，"Crystal Petal
  // Drifter" 21 字符在此被拒 → 整条分享链接判无效。上限只防滥用，不砍正常名）
  if (typeof pet.name !== 'string' || !pet.name.trim() || pet.name.length > 24) return null;
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

// v1 同步解码（明文路径；保留给旧签名调用方，内部走同一套校验）
export function decodeSharePet(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_ENCODED) return null;
  let o = null;
  try {
    o = JSON.parse(decodeURIComponent(encoded));
  } catch {
    return null;
  }
  return validatePet(o);
}

// v2 异步解码（入口统一路径）
export async function decodeSharePetAsync(encoded) {
  const o = await decodeShareParam(encoded);
  return o ? validatePet(o) : null;
}

// 生成完整分享 URL（异步：v2 压缩）
export async function shareUrl(pet) {
  const u = new URL(location.href);
  u.hash = 'p=' + await encodeShareParam(pet);
  return u.toString();
}

// ---- 赠送链接（#g=）：与分享同载荷同校验，仅意图不同 ----
// 纯前端无后端：赠送=好友打开链接「领取」一只克隆（发宠方不失去宠物）。
// 领取侧 decode 走同一套 validatePet 白名单——#g= 与 #p= 一样是不可信输入面。
export async function giftUrl(pet) {
  const u = new URL(location.href);
  u.hash = 'g=' + await encodeShareParam(pet);
  return u.toString();
}

// 启动时解析分享/赠送链接（main.js 或 App 挂载时调用一次；异步版）
export async function readSharedFromHash() {
  const m = location.hash.match(/^#p=(.+)$/);
  if (!m) return null;
  const pet = await decodeSharePetAsync(m[1]);
  return pet ? { pet, raw: m[1] } : null;
}

// 赠送链接解析：返回 { pet, raw } 或 null（坏载荷走"链接无效"路径）
export async function readGiftFromHash() {
  const m = location.hash.match(/^#g=(.+)$/);
  if (!m) return null;
  const pet = await decodeSharePetAsync(m[1]);
  return pet ? { pet, raw: m[1] } : null;
}
