<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { save, showToast, spawnWild, adoptPet, party, withStats, gainExp, persist, rarityInfo, mapInfo, isMapUnlocked, mapLevelRange, llmConfig, saveLlmConfig, petByUid, celebration, closeCelebration, celebrate } from './store.js';
import { MAPS } from './data/maps.js';
import { petSvg } from './core/sprites.js';
import { isLlmConfigured, generatePetWithLlm, tauntWithLlm, localTaunt } from './core/llm.js';
import { newBattleState, battleTurn, catchChance } from './core/battle.js';
import { statsAt } from './core/evolve.js';
import { TYPE_COLORS } from './data/types.js';
import { exportSaveText, importSaveText } from './storage.js';
import Pet3D from './components/Pet3D.vue';
import Celebration from './components/Celebration.vue';
import PetDetail from './components/PetDetail.vue';

const view = ref('map'); // map | encounter | battle | dex | settings
const spawning = ref(false);
const wild = ref(null);
const battle = ref(null);
const battleLog = ref([]);
const battleBusy = ref(false);
const lastExpGain = ref(0);
// 详情弹窗 + 丢球限制
const detailPet = ref(null);
const ballsLeft = ref(5);        // 每只野生精灵限 5 次直接丢球
const BALLS_MAX = 5;

const petSvgOf = (pet, size) => petSvg(pet, size);
const typeChipStyle = (t) => ({ background: TYPE_COLORS[t] ?? '#9fa19f' });

// 图鉴快照缓存：seed+phase 相同直接复用 dataURL（避免几十个 WebGL context）
const snapCache = new Map();
async function renderSnapshotSafe(pet) {
  try {
    const { renderSnapshotOutlined } = await import('./core/snapshot.js');
    return renderSnapshotOutlined(pet, 160);
  } catch {
    return petSvg(pet, 96);
  }
}
function petSnapshot(pet) {
  const key = `${pet.seed}:${pet.phase ?? 0}`;
  if (!snapCache.has(key)) {
    snapCache.set(key, petSvg(pet, 96)); // 先占位，渲染完响应式刷新
    renderSnapshotSafe(pet).then(url => snapCache.set(key, url));
  }
  return snapCache.get(key);
}

// ---- 刷新野生精灵 ----
async function encounter(mapId) {
  const map = MAPS.find(m => m.id === mapId);
  if (!isMapUnlocked(map)) { showToast(`捕捉满 ${map.unlockAt} 只后解锁「${map.name}」`); return; }
  spawning.value = true;
  wild.value = null;
  try {
    let overrides = null;
    if (llmConfig.enabled && isLlmConfigured(llmConfig)) {
      try {
        overrides = await generatePetWithLlm(llmConfig);
      } catch (err) {
        console.warn('LLM 生成失败，降级本地随机', err);
        showToast('LLM 生成失败，本次使用本地随机');
      }
    }
    wild.value = spawnWild(mapId, overrides);
    ballsLeft.value = BALLS_MAX; // 新遭遇重置丢球次数
    view.value = 'encounter';
  } finally {
    spawning.value = false;
  }
}

function fleeWild() { wild.value = null; view.value = 'map'; }

// 空手丢球（不依赖队伍）：每只野生精灵限 BALLS_MAX 次，越丢概率越低
function throwDirect() {
  if (ballsLeft.value <= 0) {
    showToast('精灵球用完了！开战打残它再捕，或换只精灵刷新重置');
    return;
  }
  const target = withStats({ ...wild.value });
  // 递减惩罚：第 N 次尝试概率 × (1 - 0.12N)，5 次内成功率显著衰减
  const base = catchChance(target);
  const penalty = Math.max(0.25, 1 - (BALLS_MAX - ballsLeft.value) * 0.12);
  if (Math.random() < base * penalty) {
    succeedCatch();
  } else {
    ballsLeft.value--;
    if (ballsLeft.value <= 0) {
      showToast(`${wild.value.name} 警觉起来了！球用完了——开战削弱它再捕吧`);
    } else {
      showToast(`${wild.value.name} 挣脱了精灵球！（剩余 ${ballsLeft.value} 次机会）`);
    }
  }
}

