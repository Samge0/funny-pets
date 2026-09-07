// OpenAI 兼容 LLM 客户端：生成随机精灵参数。
// 用户在设置页自填 baseUrl / model / apiKey；任何失败都降级到本地生成器。

import { TYPES } from '../data/types.js';

const PROMPT = `你是一个原创宠物精灵生成器。请随机生成一只全新的原创精灵，严格输出如下 JSON（不要输出任何其他文字）：
{
  "name": "2-4个汉字的原创名字，必须虚构，禁止使用任何现有动漫/游戏作品中的名称",
  "types": ["从这些属性中选1-2个：${TYPES.join('/')}"],
  "rarity": "从这些中选一个：common/uncommon/rare/epic/legend",
  "body": "从这些中选一个：round/pear/tall/blob/drop",
  "ears": "从这些中选一个：none/round/pointy/long/fin",
  "tail": "从这些中选一个：none/stub/curl/fluff/spark",
  "pattern": "从这些中选一个：none/spots/stripe/belly",
  "accessory": "从这些中选一个：none/flower/leaf/horn/gem",
  "eyes": "从这些中选一个：dot/round/sleepy/sparkle",
  "lore": "30-60字的原创图鉴描述，写它的栖息地和有趣习性，禁止引用任何现有作品"
}`;

export function isLlmConfigured(cfg) {
  return !!(cfg && cfg.baseUrl && cfg.model);
}

export async function generatePetWithLlm(cfg, signal) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: '你只输出严格的 JSON，不输出 markdown 代码块或其他文字。' },
        { role: 'user', content: PROMPT },
      ],
      temperature: 1.1,
      max_tokens: 400,
    }),
  });
  if (!res.ok) throw new Error(`LLM API ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseLlmPet(text);
}

// 宽松提取 JSON（容忍 ```json 包裹），再逐字段校验/清洗
export function parseLlmPet(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM 返回中没有 JSON');
  const raw = JSON.parse(match[0]);

  const name = String(raw.name ?? '').trim().slice(0, 6);
  if (!name) throw new Error('LLM 返回缺少名字');

  const types = (Array.isArray(raw.types) ? raw.types : [raw.types])
    .map(t => String(t)).filter(t => TYPES.includes(t)).slice(0, 2);
  if (!types.length) throw new Error('LLM 返回属性无效');

  const rarity = ['common', 'uncommon', 'rare', 'epic', 'legend'].includes(raw.rarity) ? raw.rarity : 'common';
  const oneOf = (v, pool, dflt) => (pool.includes(v) ? v : dflt);

  return {
    name,
    types,
    rarity,
    look: {
      body: oneOf(raw.body, ['round', 'pear', 'tall', 'blob', 'drop'], 'round'),
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
