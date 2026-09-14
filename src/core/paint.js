// 宠物涂色（v12）：为宠物自定义配色。
// 数据模型：look.colors = { body, belly, accent, type }——四个材质槽位。
// 每槽：'#rrggbb' 单色 | { f:'#hex', t:'#hex' } 头→底渐变 | undefined（用默认配色）。
// 不改 palette（基础色盘保留），colors 只做覆盖层；删除槽位=恢复该部位默认色。
//
// 校验原则与 sharePet 一致：白名单 + 严格格式，非法值整体丢弃（不抛错）——
// 涂色是纯外观层，任何脏数据都不该让存档/分享失败。

export const PAINT_SLOTS = [
  { key: 'body',   label: '身体' },
  { key: 'belly',  label: '肚皮' },
  { key: 'accent', label: '点缀' },
  { key: 'type',   label: '属性' },
];
export const PAINT_SLOT_KEYS = PAINT_SLOTS.map(s => s.key);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v) => typeof v === 'string' && HEX_RE.test(v);
export const isGradient = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && isHex(v.f) && isHex(v.t) && v.f.toLowerCase() !== v.t.toLowerCase();

/** 校验并规范化 look.colors；无有效涂色时返回 undefined（节省存档体积）。上限 4 槽全开。 */
export function sanitizeColors(colors) {
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return undefined;
  const out = {};
  for (const key of PAINT_SLOT_KEYS) {
    const v = colors[key];
    if (isHex(v)) out[key] = v.toLowerCase();
    else if (isGradient(v)) out[key] = { f: v.f.toLowerCase(), t: v.t.toLowerCase() };
  }
  return Object.keys(out).length ? out : undefined;
}

/** 涂色是否与默认配色完全一致（无自定义内容） */
export function hasCustomColors(pet) {
  return !!sanitizeColors(pet?.look?.colors);
}

/**
 * 生成涂色后的宠物新 look（纯函数，不落盘）。
 * paint: { body?: '#hex'|{f,t}|null, ... }——null/undefined 槽位=清除该槽恢复默认。
 */
export function applyPaintToLook(look, paint) {
  const next = { ...(look ?? {}) };
  const merged = sanitizeColors(look?.colors) ?? {};
  for (const key of PAINT_SLOT_KEYS) {
    const v = paint?.[key];
    if (v === undefined) continue;           // 未提及=保留现状
    if (isHex(v)) merged[key] = v.toLowerCase();
    else if (isGradient(v)) merged[key] = { f: v.f.toLowerCase(), t: v.t.toLowerCase() };
    else merged[key] = undefined;             // null/非法=清除
  }
  for (const key of PAINT_SLOT_KEYS) if (merged[key] === undefined) delete merged[key];
  const clean = sanitizeColors(merged);
  if (clean) next.colors = clean;
  else delete next.colors;
  return next;
}

/** PetDetail 涂色 tab 的默认填充：当前宠物各槽生效色（供取色器初始值）。
 *  palette 索引 → 十六进制（与 sprite3d paletteOf 同源；type 槽=属性色）。 */
export function currentSlotColors(pet) {
  // 延迟 import 避免 NODE 测试环境拉 three（PALETTES 无依赖，直接 import traits）
  const { PALETTES } = traits();
  const idx = Number.isInteger(pet?.look?.palette) ? ((pet.look.palette % PALETTES.length) + PALETTES.length) % PALETTES.length : 0;
  const pal = PALETTES[idx] ?? PALETTES[0];
  const { TYPE_ACCENT } = sprite3dAccent();
  return {
    body: pal.body,
    belly: pal.belly,
    accent: pal.accent,
    type: TYPE_ACCENT[pet?.types?.[0]] ?? '#9fa19f',
  };
}

// 惰性依赖（避免顶部循环 import / 测试环境问题）
let _traits = null, _accent = null;
function traits() { if (!_traits) _traits = import('../data/traits.js'); return _traits; }
function sprite3dAccent() {
  if (!_accent) {
    // TYPE_ACCENT 与 sprite3d 同源；为避免 import 整个 three，这里复制映射并保持同步
    _accent = Promise.resolve({
      TYPE_ACCENT: {
        '火': '#e8622c', '水': '#2f80d6', '电': '#f4c531', '草': '#4caf50',
        '冰': '#7fd4e8', '格斗': '#b34a2e', '毒': '#9c4ab8', '地面': '#c9a227',
        '飞行': '#8fa8dd', '超能力': '#e8497c', '虫': '#8fa60a', '岩石': '#a38c5d',
        '幽灵': '#6a4a9c', '龙': '#4a3ec8', '恶': '#5a4a42', '钢': '#8f9fa8',
        '妖精': '#e89ec8', '一般': '#9fa19f',
      },
    });
  }
  return _accent;
}

/** 默认色板（给取色器快捷色块） */
export const SWATCHES = [
  '#f4a83c', '#5ab8d8', '#8fce5a', '#e87a9a', '#a88fe0', '#f4d03c',
  '#e8683c', '#6aa8e8', '#90a8b8', '#c8e868',
  '#ffd6e0', '#c3e8ff', '#d8ffd0', '#ffe8c8', '#e8d8ff', '#fff0c8',
  '#ffffff', '#5a4a42', '#2a2a3a', '#e8497c',
];
