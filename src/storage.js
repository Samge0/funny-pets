// 存档：localStorage + 版本号 + 严格 schema 校验。
// v2：level 上限不变，phase 允许 0-2，加收 collection 元数据。

const SAVE_KEY = 'funny-pets-save-v1';
const LLM_KEY = 'funny-pets-llm-v1';

export function emptySave() {
  return {
    version: 1,
    pets: [],
    nextUid: 1,
    dexSeen: {},
    partyIds: [],
    counters: { encounters: 0, caught: 0, battlesWon: 0, evolutions: 0 },
  };
}

export function validateSave(value) {
  if (!value || typeof value !== 'object') throw new Error('存档不是对象');
  if (value.version !== 1) throw new Error('不支持的存档版本');
  if (!Array.isArray(value.pets)) throw new Error('pets 无效');
  if (!Number.isSafeInteger(value.nextUid) || value.nextUid < 1) throw new Error('nextUid 无效');
  if (!Array.isArray(value.partyIds)) throw new Error('partyIds 无效');
  if (value.partyIds.length > 4) throw new Error('上阵数量超限');
  if (typeof value.dexSeen !== 'object' || value.dexSeen === null) throw new Error('dexSeen 无效');
  if (typeof value.counters !== 'object' || value.counters === null) throw new Error('counters 无效');
  const uids = new Set();
  for (const p of value.pets) {
    if (!p || !Number.isSafeInteger(p.uid) || !Number.isSafeInteger(p.seed) || !Array.isArray(p.types)
      || !Array.isArray(p.moves) || !p.look || typeof p.look !== 'object'
      || !Number.isSafeInteger(p.level) || p.level < 1 || p.level > 50
      || !Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.phase) || p.phase < 0 || p.phase > 2
      || typeof p.name !== 'string') throw new Error(`精灵数据无效 uid=${p?.uid}`);
    if (uids.has(p.uid)) throw new Error('uid 重复');
    uids.add(p.uid);
  }
  for (const id of value.partyIds) {
    if (!uids.has(id)) throw new Error('上阵列表包含未知 uid');
  }
  return value;
}

export function readSave(notify) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return emptySave();
    return validateSave(JSON.parse(raw));
  } catch (error) {
    console.warn('读取存档失败', error);
    notify?.('存档读取失败，已重置。如需找回请勿覆盖导出文件。');
    return emptySave();
  }
}

export function writeSave(save, notify) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    console.warn('写入存档失败', error);
    notify?.('存档写入失败（存储空间不足或隐私模式）');
  }
}

export function readLlmConfig() {
  try {
    const raw = localStorage.getItem(LLM_KEY);
    if (!raw) return { baseUrl: '', model: '', apiKey: '', enabled: false };
    const v = JSON.parse(raw);
    return {
      baseUrl: String(v.baseUrl ?? ''),
      model: String(v.model ?? ''),
      apiKey: String(v.apiKey ?? ''),
      enabled: !!v.enabled,
    };
  } catch {
    return { baseUrl: '', model: '', apiKey: '', enabled: false };
  }
}

export function writeLlmConfig(cfg) {
  try {
    localStorage.setItem(LLM_KEY, JSON.stringify(cfg));
  } catch (error) {
    console.warn('写入 LLM 配置失败', error);
  }
}

// 导出：带 magic 头的 JSON 文本，导入时校验
const EXPORT_MAGIC = 'FUNPETS1';
export function exportSaveText(save) {
  return JSON.stringify({ magic: EXPORT_MAGIC, exportedAt: new Date().toISOString(), data: save }, null, 2);
}

export function importSaveText(text) {
  const parsed = JSON.parse(text);
  if (parsed?.magic !== EXPORT_MAGIC) throw new Error('不是有效的奇幻萌宠存档文件');
  return validateSave(parsed.data);
}
