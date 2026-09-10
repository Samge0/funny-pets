// 语言偏好 + UI 全量国际化（gettext 风格：中文原文即 key）。
//
// 分层设计：
//   1. UI 文案：t('中文原文') —— zh 直接返回 key（零字典），en/ja/zh-TW 全量翻译，
//      其余语言回落 en。带 {param} 插值。
//   2. 实体名显示映射：typeName/moveName/mapName/rarityName/natureName/partLabel/
//      traitLabel/relationTitle —— 数据层（存档/引擎/克勤表）保持中文规范值不动
//      （老存档兼容），仅在显示时映射。
//   3. LLM 输出语言：langDirective() 注入 prompt（上轮已做）。
//
// 切换即时生效：locale 是 Vue ref，模板里的 t() 调用成为响应式依赖，
// setLocale 后全部视图自动重渲染。document.title 同步更新。

import { ref } from 'vue';

const LANG_KEY = 'funny-pets-lang-v1';
// auto 标记值：跟随浏览器语言。首次访问（无存储）= auto；
// 手动选定具体语言后存具体 code。「跟随浏览器」在 UI 是可再选的显式选项。
const AUTO = 'auto';

export const LANGUAGES = [
  { code: 'auto', label: '🌐 跟随浏览器 / Auto' },
  { code: 'zh', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁體）' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'tr', label: 'Türkçe' },
];

const LANG_DIRECTIVE = {
  zh: '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語',
  ko: '한국어（韩语）', es: 'Español（西班牙语）', fr: 'Français（法语）',
  de: 'Deutsch（德语）', pt: 'Português（葡萄牙语）', it: 'Italiano（意大利语）',
  ru: 'Русский（俄语）', ar: 'العربية（阿拉伯语）', hi: 'हिन्दी（印地语）',
  th: 'ไทย（泰语）', vi: 'Tiếng Việt（越南语）', id: 'Bahasa Indonesia（印尼语）',
  tr: 'Türkçe（土耳其语）',
};

const VALID = LANGUAGES.map(l => l.code);

function fromBrowser() {
  const cands = (typeof navigator !== 'undefined' && navigator.languages?.length)
    ? navigator.languages : (typeof navigator !== 'undefined' && navigator.language ? [navigator.language] : []);
  for (const raw of cands) {
    if (!raw) continue;
    const tag = String(raw);
    if (VALID.includes(tag)) return tag;
    const primary = tag.split('-')[0];
    if (primary === 'zh') return /tw|hant/i.test(tag) ? 'zh-TW' : 'zh';
    if (VALID.includes(primary)) return primary;
  }
  return 'zh';
}

// 存储值（'auto' 或具体 code）→ 实际生效 locale
function resolveLocale() {
  let stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
  if (stored && stored !== AUTO && VALID.includes(stored)) return stored; // 手动锁定
  return fromBrowser(); // auto / 无存储 / 坏值：跟随浏览器
}

/** 当前 locale（响应式）：模板中的 t() 依赖它，切换即全局重渲染 */
export const locale = ref(resolveLocale());
// 下拉框绑定值（auto 或具体 code）——与 locale 分离：auto 时下拉显示 auto，
// 实际语言仍随浏览器解析
export const langPrefValue = ref(readStoredOrAuto());

function readStoredOrAuto() {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw === AUTO || (raw && VALID.includes(raw))) return raw;
  } catch { /* ignore */ }
  return AUTO;
}

export function setLocale(code) {
  if (!VALID.includes(code)) return false;
  langPrefValue.value = code;
  locale.value = (code === AUTO) ? fromBrowser() : code;
  try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.title = t('app.title');
  return true;
}

// 兼容上轮 API
export function readLangPref() { return langPrefValue.value; }
export function writeLangPref(code) { return setLocale(code); }
export function langDirective() { return LANG_DIRECTIVE[locale.value] ?? LANG_DIRECTIVE.zh; }

