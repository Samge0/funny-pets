// 回合制战斗：我方上场1只 vs 野生精灵。速度决定先手；可换宠/捕捉/逃跑。

import { effectivenessAgainst } from '../data/types.js';
import { statsAt } from './evolve.js';

const EFFECTS = {
  atkup: { label: '攻击上升', stat: 'atk', mult: 1.3 },
  atkdown: { label: '攻击下降', stat: 'atk', mult: 0.75 },
  defup: { label: '防御上升', stat: 'def', mult: 1.3 },
  defdown: { label: '防御下降', stat: 'def', mult: 0.75 },
  spddown: { label: '速度下降', stat: 'spd', mult: 0.75 },
  heal: { label: '回复', heal: 0.35 },
};

function damage(attacker, defender, move) {
  if (!move.power) return { damage: 0, eff: 1 };
  const as = statsAt(attacker, attacker.level);
  const ds = statsAt(defender, defender.level);
  const eff = effectivenessAgainst(move._type ?? attacker.types[0], defender.types);
  const stab = attacker.types.includes(move._type ?? attacker.types[0]) ? 1.2 : 1;
  const crit = Math.random() < 0.0625 ? 1.5 : 1;
  const variance = 0.85 + Math.random() * 0.15;
  const base = (as.atk * move.power * 0.18) / (1 + ds.def * 0.02);
  return {
    damage: Math.max(1, Math.round(base * eff * stab * crit * variance)),
    eff,
    crit: crit > 1,
  };
}

// 逐步推演一回合，返回事件数组供 UI 展示
// playerAction: { type: 'move', moveIndex } | { type: 'switch', petId } | { type: 'ball' } | { type: 'run' }
export function battleTurn(state, playerAction) {
  const events = [];
  const { active, wild } = state;

  const doMove = (src, dst, move, isPlayer) => {
    if (move.power) {
      move._type = move._type ?? src.types[0];
      const r = damage(src, dst, move);
      dst.hp = Math.max(0, dst.hp - r.damage);
      let text = `${isPlayer ? '你的' : '野生的'}${src.name}使用${move.name}，造成 ${r.damage} 点伤害`;
      if (r.crit) text += '（会心一击！）';
      if (r.eff > 1) text += '效果拔群！';
      if (r.eff === 0) text = `${isPlayer ? '你的' : '野生的'}${src.name}使用${move.name}…没有效果…`;
      else if (r.eff < 1) text += '效果不太理想…';
      events.push({ type: 'damage', text });
    } else {
      const eff = EFFECTS[move.effect] ?? EFFECTS.atkup;
      if (eff.heal) {
        const max = statsAt(src, src.level).hp;
        src.hp = Math.min(max, src.hp + Math.round(max * eff.heal));
        events.push({ type: 'status', text: `${src.name}使用${move.name}，回复了体力` });
      } else {
        src.boosts = src.boosts ?? {};
        src.boosts[eff.stat] = (src.boosts[eff.stat] ?? 1) * eff.mult;
        events.push({ type: 'status', text: `${src.name}使用${move.name}，${eff.label}` });
      }
    }
  };

  if (playerAction.type === 'move') {
    const myMove = { ...active.moves[playerAction.moveIndex], _type: active.moves[playerAction.moveIndex]._type ?? active.types[0] };
    const wildMove = pickWildMove(wild);
    const mySpd = (active.boosts?.spd ?? 1), wildSpd = (wild.boosts?.spd ?? 1);
    const playerFirst = statsAt(active, active.level).spd * mySpd >= statsAt(wild, wild.level).spd * wildSpd;
    const order = playerFirst ? [[active, wild, myMove, true], [wild, active, wildMove, false]]
                              : [[wild, active, wildMove, false], [active, wild, myMove, true]];
    for (const [src, dst, mv, isP] of order) {
      if (src.hp <= 0 || dst.hp <= 0 || state.ended) continue;
      doMove(src, dst, mv, isP);
      if (dst.hp <= 0) {
        events.push({ type: 'faint', text: `${dst.name}倒下了！`, side: isP ? 'wild' : 'player' });
        state.ended = isP ? 'win' : 'lose';
      }
    }
  } else if (playerAction.type === 'ball') {
    const result = throwBall(state);
    events.push({ type: 'ball', text: result.text, caught: result.caught });
    if (result.caught) { state.ended = 'caught'; state.caughtPet = wild; }
    else if (result.wildTurn) doMove(wild, active, pickWildMove(wild), false);
  } else if (playerAction.type === 'switch') {
    events.push({ type: 'status', text: `换上了${playerAction.pet.name}！` });
    state.active = playerAction.pet;
    doMove(wild, state.active, pickWildMove(wild), false);
  } else if (playerAction.type === 'run') {
    if (Math.random() < 0.7) { state.ended = 'ran'; events.push({ type: 'run', text: '成功逃走了！' }); }
    else {
      events.push({ type: 'run', text: '没能逃掉！' });
      doMove(wild, active, pickWildMove(wild), false);
    }
  }
  return events;
}

function pickWildMove(wild) {
  const usable = wild.moves.filter(m => m.power) .length ? wild.moves : [{ name: '扑击', power: 40 }];
  return { ...usable[Math.floor(Math.random() * usable.length)] };
}

// 捕获概率：血量越低、稀有度越低越容易；休闲向，保底 8%
export function catchChance(wild) {
  const hpRatio = wild.hp / Math.max(1, statsAt(wild, wild.level).hp);
  const rarityFactor = { common: 1.5, uncommon: 1.2, rare: 0.9, epic: 0.6, legend: 0.35 }[wild.rarity] ?? 1;
  const p = Math.min(0.95, Math.max(0.08, (1 - hpRatio * 0.8) * rarityFactor));
  return p;
}

function throwBall(state) {
  const wild = state.wild;
  const p = catchChance(wild);
  if (Math.random() < p) {
    return { caught: true, text: `成功捕捉了${wild.name}！` };
  }
  return { caught: false, wildTurn: true, text: `${wild.name}挣脱了精灵球！` };
}

export function newBattleState(playerPet, wildPet) {
  return { active: playerPet, wild: wildPet, ended: null, caughtPet: null };
}
