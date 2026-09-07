// 成长数值、经验曲线与进化（形态二段进化：种子衍生新形态）。

import { mulberry32, pick } from './rng.js';
import { MOVES } from '../data/moves.js';
import { RARITY_MULT } from './generator.js';

// 升到 level 级所需累计经验：中等曲线 0.8 * level^3
export function expForLevel(level) {
  return Math.round(0.8 * level ** 3);
}

export function statsAt(pet, level) {
  // 等级 1-50；种族值 + 个体值按等级展开 + 性格系数
  const n = pet.nature;
  const ivf = iv => iv / 15; // 0-1
  return {
    hp: Math.round((pet.base.hp + 20 + pet.base.hp * ivf(pet.iv.hp)) * level / 25 + 10) * n.hp,
    atk: Math.round(((pet.base.atk + 10 + pet.base.atk * ivf(pet.iv.atk)) * level / 25 + 5) * n.atk),
    def: Math.round(((pet.base.def + 10 + pet.base.def * ivf(pet.iv.def)) * level / 25 + 5) * n.def),
    spd: Math.round(((pet.base.spd + 10 + pet.base.spd * ivf(pet.iv.spd)) * level / 25 + 5) * n.spd),
  };
}

export const EVOLVE_AT = 18;

// 进化：衍生新种子（原种子 * 7919 + 相位数），保留类型，强化种族与体型变化
export function evolvePet(pet, phase) {
  if (phase === 0) return pet;
  const rng = mulberry32((pet.seed * 7919 + phase * 104729) >>> 0);
  const rm = RARITY_MULT[pet.rarity] * (1 + phase * 0.15);
  const base = {};
  for (const k of ['hp', 'atk', 'def', 'spd']) {
    base[k] = Math.round(pet.base[k] * (1.15 + phase * 0.1) * (0.95 + rng() * 0.1) * rm / RARITY_MULT[pet.rarity]);
  }
  const suffix = phase === 1 ? '纳' : '皇';
  const pool = [...MOVES[pet.types[0]], ...(pet.types[1] ? MOVES[pet.types[1]] : [])];
  const newMove = pick(rng, pool.filter(m => m.power));
  const moves = [...pet.moves];
  if (!moves.find(m => m.name === newMove.name)) moves[moves.length - 1] = newMove;

  return {
    ...pet,
    name: phase === 1 ? pet.name.slice(0, 4) + suffix : pet.name.slice(0, 3) + suffix,
    base,
    phase,
    lore: pet.lore,
    moves,
    look: { ...pet.look, body: pick(rng, ['tall', 'pear', 'drop']) },
  };
}