// ============ 翻译词典（key = 中文原文；未收录 = 原样返回） ============
const EN = {
  'app.title': 'FunPets · Fantasy Pet Adventure',
  'app.brand': 'FunPets',
  // nav
  '地图': 'Map', '相遇': 'Encounter', '图鉴': 'Collection', '设置': 'Settings', '🐾 分享宠': '🐾 Shared',
  // map view
  '点击地图探索 · 已捕捉 {c}/{g} 只 · 遭遇 {e} 次 · 进化 {v} 次': 'Tap a map to explore · Caught {c}/{g} · Encounters {e} · Evolutions {v}',
  '🔒 捕捉 {n} 只解锁': '🔒 Unlock at {n} caught',
  '野生 Lv.{a}-{b}': 'Wild Lv.{a}-{b}',
  '草丛沙沙作响…': 'Rustling in the grass…',
  '「{map}」尚未解锁：需要捕捉满 {n} 只精灵，还差 {d} 只（当前 {c}/{n}）': '"{map}" is locked: catch {n} pets to unlock, {d} more to go ({c}/{n})',
  // shared / gift views
  '🐾 来自好友分享的精灵 · 点击它会跳一下': '🐾 A pet shared by a friend · Tap it and it hops',
  '🎁 好友赠送的精灵 · 点击它会跳一下': '🎁 A gift from a friend · Tap it and it hops',
  '⚔️ 用我的精灵挑战': '⚔️ Challenge with my pet',
  '返回游戏': 'Back to game',
  '🎁 领取它！': '🎁 Adopt it!',
  '✅ 已领取': '✅ Claimed',
  '你已经领取过这只精灵啦': 'You have already claimed this pet',
  '来自好友的赠送，加入你的队伍！': 'A gift from a friend — welcome to your team!',
  '链接无效或已损坏': 'This link is invalid or corrupted',
  '你还没有精灵！点「返回游戏」→ 点地图去捕捉一只，再回来挑战': 'You have no pets yet! Tap "Back to game" → catch one on the map, then come back',
  // encounter
  '开战（打残再捕更容易）': 'Battle (weaken it first)',
  '直接丢球（剩{n}）': 'Throw ball ({n} left)',
  '直接丢球': 'Throw ball',
  '离开': 'Leave',
  '精灵球用完了！开战打残它再捕，或换只精灵刷新重置': 'Out of balls! Battle to weaken it, or refresh for a new pet',
  '{name} 警觉起来了！球用完了——开战削弱它再捕吧': '{name} is on guard! Out of balls — battle to weaken it first',
  '{name} 挣脱了精灵球！（剩余 {n} 次机会）': '{name} broke free! ({n} tries left)',
  '还没有精灵伙伴！先丢球捕捉一只吧': 'No pets yet! Throw a ball to catch one',
  '队伍已休整完毕！': 'Your team is fully rested!',
  // battle
  '哪只精灵继续战斗？': 'Which pet keeps fighting?',
  '换上哪只精灵？（换宠会消耗本回合，对方趁机攻击）': 'Switch in which pet? (Switching costs the turn — the foe attacks)',
  '已倒下': 'Fainted',
  '威力 {n}': 'Power {n}', '变化': 'Status', '变化技': 'Status move',
  '丢球': 'Ball', '换宠': 'Switch', '逃跑': 'Run', '取消': 'Cancel',
  ' 只可用': ' available',
  '换宠 只可用': 'Switch · {n} available',
  '切换出战精灵（换上后对方会趁机攻击）': 'Switch pet (the foe attacks as you switch)',
  '{name} 倒下了，请选择下一只精灵！': '{name} fainted — choose the next pet!',
  '{name} 倒下了！换其他精灵继续战斗': '{name} fainted! Switch to another pet',
  '成功逃走了！': 'Got away safely!',
  '战斗出现异常，已终止本场': 'Battle error — this match has ended',
  ' 会心!': ' CRIT!',
  // battle events (battle.js)
  '{name}的{move}没有命中…': "{name}'s {move} missed…",
  '这对{name}没有效果…': 'It has no effect on {name}…',
  '你的{name}使出了{move}，{n} 点伤害': 'Your {name} used {move} — {n} damage',
  '野生的{name}使出了{move}，{n} 点伤害': 'Wild {name} used {move} — {n} damage',
  '你的{name}使出了{move}！会心一击 {n} 点！': 'Your {name} used {move}! Critical hit — {n}!',
  '野生的{name}使出了{move}！会心一击 {n} 点！': 'Wild {name} used {move}! Critical hit — {n}!',
  '效果超级拔群！': "It's super effective!",
  '效果拔群！': "It's effective!",
  '效果不太理想…': "It's not very effective…",
  '效果一般': 'normal effectiveness',
  '{name}倒下了！': '{name} fainted!',
  '{name}使用{move}，回复了 {n} 点体力': '{name} used {move} and restored {n} HP',
  '{name}使用{move}，{target}的{stat}{dir}！': '{name} used {move} — {target}\'s {stat} {dir}!',
  '{name}使用{move}，{effect}！': '{name} used {move} — {effect}!',
  '上升': 'rose', '下降': 'fell',
  '攻击上升': 'Attack rose', '攻击下降': 'Attack fell', '防御上升': 'Defense rose',
  '防御下降': 'Defense fell', '速度下降': 'Speed fell', '回复': 'Recovery',
  '换上了{name}！': '{name} was sent out!',
  '{name} 也倒下了！': '{name} also fainted!',
  '{name} 倒下了，无宠可用…': '{name} fainted — no pets left…',
  '精灵球晃了三下——成功捕捉了{name}！！': 'The ball wobbled three times — {name} was caught!!',
  '{name}从球里挣脱出来了！': '{name} broke out of the ball!',
  '没能逃掉！': "Couldn't get away!",
  // win/lose/levelup
  '进化成了 {name}！灵魂也成长了': '{name} evolved! Its soul grew too',
  '{name} 升到了 Lv.{lv}！获得 {exp} 点经验': '{name} reached Lv.{lv}! +{exp} EXP',
  '{name} 战胜了 {foe}，+{exp} 经验': '{name} defeated {foe}! +{exp} EXP',
  '队伍中的 {name} 进化了！': '{name} on your team evolved!',
  '虽然输了，但 {name} 进化了！': 'You lost, but {name} evolved!',
  '全军覆没…精灵们休息了一会儿又满血复活（休闲模式）': 'All pets fainted… they took a rest and came back fully healed (casual mode)',
  '{name} 吞噬成功！{desc}': '{name} devoured! {desc}',
  '加入你的队伍！': 'joined your team!',
  '好友的精灵不能被捕捉！': "You can't catch a friend's pet!",
  // dex
  '已遇见 {s} 种 · 已捕捉 {c}/{g} · 上阵 {p}/4（点击卡片切换上阵 · 按钮排序）': 'Seen {s} species · Caught {c}/{g} · Party {p}/4 (tap card to toggle party · buttons to sort)',
  '还没有捕捉到精灵，去地图逛逛吧！': 'No pets yet — go explore the maps!',
  '{n}阶': 'Stage {n}',
  'Lv.{lv} · 点击查看详情/聊天': 'Lv.{lv} · Tap for details & chat',
  '点击查看详情/聊天': 'Tap for details & chat',
  '攻': 'Atk', '防': 'Def', '速': 'Spd',
  '点击查看详情': 'Tap for details',
  '最多上阵 4 只': 'Party is full (4 max)',
  '确定放归 {name} 吗？此操作不可撤销。': 'Release {name}? This cannot be undone.',
  '{name} 回归了大自然': '{name} returned to nature',
  '置顶': 'Move to top', '上移': 'Move up', '下移': 'Move down', '放归': 'Release',
  '上阵': 'To party', '下阵': 'From party', '出战中': 'In battle',
  // settings
  '🌍 语言 / Language': '🌍 Language',
  'AI 生成内容的输出语言（精灵名字与描述、灵魂聊天、战斗台词、分享文案）。默认跟随浏览器，可手动切换。': 'Output language for AI content (pet names & lore, soul chat, battle lines, share copy). Follows your browser by default.',
  '输出语言': 'Output language',
  '界面与 AI 输出语言。默认跟随浏览器，可手动切换。': 'Interface & AI output language. Follows your browser by default.',
  '当前跟随浏览器：{lang}': 'Currently following your browser: {lang}',
  '已重译为当前语言': 'Retranslated to the current language',
  '重译失败，请稍后再试': 'Retranslation failed — try again later',
  '把名字与图鉴描述重译为当前语言（需要 AI 已启用）': 'Re-translate name & dex entry into the current language (requires AI enabled)',
  '🌐 重译': '🌐 Retranslate',
  '语言已切换': 'Language switched',
  '🤖 AI 随机生成（可选）': '🤖 AI Random Generation (optional)',
  '配置 OpenAI 兼容接口后，每次刷新精灵由大模型生成名字、属性与描述；关闭或失败时自动使用本地随机。API Key 仅保存在你的浏览器本地。': 'With an OpenAI-compatible endpoint, each encounter is generated by an LLM (name, types, lore); falls back to local random when off or on failure. The API key never leaves your browser.',
  '启用 AI 生成': 'Enable AI generation',
  '💾 存档': '💾 Save data',
  '数据保存在浏览器 localStorage。换浏览器/清缓存前请先导出。': 'Data lives in your browser localStorage. Export before switching browsers or clearing site data.',
  '导出存档': 'Export', '导入存档': 'Import', '清空存档': 'Reset all',
  '导入会覆盖当前存档，确定继续吗？': 'Importing overwrites your current save. Continue?',
  '导入成功': 'Imported',
  '导入失败：{err}': 'Import failed: {err}',
  '确定清空全部存档吗？此操作不可撤销！': 'Wipe ALL save data? This cannot be undone!',
  '📎 关于': '📎 About',
  'GitHub 仓库': 'GitHub Repo',
  '奇幻萌宠 FunPets 是纯前端开源休闲游戏，喜欢的话去仓库点个 ⭐ 吧～': 'FunPets is an open-source pure-frontend casual game. Star the repo if you like it~',
  'LLM 生成失败，本次使用本地随机': 'LLM generation failed — using local random this time',
  // storage errors
  '存档读取失败，已重置。如需找回请勿覆盖导出文件。': 'Failed to load save — data was reset. Keep your export file if you want to recover.',
  '存档写入失败（存储空间不足或隐私模式）': 'Failed to write save (storage full or private mode)',
  '不是有效的奇幻萌宠存档文件': 'Not a valid FunPets save file',
  // pet detail
  '💬 灵魂对话': '💬 Soul Chat', '🧠 记忆': '🧠 Memory', '📖 经历': '📖 Story',
  '你们还没有聊过天。': "You haven't chatted yet.",
  '它喜欢{love}，讨厌{hate}。聊聊这些它会更喜欢你。': 'It loves {love} and hates {hate}. Talk about those to bond faster.',
  '和{name}说点什么…': 'Say something to {name}…',
  '需在设置页启用 AI 后聊天': 'Enable AI in Settings to chat',
  '发送': 'Send', '清空记录': 'Clear',
  '对话 {n} 次 · 每 20 条自动沉淀为长期记忆': '{n} chats · every 20 messages become long-term memory',
  '还没有沉淀出长期记忆，多和它聊天吧。': 'No long-term memories yet — chat more!',
  '还没有值得记录的经历。': 'No stories yet.',
  '清空与 {name} 的全部聊天记录？（灵魂档案与长期记忆保留）': 'Clear all chat with {name}? (Soul profile & long-term memory are kept)',
  '聊天记录已清空（长期记忆保留）': 'Chat cleared (long-term memory kept)',
  '聊天失败：{err}': 'Chat failed: {err}',
  '复制失败，请手动复制地址栏': 'Copy failed — copy from the address bar manually',
  '分享链接已复制！好友打开即可观赏或挑战': 'Share link copied! Friends can view or challenge',
  '赠送链接已复制！发给好友即可领取（你不会失去它）': 'Gift link copied! Send it to a friend (you keep your pet)',
  '分享文案+链接已复制，去社交平台粘贴吧！': 'Share copy + link copied — paste it anywhere!',
  'AI 文案生成失败，已用模板文案': 'AI copy failed — used template copy',
  '我把「{name}」赠送给你啦！纯前端小礼物🎁': 'I gifted you "{name}"! A little pure-frontend present 🎁',
  '打开链接领取一只它的克隆（我的原宠还在我身边，放心）——它的灵魂档案和 AI 聊天会用你自己的配置重新开始。': 'Open the link to adopt a clone (my original stays with me, promise) — its soul and AI chat will start fresh with your own setup.',
  '🎁 赠送': '🎁 Gift', '📣 分享': '📣 Share', '✨ 生成中…': '✨ Working…', '🎁 生成中…': '🎁 Working…',
  '生成赠送链接——好友打开后可领取一只它的克隆（你不会失去它）': 'Create a gift link — a friend can adopt a clone (you never lose it)',
  '生成 AI 分享文案+链接（复制后可直接发社交平台）': 'Generate AI share copy + link (paste anywhere)',
  '仅复制分享链接': 'Copy share link only',
  '神秘精灵': 'mysterious pet',
  // devour modal
  '🍖 吞噬时刻！': '🍖 Devour Time!',
  '{pet} 可以吞噬 {foe} 的部分特征——选择你要的战利品：': '{pet} can devour parts of {foe} — pick your loot:',
  '勾选部件即时预览': 'Tick parts to preview live',
  '👆 可拖动旋转查看': '👆 Drag to rotate',
  '🎨 外观部件（勾选实时预览）': '🎨 Body parts (live preview)',
  '🦴 换骨架：头身手脚形态全变': '🦴 New frame: whole silhouette changes',
  '吞前': 'before', '吞后': 'after',
  '➕ 叠加（保留原{part}，多长一件）': '➕ Stack (keep current {part}, grow another)',
  '🔄 替换（原{part}换成它）': '🔄 Replace (swap current {part})',
  '⚔️ 技能': '⚔️ Moves',
  '新学会（当前 {n} 个）': 'Learn new (now {n})',
  '替换「{name}」': 'Replace "{name}"',
  '跳过': 'Skip', '确认吞噬': 'Devour',
  '体型替换': 'Frame swap', '🌱 长出': '🌱 Grow', '🔄 换上': '🔄 Swap on',
  '🔄 替换': '🔄 Replace', '➕ 叠加': '➕ Stack', '叠加': 'stacked', '→': '→', '无': 'None',
  // celebration
  '🎉 捕捉成功！': '🎉 Caught!', '✨ 进化了！': '✨ Evolved!',
  '⬆️ 等级提升！': '⬆️ Level Up!', '🎉 战斗胜利！': '🎉 Victory!',
  '太棒了！': 'Awesome!',
  '攻击': 'Attack', '防御': 'Defense', '速度': 'Speed', 'HP': 'HP',
  // chat.js
  '{name} 记住了新的东西': '{name} remembered something new',
  // llm local fallback
  '训练家': 'Trainer', '亲密伙伴': 'close partner', '活泼可爱': 'lively and cute',
  '我在《奇幻萌宠》抓到了一只{trait}的{name}！': 'I caught a {trait} {name} in FunPets!',
  '看看我家{name}，{trait}的小家伙！': 'Meet my {name} — such a {trait} little one!',
  'Lv.{lv} 的{name}报到～属性{types}，{trait}！': 'Lv.{lv} {name} reporting in! {types}-type, {trait}!',
  '{n} 阶进化形态，潜力十足': 'Stage-{n} evolved form, full of potential',
  '还未进化，潜力十足': 'Not yet evolved, full of potential',
  '跟它聊天还会回嘴，性格{trait}': 'It talks back when you chat — {trait} personality',
  '✨ 点链接来观赏或向我发起挑战吧！': '✨ Tap the link to view it or challenge me!',
  // entity groups
  '属性': 'Type', '等级': 'Level', '性格': 'Personality', '图鉴': 'Dex entry', '羁绊': 'Bond',
};

