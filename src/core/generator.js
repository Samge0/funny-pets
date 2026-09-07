// 本地精灵生成器：全原创，纯随机组合。
// LLM 路径（llm.js）产出的字段与本模块同构，二者可互换。

import { TYPES, TYPE_COLORS } from '../data/types.js';
import { MAPS, BASE_RARITY_WEIGHT } from '../data/maps.js';
import { MOVES } from '../data/moves.js';
import { NAME_PREFIX, NAME_ROOT, NAME_SUFFIX, LORE_TEMPLATES, fillTemplate, NATURES, RARITIES } from '../data/names.js';
import { BODY_SHAPES, EARS, TAILS, PATTERNS, PALETTES, ACCESSORIES, EYE_STYLES } from '../data/traits.js';
import { mulberry32, pick, pickWeighted, randInt } from './rng.js';

export const RARITY_MULT = { common: 1, uncommon: 1.06, rare: 1.13, epic: 1.2, legend: 1.3 };

export function rollRarity(rng, rarityBonus) {
  const entries = RARITIES.map(r => ({
    value: r.key,
    weight: BASE_RARITY_WEIGHT[r.key] * (rarityBonus?.[r.key] ?? 1),
  }));
  return pickWeighted(rng, entries);
}

export function generatePet(seed, mapId) {
  const map = MAPS.find(m => m.id === mapId) ?? MAPS[0];
  const rng = mulberry32(seed);

  // 属性：40% 概率从地图偏好池取主属性，否则全池随机；30% 概率带副属性
  const primaryType = rng() < 0.4 ? pick(rng, map.favorTypes) : pick(rng, TYPES);
  const secondaryType = rng() < 0.3 ? pick(rng, TYPES.filter(t => t !== primaryType)) : null;
  const types = secondaryType ? [primaryType, secondaryType] : [primaryType];

  const rarity = rollRarity(rng, map.rarityBonus);
  const rarityIdx = RARITIES.findIndex(r => r.key === rarity);

  // 名字：前缀 + 词根 + 偶尔带后缀
  const name = pick(rng, NAME_PREFIX) + pick(rng, NAME_ROOT) + pick(rng, NAME_SUFFIX);

  // 个体值（0-15）与基础种族值（受稀有度加成）
  const iv = { hp: randInt(rng, 0, 15), atk: randInt(rng, 0, 15), def: randInt(rng, 0, 15), spd: randInt(rng, 0, 15) };
  const rm = RARITY_MULT[rarity];
  const base = {
    hp: Math.round(randInt(rng, 45, 75) * rm),
    atk: Math.round(randInt(rng, 40, 70) * rm),
    def: Math.round(randInt(rng, 40, 70) * rm),
    spd: Math.round(randInt(rng, 40, 70) * rm),
  };
  const nature = pick(rng, NATURES);

  // 技能：从主/副属性池各抽，保证至少一个攻击技能
  const pool = [...MOVES[primaryType], ...(secondaryType ? MOVES[secondaryType] : []), ...MOVES['一般']];
  const moves = [];
  while (moves.length < 3) {
    const m = pick(rng, pool);
    if (!moves.find(x => x.name === m.name)) moves.push(m);
  }
  if (!moves.some(m => m.power)) moves[0] = pick(rng, pool.filter(m => m.power));

  // 造型
  const look = {
    body: pick(rng, BODY_SHAPES).key,
    ears: pick(rng, EARS).key,
    tail: pick(rng, TAILS).key,
    pattern: pick(rng, PATTERNS).key,
    palette: randInt(rng, 0, PALETTES.length - 1),
    accessory: pick(rng, ACCESSORIES).key,
    eyes: pick(rng, EYE_STYLES).key,
  };

  // 图鉴描述（本地模板兜底；LLM 成功时会覆盖）
  const lore = fillTemplate(pick(rng, LORE_TEMPLATES), rng);

  const caughtAt = mapId;
  return {
    seed, name, types, rarity, iv, base, nature, moves, look, lore,
    caughtAt, caughtMap: mapId,
  };
}

export function petTypeColor(pet) {
  return TYPE_COLORS[pet.types[0]] ?? '#9fa19f';
}