function startBattle() {
  const healthy = party.value.filter(p => p.hp > 0);
  if (!healthy.length) {
    // 全队倒下：原地复活（休闲游戏，不设惩罚死循环）
    for (const p of save.pets) p.hp = undefined;
    showToast('队伍已休整完毕！');
    healthy.push(...party.value);
  }
  // 组建战斗队伍：存档中从未上场的宠物没有 hp 字段，按满血补齐
  const battleParty = party.value.map(p => {
    const copy = withStats({ ...p });
    if (copy.hp == null || copy.hp <= 0) copy.hp = copy.maxHp;
    return copy;
  });
  const first = battleParty.find(p => p.uid === healthy[0].uid) ?? battleParty[0];
  const wildFull = withStats({ ...wild.value });
  if (wildFull.hp == null || wildFull.hp <= 0) wildFull.hp = wildFull.maxHp;
  battle.value = newBattleState(first, wildFull, battleParty);
  battleLog.value = [];
  view.value = 'battle';
  playAnim('start');
}

// ---- 战斗 ----
const anim = ref({ who: null, kind: null }); // who: player|wild, kind: attack|hit|faint
const shakeScreen = ref(false);
const floatTexts = ref([]);

function playAnim(kind, who = null, text = null) {
  anim.value = { who, kind };
  if (text) {
    const id = Date.now() + Math.random();
    floatTexts.value.push({ id, text, who });
    setTimeout(() => { floatTexts.value = floatTexts.value.filter(f => f.id !== id); }, 1100);
  }
  if (kind === 'hit' && who === 'player') {
    shakeScreen.value = true;
    setTimeout(() => { shakeScreen.value = false; }, 350);
  }
  setTimeout(() => { anim.value = { who: null, kind: null }; }, 480);
}

// ---- 战斗吐槽（LLM 流式，可关；失败降级本地模板） ----
const taunt = reactive({ text: '', who: null });
let tauntAbort = null;
function fireTaunt(attacker, defender, evt) {
  if (!llmConfig.enabled || !isLlmConfigured(llmConfig)) {
    taunt.text = localTaunt(attacker, defender, evt.moveName ?? '', evt.damage, evt.eff, evt.crit);
    taunt.who = 'player';
    setTimeout(() => { taunt.text = ''; }, 2600);
    return;
  }
  tauntAbort?.abort();
  tauntAbort = new AbortController();
  taunt.text = ''; taunt.who = 'player';
  tauntWithLlm(llmConfig, attacker, defender, evt.moveName ?? '攻击', evt.damage, evt.eff, tauntAbort.signal,
    (delta) => { taunt.text += delta; })
    .then(full => { taunt.text = full || taunt.text; setTimeout(() => { if (taunt.text === full) taunt.text = ''; }, 2600); })
    .catch(() => {
      taunt.text = localTaunt(attacker, defender, evt.moveName ?? '攻击', evt.damage, evt.eff, evt.crit);
      setTimeout(() => { taunt.text = ''; }, 2600);
    });
}
function fireTauntMiss(attacker, defender) {
  taunt.text = localTaunt(attacker, defender, '', 0, 1, false) || '啊，打歪了…';
  taunt.who = 'player';
  setTimeout(() => { taunt.text = ''; }, 2200);
}

async function act(action) {
  // force=true 的换宠允许在 ended==='switch' 状态下执行
  if (!battle.value || battleBusy.value) return;
  if (battle.value.ended && action.force !== true) return;
  battleBusy.value = true;
  try {
    const state = battle.value;
    if (action.type === 'move') playAnim('attack', 'player');
    await new Promise(r => setTimeout(r, 220));
    const events = battleTurn(state, action);
    // 逐事件播放动画与飘字
    for (const e of events) {
      if (e.type === 'damage') {
        playAnim('hit', e.side === 'player' ? 'wild' : 'player', `-${e.damage}${e.crit ? ' 会心!' : ''}`);
        if (e.side === 'player') fireTaunt(state.active, state.wild, e);
      } else if (e.type === 'heal') {
        playAnim('buff', e.side, `+${e.amount}`);
      } else if (e.type === 'buff' || e.type === 'miss') {
        playAnim('buff', e.side, e.type === 'miss' ? 'MISS!' : null);
        if (e.type === 'miss' && e.side === 'player') fireTauntMiss(state.active, state.wild);
      } else if (e.type === 'faint') {
        playAnim('faint', e.side);
      }
      battleLog.value.push(e);
      await new Promise(r => setTimeout(r, e.type === 'faint' ? 500 : 300));
    }
    if (state.ended === 'caught') succeedCatch();
    else if (state.ended === 'win') winBattle();
    else if (state.ended === 'lose') loseBattle();
    // ended === 'switch'：等待玩家选择换宠（force-switch 面板显示）
  } catch (err) {
    console.error('act 失败', err);
    window.__lastActError = err?.stack ?? String(err);
    showToast('战斗出现异常，已终止本场');
    battle.value = null;
    wild.value = null;
    view.value = 'map';
  } finally {
    battleBusy.value = false;
  }
}

