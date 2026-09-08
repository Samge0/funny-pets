// 吞噬选择弹窗：战利品提案 → 玩家自选入手方式。
// 技能：可「新增」（不设上限）或「替换任意现有技能」；部件：直接替换对应维度。
<template>
  <Transition name="devour">
    <div v-if="offer.show" class="devour-mask" @click.self="confirmAll">
      <div class="devour-card">
        <div class="devour-banner">🍖 吞噬时刻！</div>
        <p class="devour-sub">{{ offer.petName }} 可以吞噬 {{ offer.defeatedName }} 的部分特征——选择你要的战利品：</p>

        <!-- 技能候选 -->
        <div v-if="offer.moves.length" class="devour-section">
          <h4>⚔️ 技能</h4>
          <div v-for="(mv, mi) in offer.moves" :key="mv.name" class="devour-item">
            <label class="devour-take">
              <input type="checkbox" v-model="takeMove[mi]" />
              <span class="mv-name" :style="{ '--type-color': typeColor(mv.type) }">{{ mv.name }}</span>
              <small>{{ mv.power ? `威力 ${mv.power}` : '变化技' }}</small>
            </label>
            <div class="devour-how" v-if="takeMove[mi]">
              <label class="how-opt">
                <input type="radio" :name="'mvhow-' + mi" :value="'new'" v-model="moveHow[mi]" />
                新学会（当前 {{ offer.currentMoves.length }} 个技能）
              </label>
              <label class="how-opt" v-for="(cm, ci) in offer.currentMoves" :key="ci">
                <input type="radio" :name="'mvhow-' + mi" :value="ci" v-model="moveHow[mi]" />
                替换「{{ cm.name }}」
              </label>
            </div>
          </div>
        </div>

        <!-- 部件候选 -->
        <div v-if="offer.parts.length" class="devour-section">
          <h4>🎨 外观部件</h4>
          <div v-for="(pp, pi) in offer.parts" :key="pp.part + pp.theirs" class="devour-item">
            <label class="devour-take">
              <input type="checkbox" v-model="takePart[pi]" />
              <span class="part-name">{{ partLabel(pp.part) }}：{{ pp.theirs }}</span>
              <small>当前 {{ partLabel(pp.part) }}：{{ offer.currentLook[pp.part] ?? 'none' }}</small>
            </label>
          </div>
        </div>

        <div class="devour-actions">
          <button class="ghost" @click="confirmAll">跳过</button>
          <button class="primary" @click="confirmAll">确认吞噬</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { reactive, watch, computed } from 'vue';
import { offer, resolveOffer } from '../store.js';
import { PART_LABELS } from '../core/evolve.js';
import { TYPE_COLORS } from '../data/types.js';

const takeMove = reactive([]);
const takePart = reactive([]);
const moveHow = reactive([]);

// 每次新提案初始化勾选状态
watch(() => offer.token, () => {
  takeMove.splice(0, takeMove.length, ...offer.moves.map(() => true));   // 默认全选
  takePart.splice(0, takePart.length, ...offer.parts.map(() => true));
  moveHow.splice(0, moveHow.length, ...offer.moves.map(() => 'new'));    // 默认新增
}, { immediate: true });

const partLabel = p => PART_LABELS[p] ?? p;
const typeColor = t => TYPE_COLORS[t] ?? '#9fa19f';

function confirmAll() {
  const movePicks = [];
  offer.moves.forEach((mv, mi) => {
    if (!takeMove[mi]) return;
    const how = moveHow[mi];
    movePicks.push({ move: mv, replaceIndex: how === 'new' ? null : Number(how) });
  });
  const partPicks = [];
  offer.parts.forEach((pp, pi) => {
    if (takePart[pi]) partPicks.push(pp);
  });
  resolveOffer(movePicks, partPicks);
}
</script>

<style scoped>
.devour-mask {
  position: fixed; inset: 0; z-index: 210;
  background: rgba(30, 34, 52, 0.5); backdrop-filter: blur(5px);
  display: flex; align-items: center; justify-content: center;
}
.devour-card {
  background: linear-gradient(180deg, rgba(255,255,255,0.97), rgba(244,247,255,0.94));
  border: 1px solid rgba(120,130,160,0.3); border-radius: 22px;
  box-shadow: 0 20px 60px rgba(40,50,90,0.4);
  width: min(92vw, 460px); max-height: 86vh; overflow-y: auto;
  padding: 22px 24px;
  animation: devour-pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes devour-pop { from { transform: scale(0.85) translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
.devour-banner {
  text-align: center; font-size: 19px; font-weight: 800; color: #b3541e;
  background: linear-gradient(120deg, rgba(244,168,60,0.25), rgba(232,98,44,0.2));
  border-radius: 12px; padding: 8px 0; margin-bottom: 8px;
}
.devour-sub { text-align: center; color: #6a7288; font-size: 12.5px; margin: 0 0 12px; }
.devour-section h4 { margin: 10px 0 6px; font-size: 13.5px; color: #3a4252; }
.devour-item {
  border: 1px solid var(--border, rgba(120,130,160,0.2)); border-radius: 12px;
  padding: 8px 10px; margin-bottom: 8px; background: rgba(120,130,160,0.05);
}
.devour-take { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13.5px; }
.devour-take small { color: #8a92a5; margin-left: auto; }
.mv-name { font-weight: 700; border-left: 3px solid var(--type-color, #5b7fd4); padding-left: 6px; }
.part-name { font-weight: 700; }
.devour-how { margin-top: 6px; padding-left: 24px; display: flex; flex-direction: column; gap: 3px; }
.how-opt { font-size: 12px; color: #4a5262; display: flex; align-items: center; gap: 5px; cursor: pointer; }
.devour-actions { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.devour-actions .primary { background: linear-gradient(120deg, #e8862c, #d85a20); color: #fff; border: none; border-radius: 24px; padding: 10px 30px; font-weight: 700; }
.devour-actions .ghost { background: transparent; border: none; color: #8a92a5; }
.devour-enter-active, .devour-leave-active { transition: opacity 0.25s ease; }
.devour-enter-from, .devour-leave-to { opacity: 0; }
</style>
