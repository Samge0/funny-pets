// 成长数值、经验曲线与进化（36 级二阶段进化）。
// 进化强化：种族值提升、技能升级（威力提升）或新增第 4 技能、外形特征追加。

import { mulberry32, pick, randInt } from './rng.js';
import { MOVES } from '../data/moves.js';
import { RARITY_MULT } from './generator.js';

// 累计经验：中速曲线 0.9 * level^2.6
export function expForLevel(level) {
  return Math.round(0.9 * Math.pow(level, 2.6));
}

export function statsAt(pet, level) {
  const n = pet.nature;
  const ivf = iv => iv / 15;
  // HP 池显著加大：战斗多回合化（数值级 30~90+）
  const hp = Math.round(((pet.base.hp + 30 + pet.base.hp * ivf(pet.iv.hp) * 1.6) * level) / 16 + 22);
  const atk = Math.round(((pet.base.atk + 12 + pet.base.atk * ivf(pet.iv.atk)) * level) / 22 + 8);
  const def = Math.round(((pet.base.def + 12 + pet.base.def * ivf(pet.iv.def)) * level) / 22 + 8);
  const spd = Math.round(((pet.base.spd + 12 + pet.base.spd * ivf(pet.iv.spd)) * level) / 22 + 8);
  return {
    hp: Math.round(hp * n.hp),
    atk: Math.round(atk * n.atk),
    def: Math.round(def * n.def),
    spd: Math.round(spd * n.spd),
  };
}

export const EVOLVE_AT = [18, 36];

// 技能升级表：进化时威力普适上调
const MOVE_UPGRADE = { 40: 55, 45: 60, 50: 65, 55: 70, 70: 82, 75: 88, 80: 95 };

function upgradeMove(move) {
  if (!move.power) return move;
  return { ...move, power: MOVE_UPGRADE[move.power] ?? move.power + 8 };
}

export function evolvePet(pet, phase) {
  if (phase === 0) return pet;
  const rng = mulberry32((pet.seed * 7919 + phase * 104729) >>> 0);
  const growth = 1.18 + phase * 0.12;
  const base = {};
  for (const k of ['hp', 'atk', 'def', 'spd']) {
    base[k] = Math.round(pet.base[k] * growth * (0.96 + rng() * 0.08));
  }

  // 名字进化后缀
  const suffix = phase === 1 ? '纳' : '皇';
  const stem = pet.name.replace(/(纳|皇)$/, '');
  const name = stem.slice(0, 4) + suffix;

  // 技能：全部升级威力 + 50% 概率把最后一个槽替换为本属性更强的攻击技
  const pool = [...MOVES[pet.types[0]], ...(pet.types[1] ? MOVES[pet.types[1]] : [])];
  const moves = pet.moves.map(upgradeMove);
  if (rng() < 0.5) {
    const stronger = pick(rng, pool.filter(m => m.power));
    if (!moves.find(m => m.name === stronger.name)) moves[moves.length - 1] = { ...stronger };
  }

  return {
    ...pet,
    name, base, phase,
    moves,
    lore: phase === 1 ? `进化后的${pet.name}。` + pet.lore : pet.lore,
    look: { ...pet.look, body: pick(rng, ['tall', 'pear', 'drop']) },
  };
}

// 升级结算：返回 {leveled, newMoves:[], evolvedTo, levels}
export function applyExpGain(pet, amount) {
  pet.exp += amount;
  const result = { leveled: false, levels: 0, newMoves: [], evolvedTo: null };
  while (pet.level < 50 && pet.exp >= expForLevel(pet.level + 1)) {
    pet.level++;
    result.leveled = true;
    result.levels++;
    // 升级 30% 概率随机强化一个技能（威力+6）
    if (Math.random() < 0.3) {
      const powered = pet.moves.map(m => ({ ...m, power: m.power ? m.power + 6 : null }));
      const upgraded = powered.filter((m, i) => m.power && m.power !== pet.moves[i].power);
      if (upgraded.length) {
        const m = upgraded[0];
        result.newMoves.push(`${m.name} 威力提升至 ${m.power}`);
        pet.moves = powered;
      }
    }
    const nextPhase = (pet.phase ?? 0) + 1;
    if (EVOLVE_AT[pet.phase ?? 0] !== undefined && pet.level >= EVOLVE_AT[pet.phase ?? 0] && (pet.phase ?? 0) < 2) {
      const evolved = evolvePet(pet, nextPhase);
      Object.assign(pet, evolved);
      result.evolvedTo = pet;
    }
  }
  return result;
}