const JA = {
  'app.title': 'ファンペット · ふしぎモンスター',
  'app.brand': 'ファンペット',
  '地图': 'マップ', '相遇': 'こうぐう', '图鉴': 'ずかん', '设置': '設定', '🐾 分享宠': '🐾 シェア',
  '点击地图探索 · 已捕捉 {c}/{g} 只 · 遭遇 {e} 次 · 进化 {v} 次': 'マップをタップして探索 · 捕獲 {c}/{g} · 遭遇 {e} 回 · 進化 {v} 回',
  '🔒 捕捉 {n} 只解锁': '🔒 {n} 匹捕獲で解放',
  '野生 Lv.{a}-{b}': '野生 Lv.{a}-{b}',
  '草丛沙沙作响…': '草むらがガサガサ…',
  '「{map}」尚未解锁：需要捕捉满 {n} 只精灵，还差 {d} 只（当前 {c}/{n}）': '「{map}」は未解放：{n} 匹捕獲で解放、あと {d} 匹（現在 {c}/{n}）',
  '🐾 来自好友分享的精灵 · 点击它会跳一下': '🐾 友達のシェアしたモンスター · タップするとジャンプ',
  '🎁 好友赠送的精灵 · 点击它会跳一下': '🎁 友達からの贈り物 · タップするとジャンプ',
  '⚔️ 用我的精灵挑战': '⚔️ 自分のモンスターで挑戦',
  '返回游戏': 'ゲームに戻る',
  '🎁 领取它！': '🎁 もらう！', '✅ 已领取': '✅ 受け取り済み',
  '你已经领取过这只精灵啦': 'このモンスターはすでに受け取っています',
  '来自好友的赠送，加入你的队伍！': '友達からの贈り物、仲間に加わった！',
  '链接无效或已损坏': 'リンクが無効か壊れています',
  '你还没有精灵！点「返回游戏」→ 点地图去捕捉一只，再回来挑战': 'モンスターがいません！「ゲームに戻る」→ マップで捕獲してから挑戦してください',
  '开战（打残再捕更容易）': '戦う（弱らせると捕まえやすい）',
  '直接丢球（剩{n}）': 'ボールを投げる（残り{n}）', '直接丢球': 'ボールを投げる',
  '离开': '立ち去る',
  '精灵球用完了！开战打残它再捕，或换只精灵刷新重置': 'ボールが尽きた！戦って弱らせるか、新しいモンスターを引こう',
  '{name} 警觉起来了！球用完了——开战削弱它再捕吧': '{name} が警戒した！ボール切れ — 戦って弱めてから捕まえよう',
  '{name} 挣脱了精灵球！（剩余 {n} 次机会）': '{name} はボールから抜け出した！（残り {n} 回）',
  '还没有精灵伙伴！先丢球捕捉一只吧': 'パートナーがいない！まずボールで捕まえよう',
  '队伍已休整完毕！': 'チームは全回復！',
  '哪只精灵继续战斗？': 'どのモンスターが戦う？',
  '换上哪只精灵？（换宠会消耗本回合，对方趁机攻击）': '誰を出す？（交代はターン消費、相手が攻撃してくる）',
  '已倒下': 'ひんし',
  '威力 {n}': '威力 {n}', '变化': '補助', '变化技': '補助技',
  '丢球': 'ボール', '换宠': '交代', '逃跑': '逃げる', '取消': 'キャンセル',
  '换宠 只可用': '交代 · {n} 匹可能',
  '切换出战精灵（换上后对方会趁机攻击）': 'モンスターを交代（交代中に相手が攻撃）',
  '{name} 倒下了，请选择下一只精灵！': '{name} が倒れた！次のモンスターを！',
  '{name} 倒下了！换其他精灵继续战斗': '{name} が倒れた！別のモンスターに交代',
  '成功逃走了！': 'うまく逃げ切った！',
  '战斗出现异常，已终止本场': '戦闘エラー — この試合を終了しました',
  ' 会心!': ' 急所!',
  '{name}的{move}没有命中…': '{name}の{move}ははずれた…',
  '这对{name}没有效果…': '{name}には効果がない…',
  '你的{name}使出了{move}，{n} 点伤害': 'あなたの{name}の{move}！{n} ダメージ',
  '野生的{name}使出了{move}，{n} 点伤害': '野生の{name}の{move}！{n} ダメージ',
  '你的{name}使出了{move}！会心一击 {n} 点！': 'あなたの{name}の{move}！急所に当たった！{n} ダメージ！',
  '野生的{name}使出了{move}！会心一击 {n} 点！': '野生の{name}の{move}！急所に当たった！{n} ダメージ！',
  '效果超级拔群！': '効果は抜群！',
  '效果拔群！': '効果は今ひとつ…ではなくバツグン！',
  '效果不太理想…': '効果は今ひとつ…',
  '效果一般': 'ふつうの効果',
  '{name}倒下了！': '{name}は倒れた！',
  '{name}使用{move}，回复了 {n} 点体力': '{name}は{move}を使い、体力が {n} 回復した',
  '{name}使用{move}，{target}的{stat}{dir}！': '{name}の{move}！{target}の{stat}が{dir}！',
  '{name}使用{move}，{effect}！': '{name}は{move}を使った！{effect}！',
  '上升': '上がった', '下降': '下がった',
  '攻击上升': '攻撃が上がった', '攻击下降': '攻撃が下がった', '防御上升': '防御が上がった',
  '防御下降': '防御が下がった', '速度下降': '素早さが下がった', '回复': '回復',
  '换上了{name}！': '{name}に交代！',
  '{name} 也倒下了！': '{name} も倒れた！',
  '{name} 倒下了，无宠可用…': '{name} が倒れた…出せるモンスターがいない…',
  '精灵球晃了三下——成功捕捉了{name}！！': 'ボールが3回揺れて…{name} を捕まえた！！',
  '{name}从球里挣脱出来了！': '{name} はボールから抜け出した！',
  '没能逃掉！': '逃げられなかった！',
  '进化成了 {name}！灵魂也成长了': '{name} に進化した！魂も成長した',
  '{name} 升到了 Lv.{lv}！获得 {exp} 点经验': '{name} は Lv.{lv} になった！経験値 {exp} ゲット',
  '{name} 战胜了 {foe}，+{exp} 经验': '{name} が {foe} に勝った！+{exp} 経験値',
  '队伍中的 {name} 进化了！': 'チームの {name} が進化した！',
  '虽然输了，但 {name} 进化了！': '負けたけど、{name} が進化した！',
  '全军覆没…精灵们休息了一会儿又满血复活（休闲模式）': '全滅…休憩して全回復した（カジュアルモード）',
  '{name} 吞噬成功！{desc}': '{name} の捕食成功！{desc}',
  '加入你的队伍！': 'が仲間に加わった！',
  '好友的精灵不能被捕捉！': '友達のモンスターは捕まえられない！',
  '已遇见 {s} 种 · 已捕捉 {c}/{g} · 上阵 {p}/4（点击卡片切换上阵 · 按钮排序）': '出会った {s} 種 · 捕獲 {c}/{g} · パーティ {p}/4（カードタップで編成 · ボタンで並べ替え）',
  '还没有捕捉到精灵，去地图逛逛吧！': 'まだ捕まえていない — マップへ行こう！',
  '{n}阶': '{n}段階',
  'Lv.{lv} · 点击查看详情/聊天': 'Lv.{lv} · タップで詳細・チャット',
  '点击查看详情/聊天': 'タップで詳細・チャット',
  '攻': '攻', '防': '防', '速': '速',
  '最多上阵 4 只': 'パーティは最大4匹',
  '确定放归 {name} 吗？此操作不可撤销。': '{name} を野に返す？取り消せません。',
  '{name} 回归了大自然': '{name} は自然に帰った',
  '置顶': '先頭へ', '上移': '上へ', '下移': '下へ', '放归': '逃がす',
  '上阵': '編成へ', '下阵': '編成から外す', '出战中': '出撃中',
  '🌍 语言 / Language': '🌍 言語 / Language',
  '输出语言': '出力言語',
  '🤖 AI 随机生成（可选）': '🤖 AI ランダム生成（任意）',
  '启用 AI 生成': 'AI 生成を有効化',
  '💾 存档': '💾 セーブデータ',
  '导出存档': 'エクスポート', '导入存档': 'インポート', '清空存档': '全消去',
  '导入成功': 'インポート完了',
  '📎 关于': '📎 このゲームについて',
  '已重译为当前语言': '現在の言語に翻訳しました',
  '重译失败，请稍后再试': '翻訳に失敗しました。後でもう一度お試しください',
  '把名字与图鉴描述重译为当前语言（需要 AI 已启用）': '名前とずかん説明を現在の言語に翻訳し直す（AI 有効化が必要）',
  '🌐 重译': '🌐 翻訳',
  'GitHub 仓库': 'GitHub リポジトリ',
  '太棒了！': 'すごい！',
  '发送': '送信', '清空记录': '消去', '取消': 'キャンセル', '跳过': 'スキップ',
  '🎁 赠送': '🎁 贈る', '📣 分享': '📣 シェア', '✨ 生成中…': '✨ 生成中…', '🎁 生成中…': '🎁 生成中…',
  '⚔️ 技能': '⚔️ わざ',
  '🎨 外观部件（勾选实时预览）': '🎨 パーツ（リアルタイムプレビュー）',
  '🍖 吞噬时刻！': '🍖 捕食タイム！',
  '确认吞噬': '捕食する',
  '💬 灵魂对话': '💬 ソウルチャット', '🧠 记忆': '🧠 記憶', '📖 经历': '📖 物語',
  '🎉 捕捉成功！': '🎉 捕獲成功！', '✨ 进化了！': '✨ 進化した！',
  '⬆️ 等级提升！': '⬆️ レベルアップ！', '🎉 战斗胜利！': '🎉 勝利！',
  '攻击': '攻撃', '防御': '防御', '速度': '素早さ',
  '训练家': 'トレーナー',
};

