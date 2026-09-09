// 吞噬选择弹窗 v3：战利品提案 → 玩家自选。
// 布局：左侧=实时预览（出战宠本体+勾选叠加效果），右侧=技能/部件候选列表。
// 预览对象是我方出战宠的完整数据（含 phase 光效/当前骨架/已有叠加件）。
<template>
  <Transition name="devour">
    <div v-if="offer.show" class="devour-mask" @click.self="confirmAll">
      <div class="devour-card">
        <div class="devour-banner">🍖 吞噬时刻！</div>
        <p class="devour-sub">{{ offer.petName }} 可以吞噬 {{ offer.defeatedName }} 的部分特征——选择你要的战利品：</p>

        <div class="devour-body">
          <!-- 左：实时预览（跟随勾选即时变化） -->
          <div class="preview-pane">
            <div class="live-stage"><Pet3D :key="previewTag" :pet="previewPet" :size="168" /></div>
            <p class="live-hint">{{ changedParts.length ? changedParts.join(' + ') : '勾选部件即时预览' }}</p>
            <p class="live-sub">👆 可拖动旋转查看</p>
          </div>

          <!-- 右：候选列表 -->
          <div class="choices-pane">
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
                    新学会（当前 {{ offer.currentMoves.length }} 个）
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
              <h4>🎨 外观部件（勾选实时预览）</h4>
              <div v-for="(pp, pi) in offer.parts" :key="pp.part + pp.theirs" class="devour-item" :class="{ picked: takePart[pi] }">
                <label class="devour-take">
                  <input type="checkbox" v-model="takePart[pi]" />
                  <span class="part-name">{{ partLabel(pp.part) }}</span>
                  <span class="part-mode-tag">{{ partMode(pp) }}</span>
                  <span class="part-preview">
                    <img class="preview-img" :src="previewSvg(pp.part, offer.currentLook[pp.part])" alt="吞前" width="48" height="48" />
                    <span class="preview-arrow">→</span>
                    <img class="preview-img after" :src="previewSvg(pp.part, pp.theirs)" alt="吞后" width="48" height="48" />
                  </span>
                </label>
              </div>
            </div>
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
import { petSvg } from '../core/sprites.js';
import Pet3D from './Pet3D.vue';

const takeMove = reactive([]);
const takePart = reactive([]);
const moveHow = reactive([]);

watch(() => offer.token, () => {
  takeMove.splice(0, takeMove.length, ...offer.moves.map(() => true));
  takePart.splice(0, takePart.length, ...offer.parts.map(() => true));
  moveHow.splice(0, moveHow.length, ...offer.moves.map(() => 'new'));
}, { immediate: true });

const partLabel = p => PART_LABELS[p] ?? p;
const typeColor = t => TYPE_COLORS[t] ?? '#9fa19f';

const VALUE_LABELS = {
  none: '无', round: '圆', pointy: '尖', long: '长', fin: '鳍',
  stub: '短尾', curl: '卷尾', fluff: '绒尾', spark: '电尾',
  flower: '小花', leaf: '叶芽', horn: '小角', gem: '额晶',
  spots: '斑点', stripe: '条纹', belly: '肚皮',
  dot: '豆豆眼', sleepy: '眯眯眼', sparkle: '星星眼',
  round_body: '圆滚滚', pear: '梨形', tall: '瘦长', blob: '软团', drop: '水滴',
};
function valueLabel(part, v) {
  if (v == null || v === 'none') return '无';
  if (part === 'body') return VALUE_LABELS[v + '_body'] ?? v;
  return VALUE_LABELS[v] ?? v;
}
// 部件入手模式：空槽=长出（新增）/ 已有=叠加挂件 / body=体型替换
function partMode(pp) {
  const cur = offer.currentLook[pp.part];
  if (pp.part === 'body') return '体型替换';
  if (cur == null || cur === 'none' || cur === '') return '🌱 长出';
  return '➕ 叠加';
}

function previewSvg(part, value) {
  const look = { ...offer.currentLook, [part]: value };
  const pet = { seed: offer.seed ?? 1, name: '预览', types: offer.petTypes ?? ['一般'], look };
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(petSvg(pet, 48));
}

