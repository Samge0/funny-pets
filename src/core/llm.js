// OpenAI 兼容 LLM 客户端：生成随机精灵参数 + 宠物聊天 + 战斗吐槽。
// 用户在设置页自填 baseUrl / model / apiKey；任何失败都降级到本地逻辑。

import { TYPES } from '../data/types.js';

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

export async function generatePetWithLlm(cfg, signal) {
  const res = await chatRequest(cfg, [
    { role: 'system', content: '你只输出严格的 JSON，不输出 markdown 代码块或其他文字。' },
    { role: 'user', content: PROMPT },
  ], { signal });
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

// ---- 宠物聊天（非流式，简短回复） ----

// 单只宠物的对话历史（存在 save.pets[i].chats）
export function buildChatMessages(pet, userText, history) {
  const sys = `你是宠物精灵游戏「奇幻萌宠」中一只名叫「${pet.name}」的精灵（属性：${pet.types.join('/')}，性格：${pet.nature?.name ?? '可爱'}，图鉴描述：${pet.lore}）。
你在和你的人类训练家聊天。要求：
- 用第一人称，口吻符合你的属性和性格（如水系温柔、火系热烈、幽灵系调皮）
- 回复简短（15-40字），可以带一点语气词和表情符号
- 不要说自己是 AI 或语言模型，始终以精灵身份说话`;
  return [
    { role: 'system', content: sys },
    ...history.slice(-12).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];
}

export async function chatWithLlm(cfg, pet, userText, history, signal) {
  const res = await chatRequest(cfg, buildChatMessages(pet, userText, history), {
    temperature: 0.9, maxTokens: 120, signal,
  });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('LLM 返回为空');
  return text.slice(0, 200);
}

// 每 20 轮对话压缩上下文：把旧摘要 + 最近对话交给 LLM 归纳成一段简短记忆
export async function compressChatHistory(cfg, pet, history, signal) {
  const keep = 6; // 保留最近 6 条
  const toCompress = history.slice(0, history.length - keep);
  const summary = history.summaryText ?? '';
  const transcript = toCompress.map(m => `${m.role === 'user' ? '训练家' : pet.name}: ${m.content}`).join('\n');
  const messages = [
    { role: 'system', content: '把以下宠物与训练家的对话归纳为一段 80 字以内的第三人称记忆摘要（保留重要事实、约定、性格表现），只输出摘要本身。' },
    { role: 'user', content: (summary ? `已有摘要：${summary}\n\n` : '') + `新对话：\n${transcript}` },
  ];
  const res = await chatRequest(cfg, messages, { temperature: 0.5, maxTokens: 160, signal });
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('压缩失败');
  return text.slice(0, 300);
}

// ---- 战斗吐槽（流式输出） ----

export function buildTauntMessages(attacker, defender, moveName, damage, eff, context) {
  const effText = eff >= 2 ? '效果超级拔群' : eff > 1 ? '效果拔群' : eff === 0 ? '完全没有效果' : eff < 1 ? '效果不太理想' : '效果一般';
  return [
    { role: 'system', content: `你是宠物精灵游戏中的精灵「${attacker.name}」（属性：${attacker.types.join('/')}），正在与「${defender.name}」(${defender.types.join('/')}) 战斗。你刚使用了技能「${moveName}」，${damage > 0 ? `造成 ${damage} 点伤害，${effText}` : '这是变化类招式'}。请以 ${attacker.name} 的第一人称说一句战斗台词：简短（10-25字）、有性格（根据属性拟人化）、可以得意/懊恼/挑衅。只输出台词本身。` },
    ...(context ? [{ role: 'user', content: context }] : [{ role: 'user', content: '请说台词' }]),
  ];
}

// 流式吐词：onChunk(deltaText) 每次增量回调；返回完整文本
export async function tauntWithLlm(cfg, attacker, defender, moveName, damage, eff, signal, onChunk) {
  const messages = buildTauntMessages(attacker, defender, moveName, damage, eff);
  const res = await chatRequest(cfg, messages, {
    temperature: 1.0, maxTokens: 80, stream: true, signal,
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
        if (delta) {
          full += delta;
          onChunk?.(delta);
        }
      } catch { /* 忽略不完整行 */ }
    }
  }
  return full.replace(/^["'「]|["'」]$/g, '').slice(0, 80);
}

// 本地兜底吐槽模板（无 LLM 或失败时）
const TAUNT_TEMPLATES = {
  big: ['看我的{move}！{defender}接招吧！', '这招{move}怎么样！', '{defender}，尝尝这个！'],
  normal: ['{move}，上吧！', '就是现在，{move}！', '别小看我，{move}！'],
  weak: ['唔…{move}好像不太管用…', '可恶，{defender}很硬！', '再来一次就有效了！'],
  crit: ['会心一击！看到了吗{defender}！', '完美的一击！'],
  status: ['先强化一下…', '稳住，慢慢来。', '哼哼，有好戏看了。'],
  miss: ['啊！打歪了…', '可恶，躲开了！'],
};

export function localTaunt(attacker, defender, moveName, damage, eff, crit) {
  let pool;
  if (crit) pool = TAUNT_TEMPLATES.crit;
  else if (!damage) pool = TAUNT_TEMPLATES.status;
  else if (eff >= 2 || (eff > 1 && damage > 30)) pool = TAUNT_TEMPLATES.big;
  else if (damage < 12) pool = TAUNT_TEMPLATES.weak;
  else pool = TAUNT_TEMPLATES.normal;
  const t = pool[Math.floor(Math.random() * pool.length)];
  return t.replace(/\{move\}/g, moveName).replace(/\{defender\}/g, defender.name);
}