// zh-TW：术语级转换（UI 全量 + 实体名）；未收录的沿用简体不影响理解
const ZH_TW = {
  'app.title': '奇幻萌寵 FunPets · 開始遊戲',
  '地图': '地圖', '相遇': '相遇', '图鉴': '圖鑑', '设置': '設定', '🐾 分享宠': '🐾 分享寵',
  '点击地图探索 · 已捕捉 {c}/{g} 只 · 遭遇 {e} 次 · 进化 {v} 次': '點擊地圖探索 · 已捕捉 {c}/{g} 隻 · 遭遇 {e} 次 · 進化 {v} 次',
  '🔒 捕捉 {n} 只解锁': '🔒 捕捉 {n} 隻解鎖',
  '草丛沙沙作响…': '草叢沙沙作響…',
  '「{map}」尚未解锁：需要捕捉满 {n} 只精灵，还差 {d} 只（当前 {c}/{n}）': '「{map}」尚未解鎖：需要捕捉滿 {n} 隻精靈，還差 {d} 隻（目前 {c}/{n}）',
  '🐾 来自好友分享的精灵 · 点击它会跳一下': '🐾 來自好友分享的精靈 · 點擊它會跳一下',
  '🎁 好友赠送的精灵 · 点击它会跳一下': '🎁 好友贈送的精靈 · 點擊它會跳一下',
  '⚔️ 用我的精灵挑战': '⚔️ 用我的精靈挑戰',
  '返回游戏': '返回遊戲',
  '🎁 领取它！': '🎁 領取它！', '✅ 已领取': '✅ 已領取',
  '你已经领取过这只精灵啦': '你已經領取過這隻精靈啦',
  '来自好友的赠送，加入你的队伍！': '來自好友的贈送，加入你的隊伍！',
  '链接无效或已损坏': '連結無效或已損壞',
  '开战（打残再捕更容易）': '開戰（打殘再捕更容易）',
  '直接丢球（剩{n}）': '直接丟球（剩{n}）', '直接丢球': '直接丟球',
  '离开': '離開',
  '精灵球用完了！开战打残它再捕，或换只精灵刷新重置': '精靈球用完了！開戰打殘它再捕，或換隻精靈刷新重置',
  '{name} 挣脱了精灵球！（剩余 {n} 次机会）': '{name} 掙脫了精靈球！（剩餘 {n} 次機會）',
  '还没有精灵伙伴！先丢球捕捉一只吧': '還沒有精靈夥伴！先丟球捕捉一隻吧',
  '队伍已休整完毕！': '隊伍已休整完畢！',
  '哪只精灵继续战斗？': '哪隻精靈繼續戰鬥？',
  '已倒下': '已倒下',
  '威力 {n}': '威力 {n}', '变化': '變化', '变化技': '變化技',
  '丢球': '丟球', '换宠': '換寵', '逃跑': '逃跑', '取消': '取消',
  '{name} 倒下了，请选择下一只精灵！': '{name} 倒下了，請選擇下一隻精靈！',
  '成功逃走了！': '成功逃走了！',
  ' 会心!': ' 會心!',
  '{name}的{move}没有命中…': '{name}的{move}沒有命中…',
  '这对{name}没有效果…': '這對{name}沒有效果…',
  '{name}倒下了！': '{name}倒下了！',
  '换上了{name}！': '換上了{name}！',
  '精灵球晃了三下——成功捕捉了{name}！！': '精靈球晃了三下——成功捕捉了{name}！！',
  '{name}从球里挣脱出来了！': '{name}從球裡掙脫出來了！',
  '没能逃掉！': '沒能逃掉！',
  '效果超级拔群！': '效果超級拔群！', '效果拔群！': '效果拔群！', '效果不太理想…': '效果不太理想…',
  '进化成了 {name}！灵魂也成长了': '進化成了 {name}！靈魂也成長了',
  '全军覆没…精灵们休息了一会儿又满血复活（休闲模式）': '全軍覆沒…精靈們休息了一會兒又滿血復活（休閒模式）',
  '加入你的队伍！': '加入你的隊伍！',
  '好友的精灵不能被捕捉！': '好友的精靈不能被捕捉！',
  '还没有捕捉到精灵，去地图逛逛吧！': '還沒有捕捉到精靈，去地圖逛逛吧！',
  '{n}阶': '{n}階',
  '攻': '攻', '防': '防', '速': '速',
  '最多上阵 4 只': '最多上陣 4 隻',
  '确定放归 {name} 吗？此操作不可撤销。': '確定放歸 {name} 嗎？此操作不可撤銷。',
  '{name} 回归了大自然': '{name} 回歸了大自然',
  '置顶': '置頂', '上移': '上移', '下移': '下移', '放归': '放歸',
  '上阵': '上陣', '下阵': '下陣', '出战中': '出戰中',
  '🌍 语言 / Language': '🌍 語言 / Language',
  '输出语言': '輸出語言',
  '🤖 AI 随机生成（可选）': '🤖 AI 隨機生成（可選）',
  '启用 AI 生成': '啟用 AI 生成',
  '💾 存档': '💾 存檔',
  '导出存档': '匯出存檔', '导入存档': '匯入存檔', '清空存档': '清空存檔',
  '导入成功': '匯入成功',
  '📎 关于': '📎 關於',
  '已重译为当前语言': '已重譯為目前語言',
  '重译失败，请稍后再试': '重譯失敗，請稍後再試',
  '把名字与图鉴描述重译为当前语言（需要 AI 已启用）': '把名字與圖鑑描述重譯為目前語言（需要 AI 已啟用）',
  '🌐 重译': '🌐 重譯',
  '点击查看详情/聊天': '點擊查看詳情/聊天',
  'GitHub 仓库': 'GitHub 儲存庫',
  '太棒了！': '太棒了！',
  '发送': '發送', '清空记录': '清空記錄', '跳过': '跳過',
  '🎁 赠送': '🎁 贈送', '📣 分享': '📣 分享', '✨ 生成中…': '✨ 生成中…', '🎁 生成中…': '🎁 生成中…',
  '⚔️ 技能': '⚔️ 技能',
  '🎨 外观部件（勾选实时预览）': '🎨 外觀部件（勾選即時預覽）',
  '🍖 吞噬时刻！': '🍖 吞噬時刻！',
  '确认吞噬': '確認吞噬',
  '💬 灵魂对话': '💬 靈魂對話', '🧠 记忆': '🧠 記憶', '📖 经历': '📖 經歷',
  '🎉 捕捉成功！': '🎉 捕捉成功！', '✨ 进化了！': '✨ 進化了！',
  '⬆️ 等级提升！': '⬆️ 等級提升！', '🎉 战斗胜利！': '🎉 戰鬥勝利！',
  '攻击': '攻擊', '防御': '防禦', '速度': '速度',
};