// ---- 实时合体预览：出战宠本体 + 勾选部件（按 applyDevour 同款逻辑：空槽长出/已有叠加/body 替换） ----
const BODY_MAP = { round: 'mochi', pear: 'bipedal', tall: 'bipedal', blob: 'quadruped', drop: 'serpent' };
const previewPet = computed(() => {
  const look = { ...offer.currentLook };
  const extraParts = [...(offer.currentExtraParts ?? [])];
  offer.parts.forEach((pp, pi) => {
    if (!takePart[pi]) return;
    const cur = look[pp.part];
    const isEmpty = cur == null || cur === 'none' || cur === '';
    if (pp.part === 'body') {
      look.body = pp.theirs;
    } else if (isEmpty) {
      look[pp.part] = pp.theirs;           // 长出
    } else {
      extraParts.push({ part: pp.part, value: pp.theirs }); // 叠加
    }
  });
  const pet = {
    seed: offer.seed ?? 1,
    name: offer.petName || '预览',
    types: offer.petTypes ?? ['一般'],
    look,
    extraParts,
    level: 5,
    phase: offer.petPhase ?? 0,
  };
  if (look.body && BODY_MAP[look.body]) pet.bodyType = BODY_MAP[look.body];
  else if (offer.petBodyType) pet.bodyType = offer.petBodyType;
  return pet;
});
const previewTag = computed(() => JSON.stringify(previewPet.value.look) + '|' + JSON.stringify(previewPet.value.extraParts ?? []));
const changedParts = computed(() =>
  offer.parts.filter((pp, pi) => takePart[pi]).map(pp => `${partLabel(pp.part)}${partMode(pp) === '➕ 叠加' ? '叠加' : '→'}${valueLabel(pp.part, pp.theirs)}`)
);

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
  width: min(94vw, 640px); max-height: 88vh; overflow-y: auto;
  padding: 20px 22px;
  animation: devour-pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes devour-pop { from { transform: scale(0.85) translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
.devour-banner {
  text-align: center; font-size: 19px; font-weight: 800; color: #b3541e;
  background: linear-gradient(120deg, rgba(244,168,60,0.25), rgba(232,98,44,0.2));
  border-radius: 12px; padding: 8px 0; margin-bottom: 8px;
}
.devour-sub { text-align: center; color: #6a7288; font-size: 12.5px; margin: 0 0 12px; }
.devour-body { display: flex; gap: 14px; align-items: flex-start; }
.preview-pane {
  flex-shrink: 0; width: 190px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: radial-gradient(circle at 50% 40%, rgba(255,244,230,0.9), rgba(255,255,255,0.4));
  border: 1.5px dashed rgba(232,134,44,0.45); border-radius: 16px;
  padding: 8px 6px 8px; position: sticky; top: 0;
}
.live-stage { width: 168px; height: 168px; }
.live-hint { font-size: 11.5px; color: #b3541e; margin: 0; min-height: 15px; text-align: center; font-weight: 600; }
.live-sub { font-size: 10.5px; color: #a8b0c0; margin: 0; }
.choices-pane { flex: 1; min-width: 0; }
.devour-section h4 { margin: 2px 0 6px; font-size: 13.5px; color: #3a4252; }
.devour-item {
  border: 1px solid var(--border, rgba(120,130,160,0.2)); border-radius: 12px;
  padding: 7px 9px; margin-bottom: 8px; background: rgba(120,130,160,0.05);
}
.devour-item.picked { border-color: rgba(232,134,44,0.55); background: rgba(232,134,44,0.07); }
.devour-take { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13.5px; flex-wrap: wrap; }
.devour-take small { color: #8a92a5; margin-left: auto; }
.mv-name { font-weight: 700; border-left: 3px solid var(--type-color, #5b7fd4); padding-left: 6px; }
.part-name { font-weight: 700; }
.part-mode-tag {
  font-size: 10px; color: #2e7d5b; background: rgba(76,175,136,0.14);
  border: 1px solid rgba(76,175,136,0.4); border-radius: 8px; padding: 1px 7px;
}
.part-preview { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
.preview-img { border-radius: 8px; border: 1px solid rgba(120,130,160,0.25); background: #f4f7fc; }
.preview-img.after { border-color: rgba(232,134,44,0.55); background: #fdf4ec; }
.preview-arrow { color: #b3541e; font-weight: 800; font-size: 13px; }
.devour-how { margin-top: 6px; padding-left: 24px; display: flex; flex-direction: column; gap: 3px; }
.how-opt { font-size: 12px; color: #4a5262; display: flex; align-items: center; gap: 5px; cursor: pointer; }
.devour-actions { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.devour-actions .primary { background: linear-gradient(120deg, #e8862c, #d85a20); color: #fff; border: none; border-radius: 24px; padding: 10px 30px; font-weight: 700; }
.devour-actions .ghost { background: transparent; border: none; color: #8a92a5; }
.devour-enter-active, .devour-leave-active { transition: opacity 0.25s ease; }
.devour-enter-from, .devour-leave-to { opacity: 0; }
@media (max-width: 560px) {
  .devour-body { flex-direction: column; align-items: stretch; }
  .preview-pane { width: 100%; position: static; }
  .live-stage { margin: 0 auto; }
}
</style>
