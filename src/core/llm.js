// OpenAI 兼容 LLM 客户端：灵魂对话（聊天/战斗/压缩）+ 精灵生成。
// 用户在设置页自填 baseUrl / model / apiKey；任何失败都降级到本地逻辑。

import { TYPES } from '../data/types.js';
import { buildChatMessages, buildTauntMessages, buildCompressMessages, parseSoulReply } from './soulPrompt.js';

const PROMPT = `你是一个原创宠物精灵生成器。请随机生成一只全新的原创精灵，严格输出如下 JSON（不要输出任何其他文字）：
{
  "name": "2-4个汉字的原创名字，必须虚构，禁止使用任何现有动漫/游戏作品中的名称",
  "types": ["从这些属性中选1-2个：${TYPES.join('/')}"],
  "bodyType": "从这些中选一个：quadruped/bipedal/avian/serpent/aquatic/mochi",
  "ears": "从这些中选一个：none/round/pointy/long/fin",
  "tail": "从这些中选一个：none/stub/curl/fluff/spark",
  "pattern": "从这些中选一个：none/spots/stripe/belly",
  "accessory": "从这些中选一个：none/flower/leaf/horn/gem",
  "eyes": "从这些中选一个：dot/round/sleepy/sparkle",
  "lore": "30-60字的原创图鉴描述，写它的栖息地和有趣习性，禁止引用任何现有作品"
}
注意：稀有度不由你决定（由系统掷点），不要输出 rarity 字段。`;

export function isLlmConfigured(cfg) {
  return !!(cfg && cfg.baseUrl && cfg.model);
}

async function chatRequest(cfg, messages, { temperature = 1.1, maxTokens = 400, stream = false, signal } = {}) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model: cfg.model, messages, temperature, max_tokens: maxTokens, stream }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}`);
  return res;
}

// ---- 精灵生成 ----
export async function generatePetWithLlm(cfg, signal) {
  const res = await chatRequest(cfg, [
    { role: 'system', content: '你只输出严格的 JSON，不输出 markdown 代码块或其他文字。' },
    { role: 'user', content: PROMPT },
  ], { signal });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseLlmPet(text);
}

export function parseLlmPet(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM 返回中没有 JSON');
  const raw = JSON.parse(match[0]);

  const name = String(raw.name ?? '').trim().slice(0, 6);
  if (!name) throw new Error('LLM 返回缺少名字');

  const types = (Array.isArray(raw.types) ? raw.types : [raw.types])
    .map(t => String(t)).filter(t => TYPES.includes(t)).slice(0, 2);
  if (!types.length) throw new Error('LLM 返回属性无效');

  const oneOf = (v, pool, dflt) => (pool.includes(v) ? v : dflt);

  return {
    name,
    types,
    bodyType: oneOf(raw.bodyType, ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'], null),
    look: {
      ears: oneOf(raw.ears, ['none', 'round', 'pointy', 'long', 'fin'], 'round'),
      tail: oneOf(raw.tail, ['none', 'stub', 'curl', 'fluff', 'spark'], 'stub'),
      pattern: oneOf(raw.pattern, ['none', 'spots', 'stripe', 'belly'], 'none'),
      accessory: oneOf(raw.accessory, ['none', 'flower', 'leaf', 'horn', 'gem'], 'none'),
      eyes: oneOf(raw.eyes, ['dot', 'round', 'sleepy', 'sparkle'], 'round'),
      palette: Math.floor(Math.random() * 10),
    },
    lore: String(raw.lore ?? '').trim().slice(0, 120),
  };
}

// ---- 灵魂聊天 ----
export async function chatWithSoul(cfg, pet, soul, userText, recentMessages, signal) {
  const res = await chatRequest(cfg, buildChatMessages(pet, soul, userText, recentMessages), {
    temperature: 0.95, maxTokens: 200, signal,
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('LLM 返回为空');
  return parseSoulReply(text);
}

// ---- 灵魂战斗台词（流式）----
// onChunk(delta) 增量回调；结束返回 { body, state }
export async function tauntWithSoul(cfg, pet, soul, scene, signal, onChunk) {
  const res = await chatRequest(cfg, buildTauntMessages(pet, soul, scene), {
    temperature: 1.0, maxTokens: 120, stream: true, signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta) { full += delta; onChunk?.(delta); }
      } catch { /* 忽略不完整 SSE 行 */ }
    }
  }
  // 流式过程中 __STATE__ 行可能已被增量推给 UI；返回前从全文剥掉，最终文本由调用方覆盖
  return parseSoulReply(full);
}

// ---- 记忆压缩：提炼长期记忆事实 ----
export async function compressSoulMemory(cfg, pet, soul, oldSummary, transcript, signal) {
  const res = await chatRequest(cfg, buildCompressMessages(pet, soul, oldSummary, transcript), {
    temperature: 0.4, maxTokens: 200, signal,
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text || text === '无') return [];
  return text.split('\n').map(s => s.replace(/^[-•\d.\s]+/, '').trim()).filter(s => s.length > 3).slice(0, 3);
}

// ---- 本地兜底台词（无 LLM 或失败时；按性格四维选模板） ----
const TAUNT_TEMPLATES = {
  big: ['看我的{move}！{defender}接招吧！', '这招{move}怎么样！', '{defender}，尝尝这个！'],
  normal: ['{move}，上吧！', '就是现在，{move}！', '别小看我，{move}！'],
  weak: ['唔…{move}好像不太管用…', '可恶，{defender}很硬！', '再来一次就有效了！'],
  crit: ['会心一击！看到了吗{defender}！', '完美的一击！'],
  status: ['先强化一下…', '稳住，慢慢来。', '哼哼，有好戏看了。'],
  miss: ['啊！打歪了…', '可恶，躲开了！'],
  lowhp: ['撑住…还不能倒下…', '为了{trainer}，也要站到底！'],
};

export function localTaunt(attacker, defender, moveName, damage, eff, crit, myHpRatio = 1, trainerTitle = '训练家') {
  let pool;
  if (myHpRatio < 0.25) pool = TAUNT_TEMPLATES.lowhp;
  else if (crit) pool = TAUNT_TEMPLATES.crit;
  else if (!damage) pool = TAUNT_TEMPLATES.status;
  else if (eff >= 2 || (eff > 1 && damage > 30)) pool = TAUNT_TEMPLATES.big;
  else if (damage < 12) pool = TAUNT_TEMPLATES.weak;
  else pool = TAUNT_TEMPLATES.normal;
  const t = pool[Math.floor(Math.random() * pool.length)];
  return t.replace(/\{move\}/g, moveName).replace(/\{defender\}/g, defender.name).replace(/\{trainer\}/g, trainerTitle);
}
