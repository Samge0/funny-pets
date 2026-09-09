// 宠物详情弹窗 v2：档案页签（灵魂/记忆/羁绊）+ 灵魂聊天。
// 灵魂 = persona（seed 掷点固化）+ 三层记忆 + 羁绊成长；聊天即养成。
<template>
  <Transition name="detail">
    <div v-if="pet" class="detail-mask" @click.self="close">
      <div class="detail-card">
        <button class="detail-close" @click="close">✕</button>
        <div class="detail-top">
          <div class="detail-sprite"><Pet3D :key="modelTag" :pet="pet" :size="140" /></div>
          <div class="detail-meta">
            <h2>{{ pet.name }} <small v-if="pet.phase" class="phase-badge">{{ pet.phase }}阶</small></h2>
            <div class="chips">
              <i v-for="t in pet.types" :key="t" class="chip" :style="chipStyle(t)">{{ t }}</i>
              <i class="chip rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityInfo(pet.rarity).name }}</i>
              <i class="chip lv-chip">Lv.{{ pet.level }}</i>
            </div>
            <p class="soul-line">「{{ traitText.warmth }} · {{ traitText.energy }} · {{ traitText.pride }} · {{ traitText.curiosity }}」</p>
            <div class="bond-row">
              <span class="bond-title">{{ soul.relation.title }}</span>
              <div class="bond-bar"><i :style="{ width: Math.round(soul.relation.affinity) + '%' }"></i></div>
              <span class="bond-num">{{ Math.round(soul.relation.affinity) }}</span>
            </div>
            <div class="detail-stats">
              <span>HP {{ maxHp }}</span><span>攻 {{ atkStat }}</span><span>防 {{ defStat }}</span><span>速 {{ spdStat }}</span>
            </div>
          </div>
        </div>

        <div class="detail-tabs">
          <button :class="{ active: tab === 'soul' }" @click="tab = 'soul'">💬 灵魂对话</button>
          <button :class="{ active: tab === 'profile' }" @click="tab = 'profile'">🧠 记忆 <em>{{ soul.memory.profile.length }}</em></button>
          <button :class="{ active: tab === 'story' }" @click="tab = 'story'">📖 经历 <em>{{ soul.memory.episodic.length }}</em></button>
        </div>

        <!-- 灵魂对话 -->
        <div v-if="tab === 'soul'" class="chat-panel">
          <div class="chat-msgs" ref="msgsEl">
            <div v-if="!chat.messages.length" class="chat-empty">
              <p>你们还没有聊过天。</p>
              <p class="dim">它喜欢{{ soul.identity.love }}，讨厌{{ soul.identity.hate }}。聊聊这些它会更喜欢你。</p>
            </div>
            <div v-for="(m, i) in chat.messages" :key="i" class="chat-msg" :class="m.role">
              <span class="bubble">{{ m.content }}</span>
            </div>
            <div v-if="typing" class="chat-msg assistant"><span class="bubble typing">{{ typingText }}<i class="caret">▌</i></span></div>
          </div>
          <form class="chat-input" @submit.prevent="send">
            <input v-model="draft" :placeholder="llmReady ? `和${pet.name}说点什么…` : '需在设置页启用 AI 后聊天'" :disabled="!llmReady || typing" />
            <button type="submit" class="primary" :disabled="!llmReady || typing || !draft.trim()">发送</button>
          </form>
          <div class="chat-foot">
            <small>对话 {{ soul.relation.chats }} 次 · 每 20 条自动沉淀为长期记忆</small>
            <button class="ghost sm" @click="clearChat">清空记录</button>
          </div>
        </div>

        <!-- 长期记忆 -->
        <div v-else-if="tab === 'profile'" class="mem-panel">
          <div v-if="!soul.memory.profile.length" class="empty">还没有沉淀出长期记忆，多和它聊天吧。</div>
          <div v-for="(f, i) in soul.memory.profile" :key="i" class="mem-item">💡 {{ f }}</div>
        </div>

        <!-- 经历 -->
        <div v-else class="mem-panel">
          <div v-if="!soul.memory.episodic.length" class="empty">还没有值得记录的经历。</div>
          <div v-for="(e, i) in [...soul.memory.episodic].reverse()" :key="i" class="mem-item story">
            <small>{{ fmtTime(e.t) }}</small> {{ e.text }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { llmConfig, showToast, rarityInfo } from '../store.js';
import { isLlmConfigured, chatWithSoul } from '../core/llm.js';
import { chatOf, appendChat, maybeCompress, persistChat } from '../chat.js';
import { statsAt } from '../core/evolve.js';
import { ensureSoul, traitLabels, updateSoul, driftTraits, addProfileFact, touchRelation } from '../core/soul.js';
import Pet3D from './Pet3D.vue';
import { TYPE_COLORS } from '../data/types.js';

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
  return `${props.pet.seed}:${props.pet.phase ?? 0}:${l.ears}-${l.tail}-${l.accessory}-${l.pattern}:${l.eyes}:${l.body}:${ex}`;
});
// soul 从 soul.js 实时取（详情打开期间好感/记忆变化要反映到 UI）
const soul = computed(() => (props.pet ? ensureSoul(props.pet) : null));
const chat = computed(() => (props.pet ? chatOf(props.pet.uid) : { messages: [], total: 0 }));
const llmReady = computed(() => isLlmConfigured(llmConfig) && llmConfig.enabled);
const traitText = computed(() => traitLabels(soul.value?.traits ?? { warmth: 0, energy: 0, pride: 0, curiosity: 0 }));

const s = computed(() => (props.pet ? statsAt(props.pet, props.pet.level) : { hp: 0, atk: 0, def: 0, spd: 0 }));
const maxHp = computed(() => s.value.hp);
const atkStat = computed(() => s.value.atk);
const defStat = computed(() => s.value.def);
const spdStat = computed(() => s.value.spd);

function ensure(p) {
  return ensureSoul(p);
}

function chipStyle(t) { return { background: TYPE_COLORS[t] ?? '#9fa19f' }; }
function close() { emit('close'); }
function fmtTime(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  appendChat(petData.uid, 'user', text);


  typing.value = true;
  typingText.value = '';
  try {
    const result = await chatWithSoul(llmConfig, petData, soulSnapshot, text, chat.value.messages);
    typingText.value = '';
    appendChat(petData.uid, 'assistant', result.body);

    applyState(result.state, petData);
    // 压缩用最新的 soul（applyState 已生效）与最新消息，避免旧快照竞态
    maybeCompress(uid, llmConfig, petData, ensureSoul(petData));
  } catch (err) {
    console.warn('聊天失败', err);
    showToast(`聊天失败：${err.message}`);
  } finally {
    typing.value = false;
    typingText.value = '';
  }
}

function clearChat() {
  if (!props.pet) return;
  if (!confirm(`清空与 ${props.pet.name} 的全部聊天记录？（灵魂档案与长期记忆保留）`)) return;
  const c = chatOf(props.pet.uid);
  c.messages = []; c.total = 0; c.compressedAt = 0;
  persistChat(); // 立即落盘（此前漏写：仅改缓存，刷新后聊天记录复活）
  showToast('聊天记录已清空（长期记忆保留）');
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
.detail-close {
  position: absolute; top: 10px; right: 10px; width: 30px; height: 30px;
  border-radius: 50%; border: none; background: rgba(120,130,160,0.14);
  font-size: 14px; cursor: pointer;
}
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
