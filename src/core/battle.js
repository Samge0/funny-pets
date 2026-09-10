// 回合制战斗 v2：宝可梦式伤害公式、加大 HP 池、状态 buff、命中稳定性。
// 战斗返回逐步事件，动画由 UI 层根据事件播放。
// 战报文案走 t()（i18n）：数据层技能名保持中文规范值，显示时经 moveName 映射。

import { effectivenessAgainst } from '../data/types.js';
import { statsAt } from './evolve.js';
import { t, moveName } from './i18n.js';

const EFFECTS = {
  atkup: { label: '攻击上升', stat: 'atk', mult: 1.35 },
  atkdown: { label: '攻击下降', stat: 'atk', mult: 0.72, debuff: true },
  defup: { label: '防御上升', stat: 'def', mult: 1.35 },
  defdown: { label: '防御下降', stat: 'def', mult: 0.72, debuff: true },
  spddown: { label: '速度下降', stat: 'spd', mult: 0.72, debuff: true },
  heal: { label: '回复', heal: 0.4 },
};

const ACCURACY = 0.92; // 攻击基础命中

function statWithBoost(pet, stat) {
  const base = statsAt(pet, pet.level)[stat];
  return base * (pet.boosts?.[stat] ?? 1);
}

export function calcDamage(attacker, defender, move) {
  const as = statsAt(attacker, attacker.level);
  const ds = statsAt(defender, defender.level);
  const atk = as.atk * (attacker.boosts?.atk ?? 1);
  const def = ds.def * (defender.boosts?.def ?? 1);
  const eff = effectivenessAgainst(move.type, defender.types);
  const stab = attacker.types.includes(move.type) ? 1.25 : 1;
  const crit = Math.random() < 0.0625 ? 1.6 : 1;
  const variance = 0.86 + Math.random() * 0.14; // 0.86-1.0
  // 宝可梦式：(2L/5+2)*P*D/H/50 + 2，系数调低适配休闲节奏
  const raw = (((2 * attacker.level) / 5 + 2) * move.power * (atk / Math.max(1, def))) / 28 + 3;
  return {
    damage: Math.max(1, Math.round(raw * eff * stab * crit * variance)),
    eff, crit: crit > 1,
  };
}

// 野生 AI：血量高时偏攻击，血量低时 25% 概率用变化技
// 注意：招式可能来自旧存档（无 type 字段），必须兜底补齐
function pickWildMove(wild) {
  const moves = wild.moves?.length ? wild.moves : [{ name: '扑击', power: 40, type: wild.types[0] }];
  const withType = m => ({ ...m, type: m.type ?? wild.types[0] });
  const hpRatio = wild.hp / Math.max(1, statsAt(wild, wild.level).hp);
  if (hpRatio < 0.4 && Math.random() < 0.25) {
    const status = moves.filter(m => !m.power);
    if (status.length) return withType(status[Math.floor(Math.random() * status.length)]);
  }
  const dmg = moves.filter(m => m.power);
  const pool = dmg.length ? dmg : moves;
  return withType(pool[Math.floor(Math.random() * pool.length)]);
}

function execMove(src, dst, move, isPlayer, events) {
  // 防御式兜底：任何来源的招式都必须有 type（克制表查表依赖）
  if (!move.type) move.type = src.types[0];
  const mv = moveName(move.name); // 显示名（语言映射）
  // 命中判定（变化技必中）
  if (move.power && Math.random() > ACCURACY) {
    events.push({ type: 'miss', side: isPlayer ? 'player' : 'wild', text: t('{name}的{move}没有命中…', { name: src.name, move: mv }) });
    return;
  }
  if (move.power) {
    const r = calcDamage(src, dst, move);
    // 免疫（eff=0）：完全无效——0 伤害、不扣血（此前 Math.max(1,...) 保底让免疫也掉 1 HP，
    // 与战报文案"没有效果"矛盾，免疫形同虚设）
    if (r.eff === 0) {
      events.push({ type: 'damage', side: isPlayer ? 'player' : 'wild', damage: 0, eff: 0, crit: false, moveName: move.name, text: t('这对{name}没有效果…', { name: dst.name }) });
      return;
    }
    dst.hp = Math.max(0, dst.hp - r.damage);
    let text = isPlayer
      ? t('你的{name}使出了{move}，{n} 点伤害', { name: src.name, move: mv, n: r.damage })
      : t('野生的{name}使出了{move}，{n} 点伤害', { name: src.name, move: mv, n: r.damage });
    if (r.crit) text = isPlayer
      ? t('你的{name}使出了{move}！会心一击 {n} 点！', { name: src.name, move: mv, n: r.damage })
      : t('野生的{name}使出了{move}！会心一击 {n} 点！', { name: src.name, move: mv, n: r.damage });
    if (r.eff >= 2) text += t('效果超级拔群！');
    else if (r.eff > 1) text += t('效果拔群！');
    else if (r.eff < 1 && r.eff > 0) text += t('效果不太理想…');
    events.push({ type: 'damage', side: isPlayer ? 'player' : 'wild', damage: r.damage, eff: r.eff, crit: r.crit, moveName: move.name, text });
    if (dst.hp <= 0) {
      events.push({ type: 'faint', side: isPlayer ? 'wild' : 'player', text: t('{name}倒下了！', { name: dst.name }) });
    }
  } else {
    const effRaw = EFFECTS[move.effect] ?? EFFECTS.atkup;
    if (effRaw.heal) {
      const max = statsAt(src, src.level).hp;
      const healed = Math.round(max * effRaw.heal);
      src.hp = Math.min(max, src.hp + healed);
      events.push({ type: 'heal', side: isPlayer ? 'player' : 'wild', amount: healed, text: t('{name}使用{move}，回复了 {n} 点体力', { name: src.name, move: mv, n: healed }) });
    } else if (effRaw.debuff) {
      // 下降类效果（瞪眼/毒雾/怨念等）：作用于对手，而不是给自己挂 debuff
      dst.boosts = dst.boosts ?? {};
      dst.boosts[effRaw.stat] = (dst.boosts[effRaw.stat] ?? 1) * effRaw.mult;
      const stat = t(effRaw.stat === 'atk' ? '攻击' : effRaw.stat === 'def' ? '防御' : '速度');
      events.push({ type: 'buff', side: isPlayer ? 'player' : 'wild', text: t('{name}使用{move}，{target}的{stat}下降了！', { name: src.name, move: mv, target: dst.name, stat }) });
    } else {
      src.boosts = src.boosts ?? {};
      src.boosts[effRaw.stat] = (src.boosts[effRaw.stat] ?? 1) * effRaw.mult;
      events.push({ type: 'buff', side: isPlayer ? 'player' : 'wild', text: t('{name}使用{move}，{effect}！', { name: src.name, move: mv, effect: t(effRaw.label) }) });
    }
  }
}