const DICTS = { en: EN, ja: JA, 'zh-TW': ZH_TW };

/** 翻译：zh 原样；en/ja/zh-TW 查词典；未收录回落 key 本身（宁缺勿错） */
export function t(key, params = null) {
  // 非中文原文的命名空间 key（app.*）：zh 也要显式值，否则会把 key 本身显示出来
  const ZH_KEYS = { 'app.title': '奇幻萌宠 FunPets · 开始游戏', 'app.brand': '奇幻萌宠' };
  const dict = DICTS[locale.value];
  let s = (dict && dict[key] != null) ? dict[key]
    : (ZH_KEYS[key] != null && (locale.value === 'zh' || locale.value === 'zh-TW')) ? ZH_KEYS[key]
    : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

// ============ 实体名显示映射（数据层 zh 规范 → 当前语言） ============
const TYPE_EN = { '一般': 'Normal', '火': 'Fire', '水': 'Water', '电': 'Electric', '草': 'Grass', '冰': 'Ice', '格斗': 'Fighting', '毒': 'Poison', '地面': 'Ground', '飞行': 'Flying', '超能力': 'Psychic', '虫': 'Bug', '岩石': 'Rock', '幽灵': 'Ghost', '龙': 'Dragon', '恶': 'Dark', '钢': 'Steel', '妖精': 'Fairy' };
const TYPE_JA = { '一般': 'ノーマル', '火': 'ほのお', '水': 'みず', '电': 'でんき', '草': 'くさ', '冰': 'こおり', '格斗': 'かくとう', '毒': 'どく', '地面': 'じめん', '飞行': 'ひこう', '超能力': 'エスパー', '虫': 'むし', '岩石': 'いわ', '幽灵': 'ゴースト', '龙': 'ドラゴン', '恶': 'あく', '钢': 'はがね', '妖精': 'フェアリー' };
const TYPE_TW = { '一般': '一般', '火': '火', '水': '水', '电': '電', '草': '草', '冰': '冰', '格斗': '格鬥', '毒': '毒', '地面': '地面', '飞行': '飛行', '超能力': '超能力', '虫': '蟲', '岩石': '岩石', '幽灵': '幽靈', '龙': '龍', '恶': '惡', '钢': '鋼', '妖精': '妖精' };

const MOVE_EN = {
  '扑击': 'Pounce', '猛撞': 'Body Slam', '瞪眼': 'Glare', '深呼吸': 'Deep Breath',
  '火星弹': 'Ember Shot', '烈焰冲撞': 'Flame Charge', '灼热咆哮': 'Scorch Roar',
  '水泡射击': 'Bubble Shot', '浪涌': 'Surge', '水流护体': 'Water Veil',
  '电火花': 'Static Spark', '十万奔腾': 'Volt Stampede', '麻痹闪光': 'Numbing Flash',
  '藤鞭': 'Vine Lash', '光合炮': 'Photosynth Cannon', '寄生种子': 'Leech Seedling',
  '霜冻吐息': 'Frost Breath', '极寒冰锥': 'Glacier Spike', '冰晶护盾': 'Ice Crystal Guard',
  '连环踢': 'Combo Kick', '爆裂拳': 'Burst Fist', '蓄力': 'Focus Charge',
  '毒针': 'Venom Needle', '污泥炸弹': 'Sludge Bomb', '毒雾': 'Venom Mist',
  '泼沙': 'Sand Fling', '大地裂击': 'Earth Splitter', '钻地': 'Burrow',
  '疾风斩': 'Gale Slash', '俯冲撞击': 'Dive Crash', '拔羽': 'Pluck',
  '念力波': 'Psywave', '精神冲击': 'Mind Shock', '冥想': 'Meditate',
  '虫咬': 'Bug Bite', '蜇刺连击': 'Sting Barrage', '吐丝': 'Silk Spray',
  '滚石': 'Rock Roller', '岩崩': 'Rock Slide', '硬化': 'Harden',
  '舌头舔': 'Lick', '暗影球': 'Shadow Orb', '怨念': 'Grudge',
  '龙息': 'Dragon Breath', '流星群击': 'Meteor Barrage', '龙之舞': 'Dragon Dance',
  '偷袭': 'Sneak Strike', '暗黑爆碎': 'Dark Crush', '虚张声势': 'Bluster',
  '金属爪': 'Metal Claw', '铁头功': 'Iron Headbutt', '身体硬化': 'Body Harden',
  '星光闪': 'Star Flash', '魔法闪耀': 'Magic Shine', '撒娇': 'Sweet Plead',
};
const MOVE_JA = {
  '扑击': 'とつげき', '猛撞': 'すごいとっしん', '瞪眼': 'にらむ', '深呼吸': '深呼吸',
  '火星弹': 'ひぶし弾', '烈焰冲撞': 'れっかしょうとつ', '灼热咆哮': 'しゃくねつほうこう',
  '水泡射击': 'あわショット', '浪涌': 'なだれうねり', '水流护体': 'みずのベール',
  '电火花': 'でんき火花', '十万奔腾': 'じゅうまんとっしん', '麻痹闪光': 'しびれフラッシュ',
  '藤鞭': 'つるムチ', '光合炮': 'こうごうほう', '寄生种子': 'やどりぎのタネ',
  '霜冻吐息': 'しもといき', '极寒冰锥': 'ごくかんつらら', '冰晶护盾': 'こおりしょうへき',
  '连环踢': 'れんだんキック', '爆裂拳': 'ばくれつけん', '蓄力': 'きあいだめ',
  '毒针': 'どくばり', '污泥炸弹': 'ヘドロばくだん', '毒雾': 'どくのきり',
  '泼沙': 'すなかけ', '大地裂击': 'だいちれつげき', '钻地': 'あなほり',
  '疾风斩': 'しっぷうざん', '俯冲撞击': 'きゅうこうしょうとつ', '拔羽': 'はねひき',
  '念力波': 'ねんりきは', '精神冲击': 'せいしんしょうげき', '冥想': 'めいそう',
  '虫咬': 'むしくい', '蜇刺连击': 'どくづきれんだ', '吐丝': 'いとをはく',
  '滚石': 'いわころがし', '岩崩': 'いわなだれ', '硬化': 'こうか',
  '舌头舔': 'したでなめる', '暗影球': 'シャドウオーブ', '怨念': 'うらみ',
  '龙息': 'りゅうのいき', '流星群击': 'りゅうせいぐん', '龙之舞': 'りゅうのまい',
  '偷袭': 'ふいうち', '暗黑爆碎': 'あんこくはかい', '虚张声势': 'いきまい',
  '金属爪': 'メタルクロー', '铁头功': 'てつあたま', '身体硬化': 'ボディこうか',
  '星光闪': 'スターフラッシュ', '魔法闪耀': 'マジカルシャイン', '撒娇': 'あまえる',
};

const MAP_EN = { '微风草原': 'Breezy Meadow', '月光浅滩': 'Moonlit Shore', '回声洞窟': 'Echo Cave', '烬尾火山': 'Ember Tail Volcano', '雾语秘林': 'Mist Whisper Forest', '天穹之巅': 'Sky Dome Peak' };
const MAP_JA = { '微风草原': 'そよかぜ草原', '月光浅滩': '月光の浅瀬', '回声洞窟': 'こだま洞窟', '烬尾火山': '燃えがら火山', '雾语秘林': '霧語りの森', '天穹之巅': '天穹の頂' };
const MAP_TW = { '微风草原': '微風草原', '月光浅滩': '月光淺灘', '回声洞窟': '回聲洞窟', '烬尾火山': '燼尾火山', '雾语秘林': '霧語秘林', '天穹之巅': '天穹之巔' };
// 地图描述（整句翻译；zh/zh-TW 用原句）
const MAPDESC_EN = {
  '起伏的青草丘，新手训练家的第一站。': 'Rolling grassy hills — every new trainer\'s first stop.',
  '潮声轻柔的海岸，夜里精灵们会来喝水。': 'A shore of gentle tides, where pets come to drink at night.',
  '深处传来叮咚的回声，墙壁上嵌着发光的晶石。': 'Echoes ring from the depths; glowing crystals stud the walls.',
  '山脚有温泉，山顶的火山口终年冒着热气。': 'Hot springs at the foot, a steaming crater at the peak.',
  '雾气终年不散，古树的枝干间藏着说不清的目光。': 'The mist never lifts; unreadable eyes watch from ancient boughs.',
  '云海之上的孤峰，据说最接近星空的地方。': 'A lone peak above the cloud sea — said to be the closest place to the stars.',
};
const MAPDESC_JA = {
  '起伏的青草丘，新手训练家的第一站。': '起伏する草原 — 新人トレーナーの最初の一歩。',
  '潮声轻柔的海岸，夜里精灵们会来喝水。': '波音やさしい海岸。夜はモンスターが水を飲みに来る。',
  '深处传来叮咚的回声，墙壁上嵌着发光的晶石。': '奥から響くこだま。壁には光る結晶が埋まっている。',
  '山脚有温泉，山顶的火山口终年冒着热气。': '麓に温泉、頂の火口は一年中湯気を立てている。',
  '雾气终年不散，古树的枝干间藏着说不清的目光。': '霧が晴れない森。古木の枝の間によく分からない視線が潜む。',
  '云海之上的孤峰，据说最接近星空的地方。': '雲海の上の孤峰 — 星空に一番近い場所と言われる。',
};
const MAPDESC_TW = {
  '起伏的青草丘，新手训练家的第一站。': '起伏的青草丘，新手訓練家的第一站。',
  '潮声轻柔的海岸，夜里精灵们会来喝水。': '潮聲輕柔的海岸，夜裡精靈們會來喝水。',
  '深处传来叮咚的回声，墙壁上嵌着发光的晶石。': '深處傳來叮咚的回聲，牆壁上嵌著發光的晶石。',
  '山脚有温泉，山顶的火山口终年冒着热气。': '山腳有溫泉，山頂的火山口終年冒著熱氣。',
  '雾气终年不散，古树的枝干间藏着说不清的目光。': '霧氣終年不散，古樹的枝幹間藏著說不清的目光。',
  '云海之上的孤峰，据说最接近星空的地方。': '雲海之上的孤峰，據說最接近星空的地方。',
};

const RARITY_EN = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legend: 'Legend' };
const RARITY_JA = { common: 'よく見る', uncommon: 'あまり見ない', rare: 'レア', epic: 'エピック', legend: '伝説' };
const RARITY_TW = { common: '常見', uncommon: '少見', rare: '稀有', epic: '史詩', legend: '傳說' };
const RARITY_ZH = { common: '常见', uncommon: '少见', rare: '稀有', epic: '史诗', legend: '传说' };

