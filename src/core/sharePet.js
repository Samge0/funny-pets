// 分享链接编解码：宠物数据 → URL hash（#p=...），纯前端无后端。
// 查看者打开后进入只读观赏模式：3D 展示 + 随机跳动 + 点击触发跳动，
// 禁聊天；可用自己的宠物挑战（战斗引擎复用，挑战结果不影响分享者存档）。

// 精简字段名（URL 长度敏感；JSON 键映射表双向）
const FIELDS = {
  n: 'name', s: 'seed', lv: 'level', ph: 'phase', ty: 'types',
  bt: 'bodyType', ra: 'rarity', lk: 'look', ex: 'extraParts', mv: 'moves', lo: 'lore',
  bs: 'base', iv: 'iv', na: 'nature', ex0: 'exp',
};

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
  try {
    const o = JSON.parse(decodeURIComponent(encoded));
    const pet = {};
    for (const [k, full] of Object.entries(FIELDS)) {
      if (o[k] !== undefined) pet[full] = o[k];
    }
    // 校验必备字段
    if (typeof pet.seed !== 'number' || typeof pet.name !== 'string' || !Array.isArray(pet.types) || !pet.moves?.length) return null;
    // look 字段兜底：分享数据缺字段时 3D 渲染不炸（paletteOf/buildPet3D 均有兜底，这里补 look 本体）
    pet.look = {
      body: pet.look?.body ?? 'round',
      ears: pet.look?.ears ?? 'none',
      tail: pet.look?.tail ?? 'none',
      pattern: pet.look?.pattern ?? 'none',
      accessory: pet.look?.accessory ?? 'none',
      eyes: pet.look?.eyes ?? 'round',
      palette: Number.isInteger(pet.look?.palette) ? pet.look.palette : 0,
    };
    pet.hp = undefined; // 战斗时由 withStats 满血计算
    return pet;
  } catch {
    return null;
  }
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
