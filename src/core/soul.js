// 灵魂档案（Soul Profile）：每只精灵的持久化人格系统。
// 设计原则参考 Agent 的 persona + memory 分层：
//   identity  固化身份（生成时确定，永不变化）
//   traits    性格四维（-1..1 浮点，随交互缓慢漂移）
//   memory    三层记忆（profile 固化事实 / episodic 事件 / conversation 对话）
//   relation  与训练家的关系（好感度/称呼/共同经历计数）
//
// 持久化在 localStorage（funny-pets-souls-v1），key = 宠物 uid。
// 进化继承：进化时 soul 随 uid 保留，identity.form 追加进化记录，traits 继承并小幅漂移。

import { reactive } from 'vue';

const SOUL_KEY = 'funny-pets-souls-v1';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(SOUL_KEY)) ?? {};
  } catch {
    return {};
  }
}

let cache = null;
function all() {
  if (!cache) cache = loadAll();
  return cache;
}
function saveAll() {
  try {
    localStorage.setItem(SOUL_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('灵魂档案写入失败', e);
  }
}

// ---- 性格四维（seed 掷点生成，随交互 ±漂移，clamp [-1,1]）----
// warmth    温柔↔高冷（说话距离感）
// energy    沉稳↔活泼（感叹号/短句倾向）
// pride     谦逊↔傲娇（自夸/嘴硬）
// curiosity 专注↔好奇（跑题/提问倾向）
export function rollTraits(seed) {
  // mulberry32 消费 seed，保证同 seed 同性格
  let a = (seed ^ 0x5bd1e995) >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dim = () => +(next() * 2 - 1).toFixed(2);
  return { warmth: dim(), energy: dim(), pride: dim(), curiosity: dim() };
}

// 四维 → 人设描述词（注入 prompt 用）
export function traitLabels(traits) {
  const lbl = (v, neg, mid, pos) => (v < -0.33 ? neg : v > 0.33 ? pos : mid);
  return {
    warmth: lbl(traits.warmth, '高冷疏离', '温和友善', '黏人热情'),
    energy: lbl(traits.energy, '慵懒沉稳', '平稳', '活泼跳脱'),
    pride: lbl(traits.pride, '谦虚随和', '要强', '傲娇自恋'),
    curiosity: lbl(traits.curiosity, '专注执着', '随性', '好奇心爆棚'),
  };
}

// 口癖（seed 决定，进化不变——灵魂连续性）
const VERBAL_TICS = [
  '…的说', '哦！', '嘿嘿。', '——哼！', '呜哇！', '…大概吧', '嗷！', '咕噜…', '！？', '（转圈）', '…哼唧', '嗖——',
];
const LOVES = ['亮晶晶的东西', '晒太阳', '被摸头', '下雨天', '吃零食', '深夜散步', '赢战斗', '整理毛发', '恶作剧', '唱歌（虽然跑调）'];
const HATES = ['被吵醒', '洗澡', '打雷', '被无视', '蔬菜', '孤独', '输战斗', '打针', '限制自由', '无聊'];
const VALUES = [
  '守护重要的人比胜利更重要', '强者才有话语权', '快乐是第一位的', '承诺必须兑现',
  '家是最安全的地方', '变强是为了保护而不是炫耀', '好奇探索一切未知', '复仇不如放下',
  '自由高于一切', '陪伴是最长情的告白',
];

function pickBy(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

/**
 * 生成（或恢复）一只精灵的灵魂档案。
 * @param pet 存档精灵对象（需 uid/seed/name/types/level）
 * @param existing 已有 soul（恢复），否则按 seed 生成
 */
export function ensureSoul(pet, existing) {
  const store = all();
  const key = String(pet.uid);
  if (existing ?? store[key]) {
    const soul = existing ?? store[key];
    store[key] = soul;
    return soul;
  }
  // 生成新灵魂
  let a = (pet.seed ^ 0x1234567) >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const soul = {
    version: 1,
    createdAt: Date.now(),
    identity: {
      origin: pickBy(['出生在' + (pet.caughtMap === 'volcano' ? '火山脚的温泉边' : '微风草原的露水里'), '被雷雨惊醒后学会走路', '从一颗会发光的蛋里孵出来', '在月圆之夜获得意识'], rnd),
      verbalTic: pickBy(VERBAL_TICS, rnd),
      love: pickBy(LOVES, rnd),
      hate: pickBy(HATES, rnd),
      value: pickBy(VALUES, rnd),
      form: '初生',
      forms: ['初生'],
    },
    traits: rollTraits(pet.seed),
    memory: {
      profile: [],     // 固化事实：["训练家喜欢在晚上玩", ...]（LLM 提炼写入，上限 12 条）
      episodic: [],    // 事件：{t, text}（战斗大事件/进化/重要聊天，上限 20 条 FIFO）
    },
    relation: {
      affinity: 20,              // 好感 0-100
      title: '训练家',            // 称呼：随好感进化 训练家→搭档→挚友→家人
      chats: 0, battles: 0, wins: 0, losses: 0,
    },
  };
  store[key] = soul;
  saveAll();
  return soul;
}

export function getSoul(uid) {
  return all()[String(uid)] ?? null;
}

// 临时灵魂（野生精灵战斗心声用）：与 ensureSoul 同构但纯内存——不写 localStorage、
// 没有与训练家的羁绊（野生精灵是自由身），身份更野性
export function makeEphemeralSoul(pet) {
  let a = ((pet.seed ?? 1) * 2654435761 ^ Date.now()) >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    version: 1,
    createdAt: Date.now(),
    identity: {
      origin: pickBy(['独自在荒野长大', '从山洞深处走来', '溪边喝水时被打扰', '领地巡视中', '刚睡醒心情很差', '护崽心切'], rnd),
      verbalTic: pickBy(VERBAL_TICS, rnd),
      love: pickBy(LOVES, rnd),
      hate: pickBy(HATES, rnd),
      value: pickBy(['这片领地不容侵犯', '自由高于一切', '强者才有话语权', '弱者退散', '守护家园天经地义'], rnd),
      form: '野生',
      forms: ['野生'],
    },
    traits: rollTraits(pet.seed ?? 1),
    memory: { profile: [], episodic: [] },
    relation: { affinity: 0, title: '入侵者', chats: 0, battles: 0, wins: 0, losses: 0 },
  };
}

// 删除指定精灵的灵魂档案（放归时调用，避免 localStorage 孤儿数据）
export function forgetSoul(uid) {
  const store = all();
  if (String(uid) in store) {
    delete store[String(uid)];
    saveAll();
  }
}

export function updateSoul(uid, mutator) {
  const store = all();
  const key = String(uid);
  const soul = store[key];
  if (!soul) return null;
  mutator(soul);
  saveAll();
  return soul;
}

// ---- 交互驱动的成长 ----

export function touchRelation(soul, kind, delta = 1) {
  const r = soul.relation;
  if (kind === 'chat') r.chats += delta;
  if (kind === 'battle') r.battles += delta;
  if (kind === 'win') { r.wins += delta; r.affinity = Math.min(100, r.affinity + 1.5); }
  if (kind === 'loss') { r.losses += delta; r.affinity = Math.min(100, r.affinity + 0.5); } // 输了也共患难
  // 称呼随好感进化
  r.title = r.affinity >= 90 ? '家人' : r.affinity >= 65 ? '挚友' : r.affinity >= 35 ? '搭档' : '训练家';
  saveAll();
}

// 性格漂移：每次聊天微调（量级 0.02，方向由交互内容提示词判定由 LLM 返回 drift）
export function driftTraits(soul, drift) {
  if (!drift) return;
  const t = soul.traits;
  for (const k of ['warmth', 'energy', 'pride', 'curiosity']) {
    if (typeof drift[k] === 'number') {
      t[k] = Math.max(-1, Math.min(1, +(t[k] + drift[k] * 0.02).toFixed(3)));
    }
  }
  saveAll();
}

export function addEpisodic(soul, text) {
  soul.memory.episodic.push({ t: Date.now(), text });
  if (soul.memory.episodic.length > 20) soul.memory.episodic.shift();
  saveAll();
}

export function addProfileFact(soul, fact) {
  if (!fact || soul.memory.profile.includes(fact)) return;
  soul.memory.profile.push(fact);
  if (soul.memory.profile.length > 12) soul.memory.profile.shift();
  saveAll();
}

// ---- 进化继承：灵魂连续性 ----
export function onEvolve(soul, newName, phase) {
  soul.identity.forms.push(`${newName}（${phase}阶）`);
  soul.identity.form = `${phase}阶`;
  // 进化带来小幅性格波动
  soul.traits.pride = Math.max(-1, Math.min(1, soul.traits.pride + 0.1));
  soul.traits.energy = Math.max(-1, Math.min(1, soul.traits.energy + (Math.random() - 0.5) * 0.1));
  addEpisodic(soul, `进化成了 ${newName}，感觉力量在体内苏醒。`);
  saveAll();
}

export function exportSouls() {
  return JSON.parse(JSON.stringify(all()));
}

// 导入校验：存档文件是外部输入（可能损坏/被构造），逐条校验 soul 结构，
// 非法条目直接丢弃（regenerate on next ensureSoul），而不是让坏对象进 UI 炸详情页。
function sanitizeSoul(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const id = (s.identity && typeof s.identity === 'object') ? s.identity : {};
  const traits = (s.traits && typeof s.traits === 'object') ? s.traits : {};
  const rel = (s.relation && typeof s.relation === 'object') ? s.relation : {};
  const mem = (s.memory && typeof s.memory === 'object') ? s.memory : {};
  const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : dflt);
  const str = (v, dflt, max) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : dflt);
  return {
    version: 1,
    createdAt: num(s.createdAt, 0, 1e15, Date.now()),
    identity: {
      origin: str(id.origin, '来历不明', 60),
      verbalTic: str(id.verbalTic, '…', 12),
      love: str(id.love, '未知', 20),
      hate: str(id.hate, '未知', 20),
      value: str(id.value, '活下去', 40),
      form: str(id.form, '初生', 12),
      forms: Array.isArray(id.forms) ? id.forms.filter(f => typeof f === 'string').slice(0, 6) : ['初生'],
    },
    traits: {
      warmth: num(traits.warmth, -1, 1, 0),
      energy: num(traits.energy, -1, 1, 0),
      pride: num(traits.pride, -1, 1, 0),
      curiosity: num(traits.curiosity, -1, 1, 0),
    },
    memory: {
      profile: Array.isArray(mem.profile) ? mem.profile.filter(f => typeof f === 'string' && f.trim()).slice(0, 12) : [],
      episodic: Array.isArray(mem.episodic)
        ? mem.episodic.filter(e => e && typeof e === 'object' && typeof e.text === 'string').slice(-20).map(e => ({ t: num(e.t, 0, 1e15, Date.now()), text: e.text.slice(0, 120) }))
        : [],
    },
    relation: {
      affinity: num(rel.affinity, 0, 100, 20),
      title: ['训练家', '搭档', '挚友', '家人'].includes(rel.title) ? rel.title : '训练家',
      chats: num(rel.chats, 0, 1e9, 0),
      battles: num(rel.battles, 0, 1e9, 0),
      wins: num(rel.wins, 0, 1e9, 0),
      losses: num(rel.losses, 0, 1e9, 0),
    },
  };
}

export function importSouls(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const clean = {};
    for (const [k, v] of Object.entries(data).slice(0, 200)) { // 条目上限：防超大对象
      const s = sanitizeSoul(v);
      if (s) clean[k] = s;
    }
    cache = clean;
    saveAll();
  }
}
