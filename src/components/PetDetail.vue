// 宠物详情弹窗：3D 展示 + 数值 + 技能 + 与宠物聊天（LLM 流式感、每宠独立记忆、20 轮自动压缩）。
<template>
  <Transition name="detail">
    <div v-if="pet" class="detail-mask" @click.self="close">
      <div class="detail-card">
        <button class="detail-close" @click="close">✕</button>
        <div class="detail-top">
          <div class="detail-sprite"><Pet3D :pet="pet" :size="150" /></div>
          <div class="detail-meta">
            <h2>{{ pet.name }} <small v-if="pet.phase" class="phase-badge">{{ pet.phase }}阶</small></h2>
            <div class="chips">
              <i v-for="t in pet.types" :key="t" class="chip" :style="chipStyle(t)">{{ t }}</i>
              <i class="chip rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityInfo(pet.rarity).name }}</i>
              <i class="chip lv-chip">Lv.{{ pet.level }}</i>
            </div>
            <div class="detail-stats">
              <span>HP {{ maxHp }}</span><span>攻 {{ atkStat }}</span><span>防 {{ defStat }}</span><span>速 {{ spdStat }}</span>
              <span>性格 {{ pet.nature?.name ?? '—"' }}</span>
            </div>
            <div class="detail-moves">
              <span v-for="mv in pet.moves" :key="mv.name" class="move-tag" :style="{ '--tc': chipStyle(mv.type ?? pet.types[0]).background }">
                {{ mv.name }}<small>{{ mv.power ?? '变' }}</small>
              </span>
            </div>
            <p class="detail-lore">{{ pet.lore }}</p>
          </div>
        </div>

        <div class="chat-panel">
          <div class="chat-head">
            💬 和 {{ pet.name }} 聊聊
            <small v-if="!llmReady">（需在设置页配置 AI 接口后使用）</small>
            <small v-else-if="chat.summary">（记得：{{ chat.summary.slice(0, 40) }}…）</small>
          </div>
          <div class="chat-msgs" ref="msgsEl">
            <div v-if="!chat.messages.length" class="chat-empty">
              和 {{ pet.name}} 说点什么吧，它会记得你们聊过的内容。
            </div>
            <div v-for="(m, i) in chat.messages" :key="i" class="chat-msg" :class="m.role">
              <span class="bubble">{{ m.content }}</span>
            </div>
            <div v-if="typing" class="chat-msg assistant"><span class="bubble typing">{{ typingText }}<i class="caret">▌</i></span></div>
          </div>
          <form class="chat-input" @submit.prevent="send">
            <input v-model="draft" :placeholder="llmReady ? `和${pet.name}说点什么…` : '配置 AI 后可聊天'" :disabled="!llmReady || typing" />
            <button type="submit" class="primary" :disabled="!llmReady || typing || !draft.trim()">发送</button>
          </form>
          <div class="chat-foot">
            <small>共 {{ chat.total }} 条对话 · 每 20 条自动整理回忆</small>
            <button class="ghost sm" @click="clearChat" title="清空这只宠物的聊天记录">清空记录</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { llmConfig, showToast, rarityInfo } from '../store.js';
import { isLlmConfigured, chatWithLlm } from '../core/llm.js';
import { chatOf, appendChat, maybeCompress, exportChats } from '../chat.js';
import { statsAt } from '../core/evolve.js';
import Pet3D from './Pet3D.vue';
import { TYPE_COLORS } from '../data/types.js';

const props = defineProps({ pet: { type: Object, default: null } });
const emit = defineEmits(['close']);

const draft = ref('');
const typing = ref(false);
const typingText = ref('');
const msgsEl = ref(null);

const pet = computed(() => props.pet);
const llmReady = computed(() => isLlmConfigured(llmConfig) && llmConfig.enabled);

const chat = computed(() => (props.pet ? chatOf(props.pet.uid) : { messages: [], total: 0, summary: '' }));
const s = computed(() => (props.pet ? statsAt(props.pet, props.pet.level) : { hp: 0, atk: 0, def: 0, spd: 0 }));
const maxHp = computed(() => s.value.hp);
const atkStat = computed(() => s.value.atk);
const defStat = computed(() => s.value.def);
const spdStat = computed(() => s.value.spd);

function chipStyle(t) { return { background: TYPE_COLORS[t] ?? '#9fa19f' }; }
function close() { emit('close'); }

function scrollBottom() {
  nextTick(() => { if (msgsEl.value) msgsEl.value.scrollTop = msgsEl.value.scrollHeight; });
}
watch(() => props.pet?.uid, () => nextTick(scrollBottom));
watch(() => chat.value.messages.length, scrollBottom);

async function send() {
  const text = draft.value.trim();
  if (!text || !llmReady.value || typing.value || !props.pet) return;
  const petData = props.pet;
  draft.value = '';
  appendChat(petData.uid, 'user', text);

  typing.value = true;
  typingText.value = '';
  try {
    const reply = await chatWithLlm(llmConfig, petData, text, chat.value.messages);
    typingText.value = '';
    appendChat(petData.uid, 'assistant', reply);
    // 20 条自动压缩（异步，不阻塞）
    maybeCompress(petData.uid, llmConfig, petData);
  } catch (err) {
    console.warn('聊天失败', err);
    typing.value = false;
    typingText.value = '';
    showToast(`聊天失败：${err.message}`);
    return;
  }
  typing.value = false;
  typingText.value = '';
}

function clearChat() {
  if (!props.pet) return;
  if (!confirm(`清空与 ${props.pet.name} 的全部聊天记录？`)) return;
  const store = exportChats();
  delete store[props.pet.uid];
  // 直接重置该宠的记录
  const c = chatOf(props.pet.uid);
  c.summary = ''; c.messages = []; c.total = 0; c.compressedAt = 0;
  // 简化处理：写回
  import('../chat.js').then(m => { /* no-op，保持单入口 */ });
  showToast('聊天记录已清空');
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
.detail-stats { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #5a6478; margin-bottom: 8px; }
.detail-moves { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.move-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 8px;
  background: rgba(255,255,255,0.9); border-left: 3px solid var(--tc);
  border-top: 1px solid rgba(120,130,160,0.15); border-right: 1px solid rgba(120,130,160,0.15); border-bottom: 1px solid rgba(120,130,160,0.15);
}
.move-tag small { color: #6a7288; margin-left: 3px; }
.detail-lore { font-size: 12.5px; color: #6a7288; line-height: 1.7; }

.chat-panel {
  margin-top: 14px; border-top: 1px solid rgba(120,130,160,0.16); padding-top: 12px;
  display: flex; flex-direction: column;
}
.chat-head { font-size: 13.5px; font-weight: 700; margin-bottom: 8px; }
.chat-head small { font-weight: 400; color: #8a92a5; }
.chat-msgs {
  height: 220px; overflow-y: auto; padding: 8px;
  background: rgba(120,130,160,0.07); border-radius: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.chat-empty { color: #8a92a5; font-size: 12.5px; text-align: center; margin-top: 80px; }
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

.detail-enter-active, .detail-leave-active { transition: opacity 0.25s ease; }
.detail-enter-from, .detail-leave-to { opacity: 0; }

@media (max-width: 560px) {
  .detail-top { flex-direction: column; align-items: center; text-align: center; }
  .chips { justify-content: center; }
  .detail-stats { justify-content: center; }
  .detail-moves { justify-content: center; }
}
</style>