function winBattle() {
  const state = battle.value;
  const mine = petByUid(state.active.uid) ?? state.active;
  const exp = 26 + state.wild.level * 6;
  lastExpGain.value = exp;
  const r = gainExp(mine, exp);
  save.counters.battlesWon++;
  // 经验分享：其余队员 40%
  for (const p of save.pets) {
    if (p.uid !== mine.uid && save.partyIds.includes(p.uid)) gainExp(p, Math.round(exp * 0.4));
  }
  persist();
  if (r.evolvedTo) {
    celebrate('evolve', r.evolvedTo, `进化成了 ${r.evolvedTo.name}！技能也变强了`);
  } else if (r.leveled) {
    celebrate('levelup', mine, `${mine.name} 升到了 Lv.${mine.level}！${r.newMoves.length ? r.newMoves.join('，') : `获得 ${exp} 点经验`}`);
  } else {
    showToast(`战斗胜利，${mine.name} +${exp} 经验`);
  }
  battle.value = null;
  wild.value = null;
  view.value = 'map';
}

function loseBattle() {
  const state = battle.value;
  const mine = petByUid(state.active.uid) ?? state.active;
  gainExp(mine, 10 + mine.level * 2);
  // 检查是否还有活着的队员 → 有则转强制换宠；没有才整场结束（休闲复活）
  const alive = state.party.filter(p => p.uid !== state.active.uid && p.hp > 0);
  if (alive.length) {
    state.ended = 'switch';
    battleLog.value.push({ type: 'status', text: `${state.active.name} 倒下了，请选择下一只精灵！` });
    showToast(`${state.active.name} 倒下了！换其他精灵继续战斗`);
    return; // 保持 battle 状态，force-switch 面板出现
  }
  // 全军覆没：休闲模式原地满血复活
  for (const p of save.pets) p.hp = undefined;
  persist();
  showToast('全军覆没…精灵们休息了一会儿又满血复活（休闲模式）');
  battle.value = null;
  wild.value = null;
  view.value = 'map';
}

// 捕捉成功嗨点
function succeedCatch() {
  const caught = JSON.parse(JSON.stringify(battle.value?.wild ?? wild.value));
  adoptPet(caught);
  celebrate('catch', caught, '加入你的队伍！');
  battle.value = null;
  wild.value = null;
  view.value = 'map';
}

function switchPet(partyIndex) {
  // 允许在 ended==='switch'（强制换宠）状态下执行
  if (!battle.value || battleBusy.value) return;
  if (battle.value.ended && battle.value.ended !== 'switch') return;
  act({ type: 'switch', partyIndex, force: true });
}

// ---- 图鉴/队伍 ----
const dexList = computed(() => save.pets.map(p => withStats(p)));
const totalSeen = computed(() => Object.keys(save.dexSeen).length);
const collectionGoal = 30;

function toggleParty(uid) {
  const i = save.partyIds.indexOf(uid);
  if (i >= 0) save.partyIds.splice(i, 1);
  else if (save.partyIds.length < 4) save.partyIds.push(uid);
  else showToast('最多上阵 4 只');
  persist();
}

function releasePet(pet) {
  if (!confirm(`确定放归 ${pet.name} 吗？此操作不可撤销。`)) return;
  save.pets = save.pets.filter(p => p.uid !== pet.uid);
  save.partyIds = save.partyIds.filter(id => id !== pet.uid);
  persist();
  showToast(`${pet.name} 回归了大自然`);
}