const NATURE_EN = { '悠闲': 'Relaxed', '好斗': 'Scrappy', '结实': 'Sturdy', '轻快': 'Swift', '沉着': 'Calm' };
const NATURE_JA = { '悠闲': 'のんき', '好斗': 'こうけつ', '结实': 'がんじょう', '轻快': 'けいかい', '沉着': 'ちんちゃく' };
const NATURE_TW = { '悠闲': '悠閒', '好斗': '好鬥', '结实': '結實', '轻快': '輕快', '沉着': '沉著' };

const PART_EN = { body: 'Frame', ears: 'Ears', tail: 'Tail', accessory: 'Accessory', pattern: 'Pattern', eyes: 'Eyes' };
const PART_JA = { body: '体型', ears: '耳', tail: 'しっぽ', accessory: 'アクセ', pattern: '模様', eyes: '目' };
const PART_TW = { body: '體型', ears: '耳朵', tail: '尾巴', accessory: '飾品', pattern: '花紋', eyes: '眼睛' };
const PART_ZH = { body: '体型', ears: '耳朵', tail: '尾巴', accessory: '饰品', pattern: '花纹', eyes: '眼睛' };

const VALUE_EN = {
  none: 'None', round: 'Round', pointy: 'Pointy', long: 'Long', fin: 'Fin',
  stub: 'Stub', curl: 'Curl', fluff: 'Fluff', spark: 'Spark',
  flower: 'Flower', leaf: 'Leaf', horn: 'Horn', gem: 'Gem',
  spots: 'Spots', stripe: 'Stripes', belly: 'Belly',
  dot: 'Dot', sleepy: 'Sleepy', sparkle: 'Sparkle',
  round_body: 'Round', pear: 'Pear', tall: 'Tall', blob: 'Blob', drop: 'Drop',
};
const VALUE_JA = {
  none: 'なし', round: 'まる', pointy: 'とがり', long: 'ながい', fin: 'ひれ',
  stub: 'みじか', curl: 'カール', fluff: 'ふわ', spark: 'スパーク',
  flower: 'はな', leaf: 'はっぱ', horn: 'つの', gem: 'ジェム',
  spots: 'ぶち', stripe: 'しま', belly: 'おなか',
  dot: 'びんぼう', sleepy: 'ねむ', sparkle: 'きら',
  round_body: 'まる', pear: 'なし型', tall: 'ほそなが', blob: 'ブロブ', drop: 'しずく',
};
const VALUE_ZH = {
  none: '无', round: '圆', pointy: '尖', long: '长', fin: '鳍',
  stub: '短尾', curl: '卷尾', fluff: '绒尾', spark: '电尾',
  flower: '小花', leaf: '叶芽', horn: '小角', gem: '额晶',
  spots: '斑点', stripe: '条纹', belly: '肚皮',
  dot: '豆豆眼', sleepy: '眯眯眼', sparkle: '星星眼', round: '圆眼',
  round_body: '圆滚滚', pear: '梨形', tall: '瘦长', blob: '软团', drop: '水滴',
};

