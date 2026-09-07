// 宠物聊天存储与压缩调度：每只宠物独立对话历史，localStorage 持久化，每 20 轮自动压缩。
// 压缩后结构：{ summary: string, messages: [{role, content, t}], total: number }

import { reactive } from 'vue';
import { showToast, persist } from './store.js';

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
  if (!store[uid]) {
    store[uid] = { summary: '', messages: [], total: 0 };
  }
  return store[uid];
}

export function appendChat(uid, role, content) {
  const c = chatOf(uid);
  c.messages.push({ role, content, t: Date.now() });
  c.total++;
  // 控制单宠上限（压缩后 messages 只增 1 条摘要 + 最近对话）
  if (c.messages.length > 60) c.messages.splice(0, c.messages.length - 40);
  writeAll();
  return c;
}

// 压缩调度：返回是否触发了压缩
export function maybeCompress(uid, cfg, pet) {
  const c = chatOf(uid);
  const sinceCompress = c.total - (c.compressedAt ?? 0);
  if (!cfg?.enabled || !cfg?.baseUrl || !cfg?.model) return Promise.resolve(false);
  if (sinceCompress < COMPRESS_EVERY) return Promise.resolve(false);
  if (c.messages.length < 8) return Promise.resolve(false);

  // 异步压缩，不阻塞聊天
  c.compressedAt = c.total; // 先标记避免并发重复触发
  writeAll();
  import('./core/llm.js').then(async ({ compressChatHistory }) => {
    const keep = 6;
    const summaryText = await compressChatHistory(cfg, pet, c.messages, undefined);
    c.summary = (c.summary ? c.summary + '\n' : '') + summaryText;
    c.messages = c.messages.slice(-keep);
    writeAll();
    showToast(`${pet.name} 的回忆被整理好了`, 1800);
  }).catch(err => {
    console.warn('聊天压缩失败（保留原记录）', err);
    c.compressedAt = (c.total - sinceCompress); // 回滚标记
    writeAll();
  });
  return Promise.resolve(true);
}

// 聊天响应式视图（供 UI 绑定）
const reactiveChats = reactive({ version: 0 });
export function touchChats() { reactiveChats.version++; }
export function chatsVersion() { return reactiveChats.version; }

// 导出存档时附带聊天数据（可选导入）
export function exportChats() {
  return JSON.parse(JSON.stringify(all()));
}
export function importChats(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    cache = data;
    writeAll();
  }
}
