// 灵魂聊天调度：三层记忆持久化 + 每 20 轮 LLM 提炼长期记忆。
// 存储结构（funny-pets-chats-v1）：uid -> { messages: [...], total, compressedAt }

import { showToast } from './store.js';

const CHAT_KEY = 'funny-pets-chats-v1';
const COMPRESS_EVERY = 20;

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY)) ?? {};
  } catch {
    return {};
  }
}

let cache = null;
function all() {
  if (!cache) cache = readAll();
  return cache;
}
function writeAll() {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('聊天记录写入失败', e);
  }
}

export function chatOf(uid) {
  const store = all();
  if (!store[uid]) store[uid] = { messages: [], total: 0, compressedAt: 0 };
  return store[uid];
}

// 落盘聊天缓存（供 PetDetail 等外部调用方在批量修改后持久化）
export function persistChat() {
  writeAll();
}

// 删除指定精灵的聊天记录（放归时调用，避免 localStorage 孤儿数据）
export function forgetChat(uid) {
  const store = all();
  if (String(uid) in store) {
    delete store[String(uid)];
    writeAll();
  }
}

export function appendChat(uid, role, content) {
  const c = chatOf(uid);
  c.messages.push({ role, content, t: Date.now() });
  c.total++;
  if (c.messages.length > 60) c.messages.splice(0, c.messages.length - 40);
  writeAll();
  return c;
}

// 每 20 轮触发 LLM 提炼长期记忆 → 写入 soul.memory.profile
export function touch() { /* 兼容占位 */ }
export function maybeCompress(uid, cfg, pet, soul) {
  const c = chatOf(uid);
  const since = c.total - (c.compressedAt ?? 0);
  if (!cfg?.enabled || !cfg?.baseUrl || !cfg?.model) return;
  if (since < COMPRESS_EVERY) return;
  if (c.messages.length < 8) return;

  c.compressedAt = c.total;
  writeAll();
  import('./core/llm.js').then(async ({ compressSoulMemory }) => {
    const keep = 8;
    const toCompress = c.messages.slice(0, c.messages.length - keep);
    const oldFacts = soul.memory.profile.slice(-4);
    const transcript = toCompress.map(m => `${m.role === 'user' ? '训练家' : pet.name}: ${m.content}`).join('\n');
    const facts = await compressSoulMemory(cfg, pet, soul, oldFacts.join('\n'), transcript);
    for (const f of facts) {
      if (!soul.memory.profile.includes(f)) soul.memory.profile.push(f);
    }
    while (soul.memory.profile.length > 12) soul.memory.profile.shift();
    c.messages = c.messages.slice(-keep);
    writeAll();
    if (facts.length) showToast(`${pet.name} 记住了新的东西`, 1800);
  }).catch(err => {
    console.warn('记忆提炼失败（保留原对话）', err);
    c.compressedAt = c.total - since; // 回滚
    writeAll();
  });
}

// 导出所有聊天记录（与存档导出配套；此前 souls 有导出 API 而 chats 没有）
export function exportChats() {
  return JSON.parse(JSON.stringify(all()));
}

// 导入校验：chats 同为外部输入。坏结构被替换为空记录，UI 读到的是安全形态。
export function importChats(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const clean = {};
    for (const [k, v] of Object.entries(data).slice(0, 200)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const msgs = Array.isArray(v.messages)
        ? v.messages.filter(m => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-60)
          .map(m => ({ role: m.role, content: m.content.slice(0, 2000), t: Number.isFinite(m.t) ? m.t : Date.now() }))
        : [];
      clean[k] = { messages: msgs, total: Number.isSafeInteger(v.total) && v.total >= 0 ? v.total : msgs.length, compressedAt: Number.isSafeInteger(v.compressedAt) ? v.compressedAt : 0 };
    }
    cache = clean;
    writeAll();
  }
}