const TRAIT_EN = {
  '高冷疏离': 'aloof', '温和友善': 'warm & friendly', '黏人热情': 'clingy & sweet',
  '慵懒沉稳': 'laid-back', '平稳': 'steady', '活泼跳脱': 'bouncy',
  '谦虚随和': 'humble', '要强': 'driven', '傲娇自恋': 'tsundere',
  '专注执着': 'focused', '随性': 'easygoing', '好奇心爆棚': 'hyper-curious',
};
const TRAIT_JA = {
  '高冷疏离': 'クール', '温和友善': 'やさしい', '黏人热情': '甘えん坊',
  '慵懒沉稳': 'のんびり', '平稳': 'ふつう', '活泼跳脱': 'げんき',
  '谦虚随和': 'けんそん', '要强': '負けずぎらい', '傲娇自恋': 'ツンデレ',
  '专注执着': 'いっしょけんめい', '随性': 'きまぐれ', '好奇心爆棚': 'こうきしん',
};

const REL_EN = { '训练家': 'Trainer', '搭档': 'Partner', '挚友': 'Best Friend', '家人': 'Family', '入侵者': 'Intruder' };
const REL_JA = { '训练家': 'トレーナー', '搭档': 'パートナー', '挚友': '親友', '家人': '家族', '入侵者': '侵入者' };
const REL_TW = { '训练家': '訓練家', '搭档': '搭檔', '挚友': '摯友', '家人': '家人', '入侵者': '入侵者' };

