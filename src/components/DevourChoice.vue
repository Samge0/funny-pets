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

          <!-- 右：候选列表（部件在前：与左侧预览联动最直观；技能在后） -->
          <div class="choices-pane">
            <!-- 部件候选 -->
            <div v-if="offer.parts.length" class="devour-section">
              <h4>🎨 外观部件（勾选实时预览）</h4>
              <div v-for="(pp, pi) in offer.parts" :key="pp.part + pp.theirs" class="devour-item" :class="{ picked: takePart[pi], 'devour-item-body': pp.part === 'body' }">
                <label class="devour-take">
                  <input type="checkbox" v-model="takePart[pi]" />
                  <span class="part-name">{{ partLabel(pp.part) }}</span>
                  <span v-if="pp.part === 'body'" class="body-tag">🦴 换骨架：头身手脚形态全变</span>
                  <span class="part-mode-tag">{{ partMode(pp, pi) }}</span>
                  <span class="part-preview">
                    <img class="preview-img" :src="previewSvg(pp.part, offer.currentLook[pp.part])" alt="吞前" width="48" height="48" />
                    <span class="preview-arrow">→</span>
                    <img class="preview-img after" :src="previewSvg(pp.part, pp.theirs)" alt="吞后" width="48" height="48" />
                  </span>
                </label>
                <!-- 入手方式（已有部件时可选叠加/替换；空槽自动长出；body 固定替换） -->
                <div class="devour-how part-how" v-if="takePart[pi] && canChooseHow(pp)">
                  <label class="how-opt">
                    <input type="radio" :name="'pthow-' + pi" value="stack" v-model="partHow[pi]" />
                    ➕ 叠加（保留原{{ partLabel(pp.part)}}，多长一件）
                  </label>
                  <label class="how-opt">
                    <input type="radio" :name="'pthow-' + pi" value="replace" v-model="partHow[pi]" />
                    🔄 替换（原{{ partLabel(pp.part) }}换成它）
                  </label>
                </div>
              </div>
            </div>

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
import { PART_LABELS, LOOK_TO_SKELETON } from '../core/evolve.js';
import { TYPE_COLORS } from '../data/types.js';
import { petSvg } from '../core/sprites.js';
import Pet3D from './Pet3D.vue';

const takeMove = reactive([]);
const takePart = reactive([]);
const partHow = reactive([]); // 每个部件候选的入手方式：'stack' | 'replace'（空槽/body 无此项）
const moveHow = reactive([]);

watch(() => offer.token, () => {
  takeMove.splice(0, takeMove.length, ...offer.moves.map(() => true));
  takePart.splice(0, takePart.length, ...offer.parts.map(() => true));
  moveHow.splice(0, moveHow.length, ...offer.moves.map(() => 'new'));
  partHow.splice(0, partHow.length, ...offer.parts.map(pp => (pp.part === 'body' || isEmptySlot(pp)) ? 'auto' : 'stack'));
}, { immediate: true });

const isEmptySlot = pp => {
  const cur = offer.currentLook[pp.part];
  return cur == null || cur === 'none' || cur === '';
};

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
// 部件入手模式：空槽=长出（新增）/ body=体型替换 / pattern|eyes=单值部件强制换上 / 其余=可叠加或替换（用户选）
const canChooseHow = pp => pp.part !== 'body' && pp.part !== 'pattern' && pp.part !== 'eyes' && !isEmptySlot(pp);
function partMode(pp, pi) {
  if (pp.part === 'body') return '体型替换';
  if (isEmptySlot(pp)) return '🌱 长出';
  if (pp.part === 'pattern' || pp.part === 'eyes') return '🔄 换上';
  return partHow[pi] === 'replace' ? '🔄 替换' : '➕ 叠加';
}

function previewSvg(part, value) {
  const look = { ...offer.currentLook, [part]: value };
  const pet = { seed: offer.seed ?? 1, name: '预览', types: offer.petTypes ?? ['一般'], look };
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(petSvg(pet, 48));
}

