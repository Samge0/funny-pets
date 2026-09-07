// 全局响应式状态：存档 + 刷新中的野生精灵 + 战斗 + toast。

import { reactive, computed } from 'vue';
import { readSave, writeSave, writeLlmConfig, readLlmConfig } from './storage.js';
import { generatePet } from './core/generator.js';
import { evolvePet, expForLevel, statsAt, EVOLVE_AT } from './core/evolve.js';
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

// ---- 精灵生命周期 ----

// 由刷新点生成野生精灵（LLM 覆盖由调用方处理：生成后改写 name/types/look/lore）
export function spawnWild(mapId, overrides = null) {
  const seed = randomSeed();
  const base = generatePet(seed, mapId);
  const pet = {
    ...base,
    ...overrides,
    seed: overrides?.seed ?? seed,
    level: Math.max(2, Math.round(2 + Math.random() * 8)),
    exp: 0,
    phase: 0,
    hp: 1, // 占位，下面按等级填
  };
  pet.hp = statsAt(pet, pet.level).hp;
  save.dexSeen[seed] = 1;
  save.counters.encounters++;
  persist();
  return pet;
}

export function adoptPet(wild) {
  const uid = save.nextUid++;
  const pet = { ...wild, uid };
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

// 附带战斗面板要用的实时数值（不改存档字段）
export function withStats(pet) {
  const s = statsAt(pet, pet.level);
  return { ...pet, maxHp: s.hp, atkStat: s.atk, defStat: s.def, spdStat: s.spd };
}

export function gainExp(pet, amount) {
  pet.exp += amount;
  let leveled = false;
  while (pet.level < 50 && pet.exp >= expForLevel(pet.level + 1)) {
    pet.level++;
    leveled = true;
  }
  let evolvedTo = null;
  if (leveled && pet.level >= EVOLVE_AT && (pet.phase ?? 0) === 0) {
    const evolved = evolvePet(pet, 1);
    Object.assign(pet, evolved);
    evolvedTo = pet;
  }
  persist();
  return { leveled, evolvedTo };
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