function mapFrom(dict, fallback) {
  // 每次调用时重选字典：闭包外层求值会让 locale 切换后仍用旧语言（曾 bug）
  return (x) => {
    const v = dict[locale.value];
    return (v && v[x] != null ? v[x] : (fallback ? fallback(x) : x));
  };
}

export const typeName = mapFrom({ en: TYPE_EN, ja: TYPE_JA, 'zh-TW': TYPE_TW });
export const moveName = mapFrom({ en: MOVE_EN, ja: MOVE_JA });
export const mapName = mapFrom({ en: MAP_EN, ja: MAP_JA, 'zh-TW': MAP_TW });
// 地图描述显示映射（zh/zh-TW 原句；en/ja 整句翻译；未收录句回落原句）
export const mapDesc = mapFrom({ en: MAPDESC_EN, ja: MAPDESC_JA, 'zh-TW': MAPDESC_TW });
export const rarityName = mapFrom({ en: RARITY_EN, ja: RARITY_JA, 'zh-TW': RARITY_TW, zh: RARITY_ZH });
export const natureName = mapFrom({ en: NATURE_EN, ja: NATURE_JA, 'zh-TW': NATURE_TW });
export const partLabel = mapFrom({ en: PART_EN, ja: PART_JA, 'zh-TW': PART_TW, zh: PART_ZH });
export const valueLabel = mapFrom({ en: VALUE_EN, ja: VALUE_JA, zh: VALUE_ZH });
export const traitLabel = mapFrom({ en: TRAIT_EN, ja: TRAIT_JA });
export const relationTitle = mapFrom({ en: REL_EN, ja: REL_JA, 'zh-TW': REL_TW });