// ---- 实时合体预览：出战宠本体 + 勾选部件（叠加/替换由 partHow 决定，与 applyDevour 一致） ----
const BODY_MAP = LOOK_TO_SKELETON; // 引擎单一事实源（此前两处各抄一份，易漂移）
const previewPet = computed(() => {
  const look = { ...offer.currentLook };
  const extraParts = [...(offer.currentExtraParts ?? [])];
  let bodySwallowed = false; // 是否勾选了 body 吞噬（只有此时才切换骨架）
  offer.parts.forEach((pp, pi) => {
    if (!takePart[pi]) return;
    const cur = look[pp.part];
    const isEmpty = cur == null || cur === 'none' || cur === '';
    if (pp.part === 'body') {
      look.body = pp.theirs;
      bodySwallowed = true;
    } else if (isEmpty) {
      look[pp.part] = pp.theirs;           // 长出
    } else if (partHow[pi] === 'replace' || pp.part === 'pattern' || pp.part === 'eyes') {
      // 替换或单值部件（pattern/eyes 叠加无视觉意义，引擎强制替换，预览同步）
      look[pp.part] = pp.theirs;
      for (let i = extraParts.length - 1; i >= 0; i--) if (extraParts[i].part === pp.part) extraParts.splice(i, 1);
    } else {
      extraParts.push({ part: pp.part, value: pp.theirs }); // 叠加
    }
  });
  // 引擎行为对齐：叠加上限 8 件 + 同款去重
  const seen = new Map();
  for (const e of extraParts.slice(-8)) seen.set(`${e.part}:${e.value}`, e);
  const extraFinal = [...seen.values()];
  const pet = {
    seed: offer.seed ?? 1,
    name: offer.petName || '预览',
    types: offer.petTypes ?? ['一般'],
    look,
    extraParts: extraFinal,
    level: 5,
    phase: offer.petPhase ?? 0,
  };
  // 骨架：勾了 body 吞噬才映射新骨架；否则严格保留出战宠当前骨架
  // （此前 look.body='round' 会被误映射成 mochi——取消勾选后骨架漂移，看起来像变成了对面精灵）
  if (bodySwallowed && BODY_MAP[look.body]) pet.bodyType = BODY_MAP[look.body];
  else pet.bodyType = offer.petBodyType ?? undefined;
  return pet;
});
const previewTag = computed(() => JSON.stringify(previewPet.value.look) + '|' + JSON.stringify(previewPet.value.extraParts ?? []));
const changedParts = computed(() =>
  offer.parts.filter((pp, pi) => takePart[pi]).map(pp => `${partLabel(pp.part)}${partMode(pp, offer.parts.indexOf(pp)) === '➕ 叠加' ? '叠加' : partMode(pp, offer.parts.indexOf(pp)) === '🔄 替换' ? '换上' : '→'}${valueLabel(pp.part, pp.theirs)}`)
);

// 测试探针：暴露预览宠数据（E2E 验证骨架不漂移用；生产无副作用）
if (typeof window !== 'undefined') {
  watch(previewPet, p => { window.__devourPreviewPet = p; }, { immediate: true });
}

function confirmAll() {
  const movePicks = [];
  offer.moves.forEach((mv, mi) => {
    if (!takeMove[mi]) return;
    const how = moveHow[mi];
    movePicks.push({ move: mv, replaceIndex: how === 'new' ? null : Number(how) });
  });
  const partPicks = [];
  offer.parts.forEach((pp, pi) => {
    if (!takePart[pi]) return;
    partPicks.push({ ...pp, mode: partHow[pi] ?? 'auto' });
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
/* body（体型）候选：换骨架的重磅选项，视觉强调 */
.devour-item-body { border-color: rgba(156,74,184,0.5); background: rgba(156,74,184,0.06); }
.devour-item-body.picked { border-color: rgba(156,74,184,0.75); background: rgba(156,74,184,0.12); }
.body-tag {
  font-size: 10px; color: #7a3aa8; background: rgba(156,74,184,0.14);
  border: 1px solid rgba(156,74,184,0.45); border-radius: 8px; padding: 1px 7px;
  font-weight: 700;
}
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
.part-how .how-opt { color: #2e5d4b; }
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
