// 庆祝弹窗组件：捕捉成功 / 进化 / 升级 的全屏嗨点动效。
// 星爆 + 彩带（稀有度越高越华丽）+ 3D 精灵展示 + 缩放弹入。

<template>
  <Transition name="cele">
    <div v-if="celebration.show" class="cele-mask" @click="closeCelebration">
      <div class="cele-stars" aria-hidden="true">
        <span v-for="i in starCount" :key="i" class="star" :style="starStyle(i)">★</span>
      </div>
      <div class="cele-card" :class="'kind-' + celebration.kind" @click.stop>
        <div class="cele-banner">{{ bannerText }}</div>
        <div class="cele-sprite" v-if="celebration.pet">
          <Pet3D :key="modelTag" :pet="displayPet" :size="200" />
        </div>
        <h2 class="cele-name">{{ celebration.pet?.name }}</h2>
        <div class="cele-chips" v-if="celebration.pet">
          <i v-for="t in celebration.pet.types" :key="t" class="chip" :style="chipStyle(t)">{{ t }}</i>
          <i class="chip rarity-chip" :style="{ background: rarityInfo(celebration.pet.rarity).color }">
            {{ rarityInfo(celebration.pet.rarity).name }}
          </i>
        </div>
        <p class="cele-detail" v-if="celebration.detail">{{ celebration.detail }}</p>
        <!-- 升级属性增量 -->
        <div v-if="statChips.length" class="stat-chips">
          <span v-for="c in statChips" :key="c" class="stat-chip">{{ c }}</span>
        </div>
        <p class="cele-lore" v-if="celebration.kind === 'catch' && celebration.pet">{{ celebration.pet.lore }}</p>
        <button class="cele-btn" @click="closeCelebration">太棒了！</button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { celebration, closeCelebration, rarityInfo } from '../store.js';
import Pet3D from './Pet3D.vue';
import { TYPE_COLORS } from '../data/types.js';
import { withStats } from '../store.js';

const bannerText = computed(() => ({
  catch: '🎉 捕捉成功！',
  evolve: '✨ 进化了！',
  levelup: '⬆️ 等级提升！',
  win: '🎉 战斗胜利！',
}[celebration.kind] ?? ''));

// 弹窗内展示带进化形态与实时数值。
// snapshotTag：吞噬/进化改变 look 后给 Pet3D 换 key 强制重建 3D 模型（否则 props.pet 引用不变不触发重建）
const displayPet = computed(() => celebration.pet ? withStats(celebration.pet) : null);
const modelTag = computed(() => {
  if (!celebration.pet) return '0';
  const l = celebration.pet.look ?? {};
  return `${celebration.pet.seed}:${celebration.pet.phase ?? 0}:${l.ears}-${l.tail}-${l.accessory}-${l.pattern}`;
});
// 升级属性增量 chips（statGains 由 winBattle 写入 celebration.detailObj）
const statChips = computed(() => {
  const g = celebration.statGains;
  if (!g) return [];
  const names = { hp: 'HP', atk: '攻击', def: '防御', spd: '速度' };
  return Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => `${names[k]} +${v}`);
});

const starCount = computed(() => ({
  catch: 18, evolve: 26, levelup: 12, win: 14,
}[celebration.kind] ?? 14));

function starStyle(i) {
  const seedRand = (i * 2654435761) % 1000 / 1000;
  const angle = seedRand * Math.PI * 2;
  const dist = 130 + seedRand * 180;
  return {
    left: `calc(50% + ${Math.cos(angle) * dist}px)`,
    top: `calc(50% + ${Math.sin(angle) * dist * 0.7}px)`,
    animationDelay: `${(i % 8) * 0.12}s`,
    animationDuration: `${1.6 + seedRand * 1.4}s`,
    fontSize: `${12 + seedRand * 14}px`,
    color: ['#f4c531', '#e8622c', '#5b7fd4', '#9c4ab8', '#4caf88'][i % 5],
  };
}

function chipStyle(t) {
  return { background: TYPE_COLORS[t] ?? '#9fa19f' };
}
</script>

<style scoped>
.cele-mask {
  position: fixed; inset: 0; z-index: 200;
  background: radial-gradient(circle at 50% 42%, rgba(90, 110, 180, 0.25), rgba(30, 34, 52, 0.55));
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.cele-card {
  position: relative;
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(244,247,255,0.9));
  backdrop-filter: blur(18px);
  border: 1px solid rgba(120,130,160,0.25);
  border-radius: 24px;
  box-shadow: 0 24px 70px rgba(40,50,90,0.4);
  padding: 26px 34px 28px;
  width: min(92vw, 400px);
  text-align: center;
  animation: pop-big 0.55s cubic-bezier(0.18, 1.5, 0.4, 1);
}
@keyframes pop-big {
  0% { transform: scale(0.4) rotate(-6deg); opacity: 0; }
  60% { transform: scale(1.06) rotate(1deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
.kind-evolve .cele-card, .cele-card.kind-evolve { border-color: rgba(156,74,184,0.5); box-shadow: 0 24px 70px rgba(156,74,184,0.35); }
.cele-banner {
  display: inline-block;
  font-size: 20px; font-weight: 800; letter-spacing: 2px;
  color: #fff; padding: 7px 22px; border-radius: 30px;
  background: linear-gradient(120deg, #5b7fd4, #9c4ab8);
  box-shadow: 0 6px 18px rgba(91,127,212,0.45);
  animation: banner-pulse 1.6s ease-in-out infinite;
}
@keyframes banner-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
.cele-sprite { margin: 10px auto 0; animation: sprite-bounce 2s ease-in-out infinite; }
@keyframes sprite-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.cele-name { font-size: 24px; margin-top: 4px; }
.cele-chips { display: flex; gap: 6px; justify-content: center; margin: 8px 0 6px; }
.cele-detail { color: #4664b0; font-weight: 700; font-size: 14px; margin: 4px 0; }
.cele-lore { color: #6a7288; font-size: 12.5px; line-height: 1.7; margin: 6px 0 2px; }
.stat-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 8px 0 2px; }
.stat-chip {
  background: rgba(76, 175, 136, 0.14); color: #2e7d5b;
  border: 1px solid rgba(76, 175, 136, 0.4); border-radius: 14px;
  padding: 3px 12px; font-size: 12.5px; font-weight: 700;
}
.cele-btn {
  margin-top: 16px; padding: 11px 40px; font-size: 15px; font-weight: 700;
  color: #fff; border: none; border-radius: 30px; cursor: pointer;
  background: linear-gradient(120deg, #4caf88, #5b9fd4);
  box-shadow: 0 8px 20px rgba(76,175,136,0.45);
  transition: transform 0.15s ease;
}
.cele-btn:hover { transform: translateY(-2px) scale(1.03); }

/* 星星爆散 */
.cele-stars { position: absolute; inset: 0; pointer-events: none; }
.star {
  position: absolute; left: 50%; top: 50%;
  animation: star-fly 2s ease-out infinite;
  opacity: 0;
  filter: drop-shadow(0 0 6px currentColor);
}
@keyframes star-fly {
  0% { transform: translate(0, 0) scale(0.3) rotate(0deg); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translate(calc(var(--tx, 0px)), calc(var(--ty, -120px))) scale(1.1) rotate(220deg); opacity: 0; }
}

.cele-enter-active { transition: opacity 0.25s ease; }
.cele-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.cele-enter-from, .cele-leave-to { opacity: 0; }
.cele-leave-to .cele-card { transform: scale(0.85); }
</style>
