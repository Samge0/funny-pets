// 战斗技能特效（v13）：技能属性 → 特效形状/粒子映射。
// 纯数据 + 纯函数，不碰 DOM——渲染由 App.vue 的模板 + base.css 动画承担。
// 设计：18 属性归入 7 个特效家族（同家族共享形状，色彩随属性），必杀技（威力≥70）升级为
// 全屏滤镜+加倍特效。不同属性一眼可辨：形状家族 + 属性色 双通道编码。

import { MOVES } from '../data/moves.js';
import { TYPE_COLORS } from '../data/types.js';
import { ref } from 'vue';

// ---- 特效开关（v13.1）：设置页可关，持久化 localStorage ----
// 关闭=战斗纯文字播报（lunge/hit-flash 基础受击动画保留，那是可玩性反馈不是特效）
const FX_KEY = 'funny-pets-battle-fx-v1';
function readFxPref() {
  try {
    const v = localStorage.getItem(FX_KEY);
    return v === null ? true : v === '1'; // 缺省=开（老玩家无感升级）
  } catch { return true; }
}
export const battleFxEnabled = ref(readFxPref());
export function setBattleFxEnabled(on) {
  battleFxEnabled.value = !!on;
  try { localStorage.setItem(FX_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

// 7 个特效家族：形状枚举（CSS 类名后缀）
// burst=放射粒子 | wave=冲击波环 | bolt=闪电链 | leaf=叶片旋风
// crystal=冰晶碎裂 | magic=魔法环 | quake=地震波
const FAMILY_BY_TYPE = {
  '火': 'burst', '格斗': 'burst',
  '水': 'wave', '冰': 'wave',
  '电': 'bolt',
  '草': 'leaf', '虫': 'leaf', '飞行': 'leaf',
  '超能力': 'magic', '幽灵': 'magic', '恶': 'magic', '妖精': 'magic',
  '地面': 'quake', '岩石': 'quake', '钢': 'quake',
  '毒': 'burst', '龙': 'magic', '一般': 'burst',
};

export function fxColorOf(type) {
  return TYPE_COLORS[type] ?? '#9fa19f';
}

export function fxFamilyOf(type) {
  return FAMILY_BY_TYPE[type] ?? 'burst';
}

/** 技能名 → { type, color, family, ultimate }；未知技能回落一般/burst */
export function moveFx(moveName) {
  for (const [type, moves] of Object.entries(MOVES)) {
    const hit = moves.find(m => m.name === moveName);
    if (hit) {
      return {
        type,
        color: fxColorOf(type),
        family: fxFamilyOf(type),
        ultimate: !!hit.power && hit.power >= 70,
      };
    }
  }
  return { type: '一般', color: fxColorOf('一般'), family: 'burst', ultimate: false };
}

/**
 * 技能释放特效（attacker 视角）：技能属性 + 是否必杀 → 特效数据。
 * 返回 null 表示无特效（理论上不会）。
 */
export function castFx(moveName) {
  const fx = moveFx(moveName);
  return fx;
}

/** 受击爆散粒子（defender 视角）：同一属性色系，粒子数按伤害强度 */
export function hitFx(moveName, damage, crit) {
  const fx = moveFx(moveName);
  const intensity = crit ? 3 : damage >= 30 ? 2 : 1;
  return { ...fx, intensity };
}