// playerAction: {type:'move',moveIndex} | {type:'switch',partyIndex,force} | {type:'ball'} | {type:'run'}
export function battleTurn(state, playerAction) {
  const events = [];
  const { active, wild } = state;
  // ended==='switch'（我方倒下待换宠）时，只允许 force 换宠通过
  if (state.ended && !(state.ended === 'switch' && playerAction.type === 'switch' && playerAction.force)) {
    return events;
  }

  if (playerAction.type === 'move') {
    const myBase = active.moves[playerAction.moveIndex];
    const myMove = { ...myBase, type: myBase.type ?? active.types[0] };
    const wildMove = pickWildMove(wild);
    const mySpd = statWithBoost(active, 'spd');
    const wildSpd = statWithBoost(wild, 'spd');
    const playerFirst = mySpd >= wildSpd;

    if (playerFirst) {
      execMove(active, wild, myMove, true, events);
      if (wild.hp > 0) execMove(wild, active, wildMove, false, events);
    } else {
      execMove(wild, active, wildMove, false, events);
      if (active.hp > 0) execMove(active, wild, myMove, true, events);
    }
    const wildDown = wild.hp <= 0;
    const mineDown = active.hp <= 0;
    if (wildDown) state.ended = 'win';
    else if (mineDown) {
      // 检查是否还有可换的宠
      const next = state.party?.find(p => p.uid !== active.uid && p.hp > 0);
      state.ended = next ? 'switch' : 'lose';
    }
  } else if (playerAction.type === 'switch') {
    const next = state.party[playerAction.partyIndex];
    events.push({ type: 'switch', side: 'player', text: t('换上了{name}！', { name: next.name }) });
    state.active = next;
    state.ended = null; // 强制换宠完成，恢复战斗
    // 野生趁机攻击（换上来的精灵先挨打——符合宝可梦规则：换人后对方行动）
    execMove(wild, state.active, pickWildMove(wild), false, events);
    if (state.active.hp <= 0) {
      const another = state.party?.find(p => p.uid !== state.active.uid && p.hp > 0);
      state.ended = another ? 'switch' : 'lose';
      events.push({ type: 'status', text: another ? t('{name} 也倒下了！', { name: state.active.name }) : t('{name} 倒下了，无宠可用…', { name: state.active.name }) });
    }
  } else if (playerAction.type === 'ball') {
    const p = catchChance(wild);
    if (Math.random() < p) {
      state.ended = 'caught';
      events.push({ type: 'ball', caught: true, text: t('精灵球晃了三下——成功捕捉了{name}！！', { name: wild.name }) });
    } else {
      events.push({ type: 'ball', caught: false, text: t('{name}从球里挣脱出来了！', { name: wild.name }) });
      execMove(wild, active, pickWildMove(wild), false, events);
      if (active.hp <= 0) {
        const next = state.party?.find(p => p.uid !== active.uid && p.hp > 0);
        state.ended = next ? 'switch' : 'lose';
      }
    }
  } else if (playerAction.type === 'run') {
    if (Math.random() < 0.75) {
      state.ended = 'ran';
      events.push({ type: 'run', text: t('成功逃走了！') });
    } else {
      events.push({ type: 'run', text: t('没能逃掉！') });
      execMove(wild, active, pickWildMove(wild), false, events);
      if (active.hp <= 0) {
        const next = state.party?.find(p => p.uid !== active.uid && p.hp > 0);
        state.ended = next ? 'switch' : 'lose';
      }
    }
  }
  return events;
}

// 捕获率：血量越低越容易；稀有度修正；休闲向保底
export function catchChance(wild) {
  // wild 可能是裸存档对象（无 maxHp），统一按种族值重算当前最大 HP
  const maxHp = wild.maxHp ?? statsAt(wild, wild.level).hp;
  const hpRatio = wild.hp / Math.max(1, maxHp);
  const rarityFactor = { common: 1.5, uncommon: 1.2, rare: 0.95, epic: 0.7, legend: 0.45 }[wild.rarity] ?? 1;
  const p = Math.min(0.92, Math.max(0.1, (1 - hpRatio * 0.78) * rarityFactor));
  return p;
}

export function newBattleState(active, wild, party = []) {
  return { active, wild, party, ended: null, caughtPet: null, turn: 0 };
}
