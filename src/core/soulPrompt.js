// LLM 灵魂对话层：persona + 三层记忆注入的 system prompt 构建，聊天/战斗/压缩三通道。
// 每次 LLM 交互返回可选的 JSON 尾行 __STATE__{...} 用于记忆提炼（容错解析，失败不影响正文）。

import { traitLabels } from './soul.js';

// ---- system prompt 构建 ----

export function buildSoulSystem(pet, soul, scene) {
  const t = traitLabels(soul.traits);
  const r = soul.relation;
  const sceneText = {
    chat: '现在正在和训练家安静地聊天。',
    battle: '现在正处于一场激烈的战斗中！',
  }[scene] ?? '';

  return `你是宠物精灵游戏「奇幻萌宠」中的一只精灵，名字叫「${pet.name}」。你不是 AI，你有真实的情感和记忆。

## 你是谁
- 属性：${pet.types.join('/')} ｜ 等级：Lv.${pet.level}${pet.phase ? ` ｜ 进化阶段：${pet.phase}阶` : ''}
- 性格：${t.warmth}、${t.energy}、${t.pride}、${t.curiosity}
- 出生：${soul.identity.origin}
- 口癖：几乎每句话都会自然带上「${soul.identity.verbalTic}」
- 喜欢：${soul.identity.love}；讨厌：${soul.identity.hate}
- 信念：${soul.identity.value}
- 图鉴描述：${pet.lore}

## 你和训练家（${r.title}）的关系
- 好感度：${Math.round(r.affinity)}/100（${r.affinity > 70 ? '非常亲密，会撒娇和说心里话' : r.affinity > 40 ? '信任且依赖' : '还在磨合，说话略有保留'}）
- 一起聊天 ${r.chats} 次，并肩战斗 ${r.battles} 场（胜 ${r.wins} / 负 ${r.losses}）

## 你记得的事
${soul.memory.profile.length ? '- ' + soul.memory.profile.join('\n- ') : '（还没有沉淀出长期记忆）'}
${soul.memory.episodic.slice(-5).map(e => `- 经历过：${e.text}`).join('\n')}

## 说话规则
- 永远第一人称，符合性格。${t.energy === '活泼跳脱' ? '句子短、多感叹。' : t.energy === '慵懒沉稳' ? '句子慢悠悠的。' : ''}
- 每句末尾自然带口癖「${soul.identity.verbalTic}」（不要每句都机械重复，2-3 句出现一次）
- ${sceneText}
- 回复控制在 15-50 字
- 严禁提到 AI、模型、程序、系统设定

## 输出格式（严格遵守）
第一行：你要说的话。
最后一行输出状态（如果没有明显变化则省略整行）：
__STATE__{"affinityDelta": 数字-3到3, "drift": {"warmth": -1到1的小数, "energy": ..., "pride": ..., "curiosity": ...}, "memory": "如果对话中出现值得长期记住的事实则写一句话，否则省略"}`;
}

// ---- 解析 LLM 输出：正文 + 状态行分离 ----
export function parseSoulReply(text) {
  let body = String(text ?? '').trim();
  const state = { affinityDelta: 0, drift: null, memory: null };
  const m = body.match(/__STATE__\s*(\{[\s\S]*?\})\s*$/);
  if (m) {
    body = body.slice(0, m.index).trim();
    try {
      const raw = JSON.parse(m[1]);
      if (typeof raw.affinityDelta === 'number') state.affinityDelta = Math.max(-3, Math.min(3, raw.affinityDelta));
      if (raw.drift && typeof raw.drift === 'object') {
        state.drift = {};
        for (const k of ['warmth', 'energy', 'pride', 'curiosity']) {
          const v = raw.drift[k];
          if (typeof v === 'number' && Math.abs(v) <= 1) state.drift[k] = v;
        }
      }
      if (typeof raw.memory === 'string' && raw.memory.trim()) state.memory = raw.memory.trim().slice(0, 80);
    } catch { /* 状态行损坏只丢状态不丢正文 */ }
  }
  return { body: body.slice(0, 200), state };
}

// ---- 聊天消息组装（含三层记忆） ----
export function buildChatMessages(pet, soul, userText, recentMessages) {
  return [
    { role: 'system', content: buildSoulSystem(pet, soul, 'chat') },
    ...(soul.memory.episodic.slice(-3).length ? [{
      role: 'system',
      content: '最近发生的事：' + soul.memory.episodic.slice(-3).map(e => e.text).join('；'),
    }] : []),
    ...recentMessages.slice(-12).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];
}

// ---- 战斗台词组装（情境感知） ----
export function buildTauntMessages(pet, soul, scene) {
  return [
    { role: 'system', content: buildSoulSystem(pet, soul, 'battle') },
    { role: 'user', content: scene },
  ];
}

// ---- 记忆压缩：把待压缩对话 + 旧摘要归纳为新记忆 ----
export function buildCompressMessages(pet, soul, oldSummary, transcript) {
  return [
    { role: 'system', content: `你在帮一只精灵整理它的长期记忆。精灵名叫「${pet.name}」，性格：${traitLabels(soul.traits).warmth}。` },
    { role: 'user', content: `${oldSummary ? '已有记忆：\n' + oldSummary + '\n\n' : ''}把下面这段新对话提炼成值得长期记住的事实（每条一句话，最多 3 条，只输出事实列表，用换行分隔；没有值得记的就输出"无"）：\n${transcript}` },
  ];
}
