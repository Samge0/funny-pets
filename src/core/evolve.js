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
// （v5）进化技能强化已并入 evolvePet：威力统一 +10，不再使用映射表

// ---- 升级吞噬：战利品提案模式 ----
// 不直接修改宠物，而是返回候选列表（offer），由玩家在弹窗里自选哪些入手、替换谁。
// 这样"替换权"在玩家手里：可以新增（技能不设上限）、可以换掉任意槽位。

// 每个战败对手技能的吞噬概率（提升到 60%：连续几场没吞会挫败）
export const DEVOUR_MOVE_CHANCE = 0.6;
// 每个外观部件的掠夺概率（提升到 55%）
export const DEVOUR_PART_CHANCE = 0.55;
// 非升级胜利的常驻吞噬概率（升级前吞噬只在升级时掷——高等级几十场升一级，
// 吞噬体验极度匮乏；改为每场胜利都掷：升级时用上面满档，未升级用这里的常驻档）
export const DEVOUR_MOVE_CHANCE_FLAT = 0.35;
export const DEVOUR_PART_CHANCE_FLAT = 0.3;

// 可掠夺的外观维度（任意部件都能吞，让玩家自由拼装造型）
const DEVOUR_PARTS = ['ears', 'tail', 'accessory', 'pattern', 'eyes', 'body'];

/**
 * 掷出本场胜利可吞的技能候选（不含已学会的）。
 * @param luck 'levelup'=升级满档概率 | 'flat'=常驻档（每场胜利都有机会）
 * @returns 候选招式数组（浅拷贝）
 */
export function offerDevourMoves(pet, defeatedMoves, luck = 'levelup') {
  const chance = luck === 'flat' ? DEVOUR_MOVE_CHANCE_FLAT : DEVOUR_MOVE_CHANCE;
  const offers = [];
  for (const dm of defeatedMoves ?? []) {
    if (Math.random() > chance) continue;
    if (pet.moves.find(m => m.name === dm.name)) continue; // 已有同名跳过
    offers.push({ ...dm });
  }
  return offers;
}

/**
 * 掷出本场胜利可掠夺的外观部件候选（与自身同款或 none 的跳过）。
 * @param luck 'levelup'=升级满档概率 | 'flat'=常驻档
 * @returns [{ part, theirs }] part ∈ look 字段名，theirs 为对手的值
 */
export function offerDevourParts(pet, defeatedLook, luck = 'levelup') {
  const chance = luck === 'flat' ? DEVOUR_PART_CHANCE_FLAT : DEVOUR_PART_CHANCE;
  const offers = [];
  for (const part of DEVOUR_PARTS) {
    const theirs = defeatedLook?.[part];
    if (theirs == null || theirs === '' || theirs === 'none') continue; // 对手没长
    if (pet.look?.[part] === theirs) continue;                          // 同款跳过
    if (Math.random() > chance) continue;
    offers.push({ part, theirs });
  }
  return offers;
}

/**
 * 应用玩家的吞噬选择（在弹窗确认后调用；此函数才是唯一改宠物的地方）。
 * @param pet 目标宠物（会被修改）
 * @param movePicks 要入手的技能名列表（新增或按 index 替换：{name, replaceIndex}）
 * @param partPicks 要入手的部件 [{part, theirs}]
 * @returns 描述文本数组（弹窗展示用）
 */
export function applyDevour(pet, movePicks, partPicks) {
  const desc = [];
  for (const pick of movePicks) {
    if (typeof pick === 'number' || typeof pick === 'string') continue; // 防御
    const mv = { ...pick.move };
    if (pick.replaceIndex != null && pick.replaceIndex >= 0 && pick.replaceIndex < pet.moves.length) {
      const old = pet.moves[pick.replaceIndex].name;
      pet.moves[pick.replaceIndex] = mv;
      desc.push(`${mv.name} 替换了 ${old}`);
    } else {
      pet.moves.push(mv); // 技能不设 4 个上限：可以一直新增
      desc.push(`学会 ${mv.name}`);
    }
  }
  for (const pick of partPicks) {
    const old = pet.look[pick.part];
    pet.look = { ...pet.look, [pick.part]: pick.theirs };
    // 体型（body）在 3D 侧由 bodyType 驱动骨架：同步覆盖才能让吞来的体型真正生效
    if (pick.part === 'body') {
      const BODY_MAP = { round: 'mochi', pear: 'bipedal', tall: 'bipedal', blob: 'quadruped', drop: 'serpent' };
      pet.bodyType = BODY_MAP[pick.theirs] ?? pet.bodyType;
    }
    desc.push(`${PART_LABELS[pick.part] ?? pick.part}: ${old} → ${pick.theirs}`);
  }
  return desc;
}

// 部件候选值中文名（弹窗展示）
export const PART_LABELS = {
  ears: '耳朵', tail: '尾巴', accessory: '饰品',
  pattern: '花纹', eyes: '眼睛', body: '体型',
};


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
  // 进化跃升：现有技能威力 +10（叠加在每级 +3 之上），保持吞噬来的技能也受益
  const moves = pet.moves.map(m => (m.power ? { ...m, power: m.power + 10 } : m));
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

// 升级结算：返回 {leveled, newMoves:[], evolvedTo, levels, statGains}
export function applyExpGain(pet, amount) {
  pet.exp += amount;
  const result = { leveled: false, levels: 0, newMoves: [], evolvedTo: null, statGains: null };
  while (pet.level < 50 && pet.exp >= expForLevel(pet.level + 1)) {
    pet.level++;
    result.leveled = true;
    result.levels++;
    // 每升 1 级：全部攻击技威力 +3（稳定成长）
    const upgradedNames = [];
    pet.moves = pet.moves.map(m => {
      if (!m.power) return m;
      const nm = { ...m, power: m.power + 3 };
      upgradedNames.push(`${nm.name} ${m.power}→${nm.power}`);
      return nm;
    });
    if (upgradedNames.length) result.newMoves.push(...upgradedNames);
    // 升级属性随机掷点（趣味性）：每级 4~8 点总量，随机分配到 HP/攻/防/速
    if (!result.statGains) result.statGains = { hp: 0, atk: 0, def: 0, spd: 0 };
    let pool = 4 + Math.floor(Math.random() * 5); // 4~8
    const keys = ['hp', 'atk', 'def', 'spd'];
    while (pool > 0) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      const add = 1 + Math.floor(Math.random() * Math.min(3, pool)); // 1~3 点
      result.statGains[k] += add;
      pool -= add;
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