function evExp(pet) {
  const cur = Math.round(0.9 * Math.pow(pet.level, 2.6));
  const next = Math.round(0.9 * Math.pow(pet.level + 1, 2.6));
  return Math.min(100, Math.round(((pet.exp - cur) / Math.max(1, next - cur)) * 100));
}

// ---- 存档导入导出 ----
function doExport() {
  const blob = new Blob([exportSaveText(JSON.parse(JSON.stringify({ ...save, version: 1 })))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `funny-pets-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = importSaveText(text);
    if (!confirm('导入会覆盖当前存档，确定继续吗？')) return;
    Object.assign(save, data);
    persist();
    showToast('导入成功');
  } catch (err) {
    showToast(`导入失败：${err.message}`);
  } finally {
    e.target.value = '';
  }
}

function doReset() {
  if (!confirm('确定清空全部存档吗？此操作不可撤销！')) return;
  localStorage.removeItem('funny-pets-save-v1');
  location.reload();
}

onMounted(() => { view.value = 'map'; });
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-icon">🐾</span>
        <span class="brand-name">奇幻萌宠</span>
        <span class="brand-sub">FunPets</span>
      </div>
      <nav class="tabs">
        <button :class="{ active: view === 'map' }" @click="view = 'map'; wild = null">地图</button>
        <button :class="{ active: view === 'encounter' || view === 'battle' }" :disabled="!wild && !battle">相遇</button>
        <button :class="{ active: view === 'dex' }" @click="view = 'dex'">图鉴 <em>{{ save.pets.length }}</em></button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'">设置</button>
      </nav>
    </header>

    <main class="content">
      <!-- ============ 地图 ============ -->
      <section v-if="view === 'map'" class="map-view">
        <p class="hint">点击地图探索 · 已捕捉 {{ save.counters.caught }}/{{ collectionGoal }} 只 · 遭遇 {{ save.counters.encounters }} 次 · 进化 {{ save.counters.evolutions }} 次</p>
        <div class="map-grid">
          <button v-for="map in MAPS" :key="map.id" class="map-card" :class="{ locked: !isMapUnlocked(map) }"
            :style="{ '--sky1': map.sky[0], '--sky2': map.sky[1], '--ground': map.ground }"
            @click="encounter(map.id)">
            <span class="map-art"><span class="ground"></span><span class="sun"></span></span>
            <span class="map-name">
              {{ map.name }}
              <small v-if="!isMapUnlocked(map)">🔒 捕捉 {{ map.unlockAt }} 只解锁</small>
              <small v-else class="lv-range">野生 Lv.{{ mapLevelRange(map.id)[0] }}-{{ mapLevelRange(map.id)[1] }}</small>
            </span>
            <span class="map-types">
              <i v-for="t in map.favorTypes" :key="t" class="chip" :style="typeChipStyle(t)">{{ t }}</i>
            </span>
            <span class="map-desc">{{ map.desc }}</span>
          </button>
        </div>
        <div v-if="spawning" class="spawn-mask"><div class="spinner"></div><p>草丛沙沙作响…</p></div>
      </section>

      <!-- ============ 相遇 ============ -->
      <section v-else-if="view === 'encounter' && wild" class="encounter-view">
        <div class="wild-card" :style="{ '--rarity': rarityInfo(wild.rarity).color }">
          <div class="wild-sprite3d">
            <Pet3D :pet="wild" :size="200" />
          </div>
          <h2>{{ wild.name }} <small class="lv">Lv.{{ wild.level }}</small></h2>
          <div class="chips">
            <i v-for="t in wild.types" :key="t" class="chip" :style="typeChipStyle(t)">{{ t }}</i>
            <i class="chip rarity-chip" :style="{ background: rarityInfo(wild.rarity).color }">{{ rarityInfo(wild.rarity).name }}</i>
          </div>
          <p class="lore">{{ wild.lore }}</p>
          <div class="actions">
            <button class="primary" @click="startBattle">开战（打残再捕更容易）</button>
            <button class="primary ball" :disabled="ballsLeft <= 0" @click="throwDirect">直接丢球{{ ballsLeft < BALLS_MAX ? `（剩${ballsLeft}）` : '' }}</button>
            <button class="ghost" @click="fleeWild">离开</button>
          </div>
        </div>
      </section>

      <!-- ============ 战斗 ============ -->
      <section v-else-if="view === 'battle' && battle" class="battle-view" :class="{ shake: shakeScreen }">
        <div class="battle-arena">
          <!-- 野生 -->
          <div class="fighter wild" :class="{ attacking: anim.who === 'wild' && anim.kind === 'attack', hit: anim.who === 'wild' && anim.kind === 'hit', fainting: anim.who === 'wild' && anim.kind === 'faint' }">
            <div class="plate">
              <div class="plate-row"><strong>{{ battle.wild.name }}</strong><span>Lv.{{ battle.wild.level }}</span></div>
              <div class="hp-bar"><i :style="{ width: Math.max(0, battle.wild.hp / battle.wild.maxHp * 100) + '%' }" :class="{ low: battle.wild.hp / battle.wild.maxHp < 0.25 }"></i></div>
              <span class="hp-num">{{ battle.wild.hp }} / {{ battle.wild.maxHp }}</span>
            </div>
            <div class="fighter-model"><Pet3D :pet="battle.wild" :size="130" /></div>
          </div>
          <div class="vs">⚡</div>
          <!-- 我方 -->
          <div class="fighter mine" :class="{ attacking: anim.who === 'player' && anim.kind === 'attack', hit: anim.who === 'player' && anim.kind === 'hit', fainting: anim.who === 'player' && anim.kind === 'faint' }">
            <div class="fighter-model"><Pet3D :pet="battle.active" :size="130" /></div>
            <div class="plate">
              <div class="plate-row"><strong>{{ battle.active.name }}</strong><span>Lv.{{ battle.active.level }}</span></div>
              <div class="hp-bar"><i :style="{ width: Math.max(0, battle.active.hp / battle.active.maxHp * 100) + '%' }" :class="{ low: battle.active.hp / battle.active.maxHp < 0.25 }"></i></div>
              <span class="hp-num">{{ battle.active.hp }} / {{ battle.active.maxHp }}</span>
            </div>
          </div>
          <!-- 飘字 -->
          <div class="float-layer">
            <span v-for="f in floatTexts" :key="f.id" class="float-txt" :class="'who-' + f.who">{{ f.text }}</span>
          </div>
        </div>

        <div class="battle-log">
          <p v-for="(e, i) in battleLog.slice(-5)" :key="i" :class="{ hl: e.type === 'faint' || (e.type === 'ball' && e.caught) }">{{ e.text }}</p>
        </div>

        <!-- 战斗吐槽气泡（LLM 流式 / 本地模板） -->
        <Transition name="taunt">
          <div v-if="taunt.text" class="taunt-bubble">
            <span class="taunt-who">{{ battle.active.name }}</span>
            <span class="taunt-text">{{ taunt.text }}</span>
          </div>
        </Transition>

        <!-- 强制换宠 -->
        <div v-if="battle.ended === 'switch'" class="battle-actions force-switch">
          <p class="hint">哪只精灵继续战斗？</p>
          <button v-for="(p, i) in battle.party" :key="p.uid" class="skill" :disabled="p.hp <= 0 || p.uid === battle.active.uid" @click="switchPet(i)">
            {{ p.name }} <small>{{ p.hp > 0 ? `HP ${p.hp}/${p.maxHp}` : '已倒下' }}</small>
          </button>
        </div>

        <!-- 常规操作：win/lose 结算动画期间按钮禁用但保持显示，避免按钮区塌陷跳版 -->
        <div class="battle-actions" v-else-if="!battle.ended || battle.ended === 'win' || battle.ended === 'lose'">
          <button v-for="(mv, i) in battle.active.moves" :key="mv.name" class="skill" :disabled="battleBusy || !!battle.ended"
            :style="{ '--type-color': typeChipStyle(mv.type ?? battle.active.types[0]).background }"
            @click="act({ type: 'move', moveIndex: i })">
            {{ mv.name }}<small>{{ mv.power ? `威力 ${mv.power}` : '变化' }}</small>
          </button>
          <button class="ball" :disabled="battleBusy || !!battle.ended" @click="act({ type: 'ball' })">
            丢球 <small>{{ Math.round(catchChance(battle.wild) * 100) }}%</small>
          </button>
          <button class="ghost" :disabled="battleBusy || !!battle.ended" @click="act({ type: 'run' })">逃跑</button>
        </div>
      </section>

      <!-- ============ 图鉴 ============ -->
      <section v-else-if="view === 'dex'" class="dex-view">
        <p class="hint">已遇见 {{ totalSeen }} 种 · 已捕捉 {{ save.pets.length }}/{{ collectionGoal }} · 上阵 {{ save.partyIds.length }}/4（点击卡片切换上阵）</p>
        <div v-if="!dexList.length" class="empty">还没有捕捉到精灵，去地图逛逛吧！</div>
        <div class="dex-grid">
          <div v-for="pet in dexList" :key="pet.uid" class="dex-card" :class="{ inParty: save.partyIds.includes(pet.uid) }"
            @click="detailPet = pet">
            <div class="dex-sprite"><img :src="petSnapshot(pet)" :alt="pet.name" width="84" height="84" loading="lazy" /></div>
            <div class="dex-info">
              <strong>{{ pet.name }} <small v-if="pet.phase" class="phase-badge">{{ pet.phase }}阶</small></strong>
              <div class="chips">
                <i v-for="t in pet.types" :key="t" class="chip sm" :style="typeChipStyle(t)">{{ t }}</i>
                <i class="chip sm rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityInfo(pet.rarity).name }}</i>
              </div>
              <span class="lv">Lv.{{ pet.level }} · 点击查看详情/聊天</span>
              <div class="exp-bar"><i :style="{ width: evExp(pet) + '%' }"></i></div>
              <div class="stats">
                <span>HP {{ pet.maxHp }}</span><span>攻 {{ pet.atkStat }}</span><span>防 {{ pet.defStat }}</span><span>速 {{ pet.spdStat }}</span>
              </div>
              <p class="lore">{{ pet.lore }}</p>
            </div>
            <button class="release" @click.stop="releasePet(pet)" title="放归">✕</button>
            <button class="party-toggle" :class="{ on: save.partyIds.includes(pet.uid) }"
              @click.stop="toggleParty(pet.uid)" :title="save.partyIds.includes(pet.uid) ? '下阵' : '上阵'">
              {{ save.partyIds.includes(pet.uid) ? '出战中' : '上阵' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ============ 设置 ============ -->
      <section v-else-if="view === 'settings'" class="settings-view">
        <div class="panel">
          <h3>🤖 AI 随机生成（可选）</h3>
          <p class="hint">配置 OpenAI 兼容接口后，每次刷新精灵由大模型生成名字、属性与描述；关闭或失败时自动使用本地随机。API Key 仅保存在你的浏览器本地。</p>
          <label><input type="checkbox" v-model="llmConfig.enabled" @change="saveLlmConfig" /> 启用 AI 生成</label>
          <label>Base URL <input v-model.trim="llmConfig.baseUrl" placeholder="https://api.example.com/v1" @change="saveLlmConfig" /></label>
          <label>Model <input v-model.trim="llmConfig.model" placeholder="gpt-4o-mini / deepseek-chat / ..." @change="saveLlmConfig" /></label>
          <label>API Key <input v-model.trim="llmConfig.apiKey" type="password" placeholder="sk-...（可选，本地服务可留空）" @change="saveLlmConfig" /></label>
        </div>
        <div class="panel">
          <h3>💾 存档</h3>
          <p class="hint">数据保存在浏览器 localStorage。换浏览器/清缓存前请先导出。</p>
          <div class="actions">
            <button class="primary" @click="doExport">导出存档</button>
            <label class="primary import-btn">导入存档<input type="file" accept=".json" @change="onImportFile" /></label>
            <button class="danger" @click="doReset">清空存档</button>
          </div>
        </div>
      </section>
    </main>

    <!-- 宠物详情 + 聊天弹窗 -->
    <PetDetail :pet="detailPet" @close="detailPet = null" />

    <!-- 全屏庆祝弹窗 -->
    <Celebration />
  </div>
</template>
