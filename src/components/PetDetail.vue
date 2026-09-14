// 宠物详情弹窗 v2：档案页签（灵魂/记忆/羁绊）+ 灵魂聊天。
// 灵魂 = persona（seed 掷点固化）+ 三层记忆 + 羁绊成长；聊天即养成。
<template>
  <Transition name="detail">
    <div v-if="pet" class="detail-mask" @click.self="close">
      <div class="detail-card">
        <!-- 顶部操作条：flex 自适应布局——各语言文案宽度不同（EN "Retranslate"/"Gift" 比中文宽），
             绝对定位+硬编码 right 会在切换语言后重叠，这里按内容流式排列 -->
        <div class="detail-actions-bar">
          <button v-if="llmReady" class="detail-retranslate" @click="retranslate" :disabled="retranslating" :title="t('把名字与图鉴描述重译为当前语言（需要 AI 已启用）')">{{ retranslating ? '🌐…' : t('🌐 重译') }}</button>
          <!-- 赠送：生成 #g= 链接，好友打开领取一只克隆（自己不失去宠物） -->
          <button class="detail-gift" @click="gift" :title="t('生成赠送链接——好友打开后可领取一只它的克隆（你不会失去它）')">{{ gifting ? t('🎁 生成中…') : t('🎁 赠送') }}</button>
          <!-- 分享：生成 #p= 链接给好友观赏/挑战（查看者只读+可挑战，不能聊天） -->
          <button class="detail-share" @click="share" :title="t('生成 AI 分享文案+链接（复制后可直接发社交平台）')" :disabled="sharing">{{ sharing ? t('✨ 生成中…') : t('📣 分享') }}</button>
          <button class="detail-share-link" @click="copyLink" :title="t('仅复制分享链接')" aria-label="copy link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <button class="detail-close" @click="close" aria-label="close">✕</button>
        </div>
        <div class="detail-top">
          <div class="detail-sprite"><Pet3D :key="modelTag" :pet="pet" :size="140" /></div>
          <div class="detail-meta">
            <h2>{{ pet.name }} <small v-if="pet.phase" class="phase-badge">{{ t('{n}阶', { n: pet.phase }) }}</small></h2>
            <div class="chips">
              <i v-for="tp in pet.types" :key="tp" class="chip" :style="chipStyle(tp)">{{ typeLabel(tp) }}</i>
              <i class="chip rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityLabel(pet.rarity) }}</i>
              <i class="chip lv-chip">Lv.{{ pet.level }}</i>
            </div>
            <p class="soul-line">「{{ traitLine }}」</p>
            <div class="bond-row">
              <span class="bond-title">{{ relationTitleOf(soul.relation.title) }}</span>
              <div class="bond-bar"><i :style="{ width: Math.round(soul.relation.affinity) + '%' }"></i></div>
              <span class="bond-num">{{ Math.round(soul.relation.affinity) }}</span>
            </div>
            <div class="detail-stats">
              <span>HP {{ maxHp }}</span><span>{{ t('攻') }} {{ atkStat }}</span><span>{{ t('防') }} {{ defStat }}</span><span>{{ t('速') }} {{ spdStat }}</span>
            </div>
          </div>
        </div>

        <div class="detail-tabs">
          <button :class="{ active: tab === 'soul' }" @click="tab = 'soul'">{{ t('💬 灵魂对话') }}</button>
          <button :class="{ active: tab === 'profile' }" @click="tab = 'profile'">{{ t('🧠 记忆') }} <em>{{ soul.memory.profile.length }}</em></button>
          <button :class="{ active: tab === 'story' }" @click="tab = 'story'">{{ t('📖 经历') }} <em>{{ soul.memory.episodic.length }}</em></button>
          <button :class="{ active: tab === 'paint' }" @click="openPaint">{{ t('🎨 涂色') }} <em v-if="paintDirty">●</em></button>
        </div>

        <!-- 灵魂对话 -->
        <div v-if="tab === 'soul'" class="chat-panel">
          <div class="chat-msgs" ref="msgsEl">
            <div v-if="!chat.messages.length" class="chat-empty">
              <p>{{ t('你们还没有聊过天。') }}</p>
              <p class="dim">{{ t('它喜欢{love}，讨厌{hate}。聊聊这些它会更喜欢你。', { love: soul.identity.love, hate: soul.identity.hate }) }}</p>
            </div>
            <div v-for="(m, i) in chat.messages" :key="i" class="chat-msg" :class="m.role">
              <span class="bubble">{{ m.content }}</span>
            </div>
            <div v-if="typing" class="chat-msg assistant"><span class="bubble typing">{{ typingText }}<i class="caret">▌</i></span></div>
          </div>
          <form class="chat-input" @submit.prevent="send">
            <input v-model="draft" :placeholder="llmReady ? t('和{name}说点什么…', { name: pet.name }) : t('需在设置页启用 AI 后聊天')" :disabled="!llmReady || typing" />
            <button type="submit" class="primary" :disabled="!llmReady || typing || !draft.trim()">{{ t('发送') }}</button>
          </form>
          <div class="chat-foot">
            <small>{{ t('对话 {n} 次 · 每 20 条自动沉淀为长期记忆', { n: soul.relation.chats }) }}</small>
            <button class="ghost sm" @click="clearChat">{{ t('清空记录') }}</button>
          </div>
        </div>

        <!-- 长期记忆 -->
        <div v-else-if="tab === 'profile'" class="mem-panel">
          <div v-if="!soul.memory.profile.length" class="empty">{{ t('还没有沉淀出长期记忆，多和它聊天吧。') }}</div>
          <div v-for="(f, i) in soul.memory.profile" :key="i" class="mem-item">💡 {{ f }}</div>
        </div>

        <!-- 经历 -->
        <div v-else-if="tab === 'story'" class="mem-panel">
          <div v-if="!soul.memory.episodic.length" class="empty">{{ t('还没有值得记录的经历。') }}</div>
          <div v-for="(e, i) in [...soul.memory.episodic].reverse()" :key="i" class="mem-item story">
            <small>{{ fmtTime(e.t) }}</small> {{ e.text }}
          </div>
        </div>

        <!-- 涂色（v12）：draft 预览，保存才生效 -->
        <div v-else-if="tab === 'paint'" class="paint-panel">
          <div class="paint-body">
            <div class="paint-preview">
              <Pet3D :key="paintModelTag" :pet="paintPreviewPet" :size="150" :idle-spin="true" drag-mode="panY" />
              <small class="paint-hint">{{ t('预览实时生效，点「保存」才写入存档') }}</small>
            </div>
            <div class="paint-slots">
              <div v-for="slot in PAINT_SLOTS" :key="slot.key" class="paint-slot">
                <div class="slot-head">
                  <span class="slot-name">{{ slotLabel(slot) }}</span>
                  <button v-if="paintDraft[slot.key]" class="slot-clear" @click="clearSlot(slot.key)" :title="t('恢复默认色')">↺</button>
                </div>
                <div class="slot-ctrls">
                  <label class="mode-pick">
                    <input type="radio" :name="'pm-' + slot.key" :checked="!paintDraft[slot.key]?._grad" @change="setSlotMode(slot.key, false)" />
                    <input type="color" class="slot-color" :value="slotHex(slot.key)" @input="setSlotColor(slot.key, $event.target.value)" />
                  </label>
                  <label class="mode-pick">
                    <input type="radio" :name="'pm-' + slot.key" :checked="!!paintDraft[slot.key]?._grad" @change="setSlotMode(slot.key, true)" />
                    <span class="grad-pair">
                      <input type="color" class="slot-color sm" :value="slotHex(slot.key, 'f')" @input="setSlotGrad(slot.key, 'f', $event.target.value)" :title="t('头顶色')" />
                      <span class="grad-arrow">→</span>
                      <input type="color" class="slot-color sm" :value="slotHex(slot.key, 't')" @input="setSlotGrad(slot.key, 't', $event.target.value)" :title="t('底部色')" />
                    </span>
                  </label>
                </div>
              </div>
              <div class="swatches">
                <button v-for="c in SWATCHES" :key="c" class="swatch" :style="{ background: c }" @click="applySwatch(c)" :title="c"></button>
              </div>
              <div class="paint-ai">
                <input v-model="aiScheme" class="ai-input" :placeholder="llmReady ? t('描述色彩方案，如「樱花粉渐变到白色」') : t('需在设置页启用 AI')" :disabled="!llmReady || aiPainting" @keyup.enter="aiPaint" />
                <button class="ai-btn" :disabled="!llmReady || aiPainting || !aiScheme.trim()" @click="aiPaint">{{ aiPainting ? t('🎨…') : t('AI 一键涂色') }}</button>
              </div>
            </div>
          </div>
          <div class="paint-foot">
            <button class="ghost sm" @click="resetPaint" :disabled="!paintDirty">{{ t('还原') }}</button>
            <button v-if="hasSavedColors" class="ghost sm" @click="clearAllPaint">{{ t('清除全部涂色') }}</button>
            <span class="flex1"></span>
            <button class="paint-save" :disabled="!paintDirty" @click="savePaint">{{ t('保存涂色') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, reactive } from 'vue';
import { llmConfig, showToast, rarityInfo, persist, save } from '../store.js';
import { isLlmConfigured, chatWithSoul, generateShareCopy, localShareCopy, retranslatePet, generatePetPaint } from '../core/llm.js';
import { shareUrl, giftUrl } from '../core/sharePet.js';
import { t, rarityName as rarityLabelOf, typeName as typeNameOf, relationTitle as relationTitleOf, traitLabel as traitLabelOf, locale } from '../core/i18n.js';
import { chatOf, appendChat, maybeCompress, persistChat } from '../chat.js';
import { statsAt } from '../core/evolve.js';
import { ensureSoul, traitLabels, updateSoul, driftTraits, addProfileFact, touchRelation } from '../core/soul.js';
import Pet3D from './Pet3D.vue';
import { TYPE_COLORS } from '../data/types.js';
import { PAINT_SLOTS, SWATCHES, applyPaintToLook, sanitizeColors, hasCustomColors } from '../core/paint.js';
import { PALETTES } from '../data/traits.js';

const props = defineProps({ pet: { type: Object, default: null } });
const emit = defineEmits(['close']);

const tab = ref('soul');
const draft = ref('');
const typing = ref(false);
const typingText = ref('');
const msgsEl = ref(null);

const pet = computed(() => props.pet);
// look 变化（吞噬部件）→ 换 key 强制重建 3D 模型
const modelTag = computed(() => {
  if (!props.pet) return '0';
  const l = props.pet.look ?? {};
  const ex = (props.pet.extraParts ?? []).map(e => `${e.part}=${e.value}`).join(",");
  // colors 参与签名（v12）：保存涂色后主预览重建（savePaint 直接改 props.pet.look，
  // 对象引用变了但 Pet3D 的 watch 是 () => props.pet 引用级——colors 必须进 key）
  const colorSig = l.colors ? JSON.stringify(l.colors) : '';
  return `${props.pet.seed}:${props.pet.phase ?? 0}:${l.ears}-${l.tail}-${l.accessory}-${l.pattern}:${l.eyes}:${l.body}:${ex}:${colorSig}`;
});
// soul 从 soul.js 实时取（详情打开期间好感/记忆变化要反映到 UI）
const soul = computed(() => (props.pet ? ensureSoul(props.pet) : null));
const chat = computed(() => (props.pet ? chatOf(props.pet.uid) : { messages: [], total: 0 }));
const llmReady = computed(() => isLlmConfigured(llmConfig) && llmConfig.enabled);
const traitText = computed(() => traitLabels(soul.value?.traits ?? { warmth: 0, energy: 0, pride: 0, curiosity: 0 }));
// 显示层：四维性格词按当前语言映射（zh 保持中文词）
const traitLine = computed(() => {
  const tt = traitText.value;
  const f = (w) => (locale.value === 'zh' || locale.value === 'zh-TW') ? w : (traitLabelOf(w) ?? w);
  return [f(tt.warmth), f(tt.energy), f(tt.pride), f(tt.curiosity)].join(' · ');
});

const s = computed(() => (props.pet ? statsAt(props.pet, props.pet.level) : { hp: 0, atk: 0, def: 0, spd: 0 }));
const maxHp = computed(() => s.value.hp);
const atkStat = computed(() => s.value.atk);
const defStat = computed(() => s.value.def);
const spdStat = computed(() => s.value.spd);

function ensure(p) {
  return ensureSoul(p);
}

function chipStyle(tp) { return { background: TYPE_COLORS[tp] ?? '#9fa19f' }; }
const typeLabel = (tp) => { void locale.value; return typeNameOf(tp); };
const rarityLabel = (r) => { void locale.value; return rarityLabelOf(r); };
function close() {
  // 未保存涂色草稿 → 确认丢弃（v12：draft 仅存内存，直接关闭会静默丢失）
  if (tab.value === 'paint' && paintDirty.value
    && !confirm(t('有未保存的涂色，确定丢弃并关闭吗？'))) return;
  emit('close');
}

// ---- 分享双按钮：📣 分享 = LLM 生成社交文案+链接；🔗图标 = 仅复制链接 ----
const sharing = ref(false);
// 通用剪贴板写入（含 execCommand 兜底）
function writeClipboard(text, done) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
  } else legacyCopy(text, done);
}
function legacyCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { showToast(t('复制失败，请手动复制地址栏'), 2600); }
  ta.remove();
}
// 图标按钮：仅复制链接
async function copyLink() {
  if (!props.pet) return;
  const url = await shareUrl(props.pet);
  writeClipboard(url, () => showToast(t('分享链接已复制！好友打开即可观赏或挑战'), 3200));
}
// ---- 赠送：#g= 链接（好友领取克隆；自己不失去宠物；不携带任何 LLM 配置）----
const gifting = ref(false);
// ---- 重译：名字/图鉴 → 当前语言（历史存档语言迁移）----
const retranslating = ref(false);
async function retranslate() {
  if (!props.pet || retranslating.value) return;
  retranslating.value = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await retranslatePet(llmConfig, props.pet, ctrl.signal).finally(() => clearTimeout(timer));
    // 写回存档：props.pet 可能是 withStats 的展示拷贝（dexList computed），
    // 必须按 uid 定位 save.pets 里的原对象改字段，否则只改了拷贝不落盘
    const target = save.pets.find(p => p.uid === props.pet.uid);
    if (target) {
      target.name = r.name;
      if (r.lore) target.lore = r.lore;
      // 展示层同步（当前打开的详情卡片立即刷新）
      props.pet.name = r.name;
      if (r.lore) props.pet.lore = r.lore;
      persist();
      showToast(t('已重译为当前语言'), 2400);
    } else {
      showToast(t('重译失败，请稍后再试'), 2600);
    }
  } catch (err) {
    console.warn('重译失败', err);
    showToast(t('重译失败，请稍后再试'), 2600);
  } finally {
    retranslating.value = false;
  }
}
async function gift() {
  if (!props.pet || gifting.value) return;
  gifting.value = true;
  try {
    const url = await giftUrl(props.pet);
    const line1 = t('我把「{name}」赠送给你啦！纯前端小礼物🎁', { name: props.pet.name });
    const line2 = t('打开链接领取一只它的克隆（我的原宠还在我身边，放心）——它的灵魂档案和 AI 聊天会用你自己的配置重新开始。');
    writeClipboard(`${line1}\n${line2}\n${url}`, () => showToast(t('赠送链接已复制！发给好友即可领取（你不会失去它）'), 3600));
  } finally {
    gifting.value = false;
  }
}
// 分享按钮：LLM 生成社交文案（无 LLM/失败降级本地模板），文案+空行+链接一次复制
async function share() {
  if (!props.pet || sharing.value) return;
  sharing.value = true;
  try {
    const url = await shareUrl(props.pet);
    // traitLabels 返回四维对象——拼成一句人话给 LLM/模板用
    const tt = traitText.value;
    const traits = tt ? [tt.warmth, tt.energy, tt.pride, tt.curiosity].map(w => traitLabelOf(w) ?? w).join(', ') : t('活泼可爱');
    const soulCur = soul.value;
    const relation = soulCur ? `${Math.round(soulCur.relation.affinity)}/100 (${relationTitleOf(soulCur.relation.title)})` : t('亲密伙伴');
    let copy = '';
    try {
      // 12s 超时：慢接口不让用户干等
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      copy = await generateShareCopy(llmConfig, props.pet, traits, relation, ctrl.signal).finally(() => clearTimeout(timer));
    } catch (err) {
      console.warn('LLM 分享文案失败，降级本地模板', err);
      copy = localShareCopy(props.pet, traits, relation);
      if (llmReady.value) showToast(t('AI 文案生成失败，已用模板文案'), 2600);
    }
    writeClipboard(`${copy}\n${url}`, () => showToast(t('分享文案+链接已复制，去社交平台粘贴吧！'), 3200));
  } finally {
    sharing.value = false;
  }
}
function fmtTime(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- 涂色（v12）：draft 编辑 → 实时预览 → 保存才写存档 ----
// paintDraft: { body: {v:'#hex'} | {grad:true,f,t} | null }——null=默认色
const paintDraft = reactive({ body: null, belly: null, accent: null, type: null });
const aiScheme = ref('');
const aiPainting = ref(false);

// 预览用宠物：pet 拷贝 + draft 折算成 look.colors（Pet3D watch pet 引用变化重建模型）
const paintPreviewPet = computed(() => {
  if (!props.pet) return null;
  const paint = {};
  for (const s of PAINT_SLOTS) {
    const d = paintDraft[s.key];
    if (!d) continue;
    paint[s.key] = d.grad ? { f: d.f, t: d.t } : d.v;
  }
  const look = applyPaintToLook(props.pet.look, paint);
  return { ...props.pet, look };
});
// dirty：draft 展开后的 colors 与存档里的不同
const paintDirty = computed(() => {
  if (!props.pet) return false;
  const paint = {};
  for (const s of PAINT_SLOTS) {
    const d = paintDraft[s.key];
    if (!d) continue;
    paint[s.key] = d.grad ? { f: d.f, t: d.t } : d.v;
  }
  const nextLook = applyPaintToLook(props.pet.look, paint);
  const a = JSON.stringify(nextLook.colors ?? null);
  const b = JSON.stringify(sanitizeColors(props.pet.look?.colors) ?? null);
  return a !== b;
});
const hasSavedColors = computed(() => (props.pet ? hasCustomColors(props.pet) : false));
// 预览模型 key：look 变了强制 Pet3D 重建（与外层 modelTag 同策略）
const paintModelTag = computed(() => `${modelTag.value}:paint:${JSON.stringify(paintPreviewPet.value?.look?.colors ?? null)}`);

function openPaint() {
  tab.value = 'paint';
  // 从存档回填 draft：已有涂色 → 对应模式；无涂色 → 空（=默认）
  for (const s of PAINT_SLOTS) {
    const cur = props.pet?.look?.colors?.[s.key];
    if (typeof cur === 'string') paintDraft[s.key] = { v: cur };
    else if (cur && typeof cur === 'object') paintDraft[s.key] = { grad: true, f: cur.f, t: cur.t };
    else paintDraft[s.key] = null;
  }
}

function setSlotMode(key, grad) {
  const cur = paintDraft[key];
  if (grad) {
    // 切到渐变：以当前单色为 f 起点（无则取 swatch 第一颗），t 默认白色
    paintDraft[key] = { grad: true, f: cur?.v ?? '#ffd6e0', t: cur?.t ?? '#ffffff' };
  } else {
    // 切回单色：保留 f 色作为单色
    paintDraft[key] = cur?.f ? { v: cur.f } : null;
  }
}
function setSlotColor(key, hex) {
  const cur = paintDraft[key];
  if (cur?.grad) paintDraft[key] = { grad: true, f: hex, t: cur.t };
  else paintDraft[key] = { v: hex };
}
function setSlotGrad(key, part, hex) {
  const cur = paintDraft[key];
  if (cur?.grad) paintDraft[key] = { grad: true, f: part === 'f' ? hex : cur.f, t: part === 't' ? hex : cur.t };
  else paintDraft[key] = { grad: true, f: part === 'f' ? hex : (cur?.v ?? hex), t: part === 't' ? hex : '#ffffff' };
}
function clearSlot(key) { paintDraft[key] = null; }
function applySwatch(hex) {
  // 快捷色板：点到哪个槽的取色器最近？——简化：应用到当前第一个「已有色」的槽，否则 body。
  // 更直觉的交互：按住槽位名高亮——首版先应用到 body（最常用），后续可加槽位选中态
  const target = PAINT_SLOTS.find(s => paintDraft[s.key])?.key ?? 'body';
  setSlotColor(target, hex);
}
function slotHex(key, part = null) {
  const d = paintDraft[key];
  if (!d) {
    // 默认色：从预览宠的 palette 推（与 sprite3d 同源语义）
    return part === 't' ? '#ffffff' : defaultSlotHex(key);
  }
  if (d.grad) return part === 't' ? d.t : d.f;
  return part === 't' ? '#ffffff' : d.v;
}
// 默认槽位色（回填取色器初始值）：body/belly/accent 从 palette，type 从属性色
function defaultSlotHex(key) {
  const idx = Number.isInteger(props.pet?.look?.palette) ? props.pet.look.palette : 0;
  const pal = PALETTES[((idx % PALETTES.length) + PALETTES.length) % PALETTES.length];
  if (key === 'body') return pal.body;
  if (key === 'belly') return pal.belly;
  if (key === 'accent') return pal.accent;
  return TYPE_COLORS[props.pet?.types?.[0]] ?? '#9fa19f';
}
const slotLabel = (slot) => t(slot.label);
async function aiPaint() {
  if (!llmReady.value || aiPainting.value || !props.pet) return;
  aiPainting.value = true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const scheme = await generatePetPaint(llmConfig, props.pet, aiScheme.value, ctrl.signal).finally(() => clearTimeout(timer));
    for (const s of PAINT_SLOTS) {
      const v = scheme[s.key];
      if (!v) continue;
      paintDraft[s.key] = typeof v === 'string' ? { v } : { grad: true, f: v.f, t: v.t };
    }
    showToast(t('AI 配色已应用，满意就点保存吧！'), 2800);
  } catch (err) {
    console.warn('AI 涂色失败', err);
    showToast(t('AI 涂色失败：{err}', { err: err.message }), 3000);
  } finally {
    aiPainting.value = false;
  }
}
function resetPaint() { openPaint(); } // 回滚 draft 到存档基线
function clearAllPaint() {
  if (!props.pet || !confirm(t('清除 {name} 的全部自定义涂色？（恢复默认配色）', { name: props.pet.name }))) return;
  const target = save.pets.find(p => p.uid === props.pet.uid);
  if (!target) return;
  target.look = { ...target.look };
  delete target.look.colors;
  persist();
  // 同步展示层与 draft（retranslate 同款：props 可能是展示拷贝）
  if (props.pet.look) delete props.pet.look.colors;
  for (const s of PAINT_SLOTS) paintDraft[s.key] = null;
  showToast(t('已恢复默认配色'));
}
async function savePaint() {
  if (!props.pet || !paintDirty.value) return;
  const paint = {};
  for (const s of PAINT_SLOTS) {
    const d = paintDraft[s.key];
    if (!d) continue;
    paint[s.key] = d.grad ? { f: d.f, t: d.t } : d.v;
  }
  const nextLook = applyPaintToLook(props.pet.look, paint);
  // 写存档原对象（props.pet 可能是 withStats 展示拷贝——retranslate 已踩过这个坑）
  const target = save.pets.find(p => p.uid === props.pet.uid);
  if (!target) { showToast(t('保存失败，请稍后再试')); return; }
  target.look = nextLook;
  persist();
  // 同步展示层引用（modelTag 现已含 colors，主预览自动重建）
  props.pet.look = nextLook;
  showToast(t('涂色已保存！'), 2400);
}


