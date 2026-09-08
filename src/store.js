// 全局响应式状态：存档 + 刷新中的野生精灵 + 战斗 + toast。
// v2：加入捕捉/进化庆祝弹窗状态、收集目标、战斗动画事件流。

import { reactive, computed } from 'vue';
import { readSave, writeSave, writeLlmConfig, readLlmConfig } from './storage.js';
import { generatePet } from './core/generator.js';
import { applyExpGain, statsAt } from './core/evolve.js';
import { MAPS } from './data/maps.js';
import { randomSeed } from './core/rng.js';
import { RARITIES } from './data/names.js';

export const toast = reactive({ text: '', timer: null });
export function showToast(text, ms = 2600) {
  toast.text = text;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toast.text = ''; }, ms);
}

export const save = reactive(readSave(showToast));

let persistTimer = null;
export function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => writeSave(save, showToast), 150);
}

// ---- 全屏庆祝弹窗状态（捕捉/进化/升级共用） ----
export const celebration = reactive({ show: false, kind: null, pet: null, detail: null });
export function celebrate(kind, pet, detail = null) {
  celebration.kind = kind;
  celebration.pet = pet;
  celebration.detail = detail;
  celebration.show = true;
}
export function closeCelebration() {
  celebration.show = false;
  celebration.kind = null;
  celebration.pet = null;
  celebration.detail = null;
}

// ---- 精灵生命周期 ----

export function spawnWild(mapId, overrides = null) {
  const seed = randomSeed();
  const base = generatePet(seed, mapId);
  const pet = {
    ...base,
    ...overrides,
    seed: overrides?.seed ?? seed,
    level: mapLevelRoll(mapId),
    exp: 0,
    phase: 0,
    hp: 1,
  };
  pet.hp = statsAt(pet, pet.level).hp;
  // 图鉴计数按"这只精灵的 seed"记录：LLM 覆盖不会改变 seed，同 seed 重遇不重复计数
  save.dexSeen[pet.seed] = 1;
  save.counters.encounters++;
  persist();
  return pet;
}

// 地图等级带：越往后地图野生精灵等级越高
const MAP_LEVEL = { meadow: [3, 9], shore: [7, 14], cave: [12, 20], volcano: [17, 26], forest: [22, 32], peak: [27, 38] };
export function mapLevelRoll(mapId) {
  const [lo, hi] = MAP_LEVEL[mapId] ?? [3, 9];
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
export function mapLevelRange(mapId) {
  return MAP_LEVEL[mapId] ?? [3, 9];
}

export function adoptPet(wild) {
  // 防御：nextUid 落后于已有 uid（手改存档/旧版本数据）时先追平，避免 uid 冲突互相覆盖
  const maxUid = save.pets.reduce((m, p) => Math.max(m, p.uid), 0);
  if (save.nextUid <= maxUid) save.nextUid = maxUid + 1;
  const uid = save.nextUid++;
  // 剥离战斗态字段：捕捉入档即满血新生（此前战斗中捕捉会带残血永久入档，
  // 而游戏没有治疗机制——休闲设计为下场战斗自动满血，两者必须一致）
  const pet = { ...wild, uid };
  delete pet.hp;
  delete pet.boosts;
  save.pets.push(pet);
  save.counters.caught++;
  if (save.partyIds.length < 4) save.partyIds.push(uid);
  persist();
  return pet;
}

export function petByUid(uid) {
  return save.pets.find(p => p.uid === uid) ?? null;
}

export const party = computed(() =>
  save.partyIds.map(id => petByUid(id)).filter(Boolean).map(p => withStats(p))
);

export function withStats(pet) {
  const s = statsAt(pet, pet.level);
  return { ...pet, maxHp: s.hp, atkStat: s.atk, defStat: s.def, spdStat: s.spd };
}

export function gainExp(pet, amount) {
  const r = applyExpGain(pet, amount);
  persist();
  return r;
}

export function rarityInfo(key) {
  return RARITIES.find(r => r.key === key) ?? RARITIES[0];
}

export function mapInfo(id) {
  return MAPS.find(m => m.id === id) ?? MAPS[0];
}

export function isMapUnlocked(map) {
  return save.counters.caught >= map.unlockAt;
}

// ---- LLM 配置 ----
export const llmConfig = reactive(readLlmConfig());
export function saveLlmConfig() {
  writeLlmConfig({ ...llmConfig });
}