function scrollBottom() {
  nextTick(() => { if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight; });
}
watch(() => props.pet?.uid, () => { tab.value = 'soul'; nextTick(scrollBottom); });
watch(() => chat.value.messages.length, scrollBottom);
watch(typingText, scrollBottom);

// 应用 LLM 返回的灵魂状态（好感/性格漂移/长期记忆）
function applyState(state, petData) {
  updateSoul(petData.uid, (sl) => {
    if (state.affinityDelta) sl.relation.affinity = Math.max(0, Math.min(100, sl.relation.affinity + state.affinityDelta));
    driftTraits(sl, state.drift);
    if (state.memory) addProfileFact(sl, state.memory);
    touchRelation(sl, 'chat');
  });
}

async function send() {
  const text = draft.value.trim();
  if (!text || !llmReady.value || typing.value || !props.pet) return;
  const petData = { ...props.pet };
  // 深拷贝快照：soul 是同一可变引用，LLM 返回后 applyState 已把 affinity/drift 写入，
  // 再把它传给 maybeCompress 会读到"未来状态"，且异步压缩可能覆盖并发修改
  const soulSnapshot = JSON.parse(JSON.stringify(soul.value));
  const uid = petData.uid;
  draft.value = '';
  // 先取历史快照再 appendChat：chat.value 是 computed，append 之后重新求值会把
  // 刚发的用户消息也带进 recentMessages，而 buildChatMessages 又会追加 userText ——
  // 同一条消息在 prompt 里出现两次（token 浪费 + 模型复读倾向）
  const history = chat.value.messages.map(m => ({ role: m.role, content: m.content }));
  appendChat(petData.uid, 'user', text);


  typing.value = true;
  typingText.value = '';
  try {
    const result = await chatWithSoul(llmConfig, petData, soulSnapshot, text, history);
    typingText.value = '';
    appendChat(petData.uid, 'assistant', result.body);

    applyState(result.state, petData);
    // 压缩用最新的 soul（applyState 已生效）与最新消息，避免旧快照竞态
    maybeCompress(uid, llmConfig, petData, ensureSoul(petData));
  } catch (err) {
    console.warn('聊天失败', err);
    showToast(t('聊天失败：{err}', { err: err.message }));
  } finally {
    typing.value = false;
    typingText.value = '';
  }
}

function clearChat() {
  if (!props.pet) return;
  if (!confirm(t('清空与 {name} 的全部聊天记录？（灵魂档案与长期记忆保留）', { name: props.pet.name }))) return;
  const c = chatOf(props.pet.uid);
  c.messages = []; c.total = 0; c.compressedAt = 0;
  persistChat(); // 立即落盘（此前漏写：仅改缓存，刷新后聊天记录复活）
  showToast(t('聊天记录已清空（长期记忆保留）'));
}
</script>

<style scoped>
.detail-mask {
  position: fixed; inset: 0; z-index: 150;
  background: rgba(40, 48, 70, 0.4); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.detail-card {
  position: relative;
  width: min(96vw, 640px); max-height: 92vh; overflow-y: auto;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(246,248,252,0.94));
  border: 1px solid rgba(120,130,160,0.22); border-radius: 20px;
  box-shadow: 0 24px 60px rgba(40,50,90,0.35);
  padding: 20px 22px;
  animation: detail-pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes detail-pop { from { transform: scale(0.85) translateY(20px); opacity: 0; } to { transform: none; opacity: 1; } }
/* 顶部操作条：flex 排列自适应各语言文案宽度（替代旧的绝对定位——EN 文案更宽会重叠） */
.detail-actions-bar {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 6px; flex-wrap: wrap; margin-bottom: 6px;
}
.detail-close {
  width: 30px; height: 30px; flex-shrink: 0;
  border-radius: 50%; border: none; background: rgba(120,130,160,0.14);
  font-size: 14px; cursor: pointer;
}
.detail-gift {
  height: 30px; padding: 0 12px; flex-shrink: 0;
  border-radius: 15px; border: 1px solid rgba(232,134,44,0.5);
  background: rgba(255,255,255,0.9); color: #d85a20;
  font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
.detail-gift:disabled { opacity: 0.65; cursor: wait; }
.detail-gift:hover:not(:disabled) { background: linear-gradient(120deg, #e8862c, #d85a20); color: #fff; }
.detail-share {
  height: 30px; padding: 0 12px; flex-shrink: 0;
  border-radius: 15px; border: 1px solid rgba(91,127,212,0.45);
  background: rgba(255,255,255,0.9); color: var(--primary-deep, #4664b0);
  font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
.detail-share:disabled { opacity: 0.65; cursor: wait; }
.detail-share:hover:not(:disabled) { background: var(--primary, #5b7fd4); color: #fff; }
/* 链接图标按钮：紧贴分享按钮右侧、挨着关闭钮 */
.detail-share-link {
  width: 30px; height: 30px; flex-shrink: 0;
  border-radius: 50%; border: 1px solid rgba(91,127,212,0.45);
  background: rgba(255,255,255,0.9); color: var(--primary-deep, #4664b0);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  padding: 0;
}
.detail-share-link:hover { background: var(--primary, #5b7fd4); color: #fff; }
.detail-retranslate {
  height: 30px; padding: 0 10px; flex-shrink: 0;
  border-radius: 15px; border: 1px solid rgba(76,175,136,0.5);
  background: rgba(255,255,255,0.9); color: #2e7d5b;
  font-size: 12px; cursor: pointer; white-space: nowrap;
}
.detail-retranslate:disabled { opacity: 0.6; cursor: wait; }
.detail-retranslate:hover:not(:disabled) { background: #4caf88; color: #fff; }
.detail-top { display: flex; gap: 16px; }
.detail-sprite { flex-shrink: 0; }
.detail-meta { flex: 1; min-width: 0; }
.detail-meta h2 { font-size: 20px; margin-bottom: 6px; }
.chips { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.soul-line { font-size: 12px; color: #9c4ab8; margin-bottom: 8px; }
.bond-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bond-title { font-size: 12.5px; font-weight: 700; color: #4664b0; white-space: nowrap; }
.bond-bar { flex: 1; height: 8px; background: rgba(120,130,160,0.2); border-radius: 6px; overflow: hidden; }
.bond-bar i { display: block; height: 100%; background: linear-gradient(90deg, #e8a13c, #e8497c); border-radius: 6px; transition: width 0.4s ease; }
.bond-num { font-size: 11px; color: #6a7288; font-variant-numeric: tabular-nums; }
.detail-stats { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #5a6478; }

.detail-tabs { display: flex; gap: 6px; margin: 14px 0 10px; }
.detail-tabs button {
  flex: 1; padding: 7px 0; font-size: 13px; border-radius: 10px;
  border: 1px solid rgba(120,130,160,0.18); background: rgba(255,255,255,0.7); color: #5a6478;
}
.detail-tabs button.active { background: var(--primary, #5b7fd4); color: #fff; border-color: var(--primary, #5b7fd4); }
.detail-tabs em { font-style: normal; font-size: 11px; opacity: 0.85; }

.chat-msgs {
  height: 220px; overflow-y: auto; padding: 8px;
  background: rgba(120,130,160,0.07); border-radius: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.chat-empty { color: #8a92a5; font-size: 12.5px; text-align: center; margin-top: 70px; line-height: 2; }
.chat-empty .dim { font-size: 11.5px; opacity: 0.75; }
.chat-msg { display: flex; }
.chat-msg.user { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }
.bubble {
  max-width: 78%; padding: 7px 12px; border-radius: 14px;
  font-size: 13px; line-height: 1.6; word-break: break-word;
}
.chat-msg.user .bubble { background: var(--primary, #5b7fd4); color: #fff; border-bottom-right-radius: 4px; }
.chat-msg.assistant .bubble { background: #fff; border: 1px solid rgba(120,130,160,0.2); border-bottom-left-radius: 4px; }
.caret { animation: blink 0.8s steps(1) infinite; font-style: normal; margin-left: 1px; }
@keyframes blink { 50% { opacity: 0; } }
.chat-input { display: flex; gap: 8px; margin-top: 10px; }
.chat-input input {
  flex: 1; border: 1px solid rgba(120,130,160,0.25); border-radius: 10px;
  padding: 9px 12px; font-size: 13px; outline: none; background: #fff;
}
.chat-input input:focus { border-color: var(--primary, #5b7fd4); }
.chat-input .primary { background: var(--primary, #5b7fd4); color: #fff; border: none; border-radius: 10px; padding: 8px 18px; }
.chat-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: #8a92a5; font-size: 11.5px; }
.chat-foot .sm { padding: 3px 10px; font-size: 11.5px; background: transparent; }

.mem-panel {
  min-height: 120px; padding: 10px 12px;
  background: rgba(120,130,160,0.07); border-radius: 12px;
  display: flex; flex-direction: column; gap: 8px;
}

/* ---- 涂色面板（v12） ---- */
.paint-panel { display: flex; flex-direction: column; gap: 10px; }
.paint-body { display: flex; gap: 14px; }
.paint-preview { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.paint-hint { font-size: 10.5px; color: #8a92a5; }
.paint-slots { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.paint-slot {
  background: rgba(255,255,255,0.65); border: 1px solid rgba(120,130,160,0.16);
  border-radius: 10px; padding: 6px 9px;
}
.slot-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.slot-name { font-size: 12px; font-weight: 700; color: #4a5470; }
.slot-clear {
  width: 22px; height: 22px; border-radius: 50%; border: none;
  background: rgba(120,130,160,0.12); color: #5a6478; font-size: 12px; cursor: pointer;
}
.slot-clear:hover { background: rgba(120,130,160,0.25); }
.slot-ctrls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.mode-pick { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.mode-pick input[type='radio'] { accent-color: var(--primary, #5b7fd4); margin: 0; }
.slot-color {
  width: 34px; height: 26px; padding: 0; border: 1px solid rgba(120,130,160,0.3);
  border-radius: 6px; background: #fff; cursor: pointer;
}
.slot-color.sm { width: 26px; }
.grad-pair { display: inline-flex; align-items: center; gap: 3px; }
.grad-arrow { font-size: 11px; color: #8a92a5; }
.swatches { display: flex; gap: 4px; flex-wrap: wrap; }
.swatch {
  width: 20px; height: 20px; border-radius: 6px; border: 1px solid rgba(120,130,160,0.3);
  cursor: pointer; padding: 0;
}
.swatch:hover { transform: scale(1.15); }
.paint-ai { display: flex; gap: 6px; }
.ai-input {
  flex: 1; min-width: 0; border: 1px solid rgba(120,130,160,0.25); border-radius: 10px;
  padding: 7px 10px; font-size: 12px; outline: none; background: #fff;
}
.ai-input:focus { border-color: var(--primary, #5b7fd4); }
.ai-btn {
  flex-shrink: 0; border: none; border-radius: 10px; padding: 7px 12px; font-size: 12px;
  background: linear-gradient(120deg, #9c6ade, #e8497c); color: #fff; cursor: pointer;
  white-space: nowrap;
}
.ai-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.paint-foot { display: flex; align-items: center; gap: 8px; }
.paint-foot .flex1 { flex: 1; }
.paint-save {
  border: none; border-radius: 12px; padding: 8px 20px; font-size: 13px; font-weight: 700;
  background: var(--primary, #5b7fd4); color: #fff; cursor: pointer;
}
.paint-save:hover:not(:disabled) { filter: brightness(1.08); }
.paint-save:disabled { opacity: 0.45; cursor: not-allowed; }
.paint-foot .ghost { background: rgba(120,130,160,0.1); border: none; border-radius: 10px; padding: 6px 12px; color: #5a6478; cursor: pointer; font-size: 12px; }
.paint-foot .ghost:disabled { opacity: 0.45; cursor: not-allowed; }
@media (max-width: 560px) {
  .paint-body { flex-direction: column; align-items: center; }
  .paint-slots { width: 100%; }
}
.mem-item { font-size: 13px; line-height: 1.7; color: #3a4252; }
.mem-item.story small { color: #8a92a5; margin-right: 8px; font-size: 11px; }
.empty { color: #8a92a5; font-size: 12.5px; text-align: center; margin-top: 30px; }

.detail-enter-active, .detail-leave-active { transition: opacity 0.25s ease; }
.detail-enter-from, .detail-leave-to { opacity: 0; }

@media (max-width: 560px) {
  .detail-top { flex-direction: column; align-items: center; text-align: center; }
  .chips { justify-content: center; }
  .detail-stats { justify-content: center; }
}
</style>
