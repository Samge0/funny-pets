<script setup>
import { ref, computed, onMounted } from 'vue';
import { save, showToast, spawnWild, adoptPet, party, withStats, gainExp, persist, rarityInfo, mapInfo, isMapUnlocked, llmConfig, saveLlmConfig, petByUid } from './store.js';
import { MAPS } from './data/maps.js';
import { petSvg } from './core/sprites.js';
import { isLlmConfigured, generatePetWithLlm } from './core/llm.js';
import { newBattleState, battleTurn, catchChance } from './core/battle.js';
import { TYPE_COLORS } from './data/types.js';
import { exportSaveText, importSaveText } from './storage.js';

const view = ref('map'); // map | dex | battle | settings
const spawning = ref(false);
const wild = ref(null);          // 当前野生精灵（未进入战斗）
const battle = ref(null);        // 战斗状态
const battleLog = ref([]);
const battleBusy = ref(false);
const importFile = ref(null);

const petSvgOf = (pet, size) => petSvg(pet, size);

const typeChipStyle = (t) => ({ background: TYPE_COLORS[t] ?? '#9fa19f' });

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
        const llmPet = await generatePetWithLlm(llmConfig);
        overrides = llmPet; // name/types/rarity/look/lore
      } catch (err) {
        console.warn('LLM 生成失败，降级本地随机', err);
        showToast('LLM 生成失败，本次使用本地随机');
      }
    }
    wild.value = spawnWild(mapId, overrides);
    view.value = 'encounter';
  } finally {
    spawning.value = false;
  }
}

function fleeWild() { wild.value = null; view.value = 'map'; }

// 空手直接丢球（不依赖队伍，重在娱乐）；失败则精灵留在原地可继续尝试
function throwDirect() {
  const target = withStats({ ...wild.value });
  wild.value.hp = target.maxHp;
  if (Math.random() < catchChance(target)) {
    const clone = JSON.parse(JSON.stringify(wild.value));
    adoptPet(clone);
    showToast(`${wild.value.name} 加入了队伍！`);
    wild.value = null;
    view.value = 'map';
  } else {
    showToast(`${wild.value.name} 挣脱了精灵球！`);
  }
}

function startBattle() {
  if (!party.value.length) { showToast('还没有上阵精灵，先去图鉴安排'); return; }
  const first = withStats({ ...party.value[0], hp: party.value[0].hp ?? party.value[0].maxHp });
  first.hp = first.maxHp;
  wild.value.hp = wild.value.hp ?? withStats(wild.value).maxHp;
  battle.value = newBattleState(first, withStats({ ...wild.value }));
  battleLog.value = [];
  view.value = 'battle';
}

// ---- 战斗 ----
async function act(action) {
  if (!battle.value || battleBusy.value || battle.value.ended) return;
  battleBusy.value = true;
  try {
    const state = battle.value;
    const events = battleTurn(state, action);
    battleLog.value.push(...events);
    // 战斗结束后停在结算画面，由玩家点击「结束战斗」收尾
  } finally {
    battleBusy.value = false;
  }
}

function finishBattle() {
  const state = battle.value;
  // 经验/升级必须写回存档本体（战斗中的 active 是浅拷贝）
  const mine = petByUid(state.active.uid) ?? state.active;
  if (state.ended === 'win' || state.ended === 'caught') {
    if (state.ended === 'caught') {
      adoptPet(JSON.parse(JSON.stringify(state.wild)));
      showToast(`-${state.wild.name}- 加入了队伍！`);
    } else {
      const r = gainExp(mine, 28 + mine.level * 4);
      if (r.evolvedTo) showToast(`${mine.name} 进化成了 ${mine.name}！`);
      else if (r.leveled) showToast(`${mine.name} 升到了 ${mine.level} 级！`);
      save.counters.battlesWon++;
    }
  } else if (state.ended === 'lose') {
    gainExp(mine, 8 + mine.level * 2);
    showToast('战败了…获得少量经验');
  }
  persist();
  wild.value = null;
  battle.value = null;
  view.value = 'map';
}

// ---- 图鉴/队伍 ----
const dexList = computed(() => save.pets.map(p => withStats(p)));
const totalSeen = computed(() => Object.keys(save.dexSeen).length);

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
      <!-- ============ 地图视图 ============ -->
      <section v-if="view === 'map'" class="map-view">
        <p class="hint">点击地图探索，随机遇到原创精灵。已捕捉 {{ save.counters.caught }} 只 · 遭遇 {{ save.counters.encounters }} 次</p>
        <div class="map-grid">
          <button v-for="map in MAPS" :key="map.id" class="map-card" :class="{ locked: !isMapUnlocked(map) }"
            :style="{ '--sky1': map.sky[0], '--sky2': map.sky[1], '--ground': map.ground }"
            @click="encounter(map.id)">
            <span class="map-art"><span class="ground"></span><span class="sun"></span></span>
            <span class="map-name">
              {{ map.name }}
              <small v-if="!isMapUnlocked(map)">🔒 捕捉 {{ map.unlockAt }} 只解锁</small>
            </span>
            <span class="map-types">
              <i v-for="t in map.favorTypes" :key="t" class="chip" :style="typeChipStyle(t)">{{ t }}</i>
            </span>
            <span class="map-desc">{{ map.desc }}</span>
          </button>
        </div>
        <div v-if="spawning" class="spawn-mask"><div class="spinner"></div><p>草丛沙沙作响…</p></div>
      </section>

      <!-- ============ 相遇视图 ============ -->
      <section v-else-if="view === 'encounter' && wild" class="encounter-view">
        <div class="wild-card" :style="{ '--rarity': rarityInfo(wild.rarity).color }">
          <div class="wild-sprite" v-html="petSvgOf(wild, 160)"></div>
          <h2>{{ wild.name }}</h2>
          <div class="chips">
            <i v-for="t in wild.types" :key="t" class="chip" :style="typeChipStyle(t)">{{ t }}</i>
            <i class="chip rarity-chip">{{ rarityInfo(wild.rarity).name }}</i>
            <i class="chip lv-chip">Lv.{{ wild.level }}</i>
          </div>
          <p class="lore">{{ wild.lore }}</p>
          <div class="actions">
            <button class="primary" @click="startBattle">开战（打残再捕更容易）</button>
            <button class="primary ball" @click="throwDirect">直接丢球</button>
            <button class="ghost" @click="fleeWild">离开</button>
          </div>
        </div>
      </section>

      <!-- ============ 战斗视图 ============ -->
      <section v-else-if="view === 'battle' && battle" class="battle-view">
        <div class="battle-arena">
          <div class="fighter wild">
            <div v-html="petSvgOf(battle.wild, 110)"></div>
            <div class="hp-bar"><i :style="{ width: (battle.wild.hp / battle.wild.maxHp * 100) + '%' }"></i></div>
            <span>{{ battle.wild.name }} Lv.{{ battle.wild.level }}</span>
          </div>
          <div class="vs">⚡</div>
          <div class="fighter mine">
            <div v-html="petSvgOf(battle.active, 110)"></div>
            <div class="hp-bar"><i :style="{ width: (battle.active.hp / battle.active.maxHp * 100) + '%' }"></i></div>
            <span>{{ battle.active.name }} Lv.{{ battle.active.level }}</span>
          </div>
        </div>
        <div class="battle-log">
          <p v-for="(e, i) in battleLog.slice(-6)" :key="i">{{ e.text }}</p>
        </div>
        <div class="battle-actions" v-if="!battle.ended">
          <button v-for="(mv, i) in battle.active.moves" :key="mv.name" class="skill" :disabled="battleBusy"
            @click="act({ type: 'move', moveIndex: i })">
            {{ mv.name }}<small v-if="mv.power">{{ mv.power }}</small>
          </button>
          <button class="ball" :disabled="battleBusy" @click="act({ type: 'ball' })">
            丢球 <small>{{ Math.round(catchChance(battle.wild) * 100) }}%</small>
          </button>
          <button class="ghost" :disabled="battleBusy" @click="act({ type: 'run' })">逃跑</button>
        </div>
        <div class="battle-actions" v-else>
          <button class="primary" @click="finishBattle">结束战斗</button>
        </div>
      </section>

      <!-- ============ 图鉴视图 ============ -->
      <section v-else-if="view === 'dex'" class="dex-view">
        <p class="hint">已遇见 {{ totalSeen }} 种 · 已捕捉 {{ save.pets.length }} 只 · 上阵 {{ save.partyIds.length }}/4（点击卡片切换上阵）</p>
        <div v-if="!dexList.length" class="empty">还没有捕捉到精灵，去地图逛逛吧！</div>
        <div class="dex-grid">
          <div v-for="pet in dexList" :key="pet.uid" class="dex-card" :class="{ inParty: save.partyIds.includes(pet.uid) }"
            @click="toggleParty(pet.uid)">
            <div class="dex-sprite" v-html="petSvgOf(pet, 84)"></div>
            <div class="dex-info">
              <strong>{{ pet.name }}</strong>
              <div class="chips">
                <i v-for="t in pet.types" :key="t" class="chip sm" :style="typeChipStyle(t)">{{ t }}</i>
                <i class="chip sm rarity-chip">{{ rarityInfo(pet.rarity).name }}</i>
              </div>
              <span class="lv">Lv.{{ pet.level }} {{ pet.phase ? `· ${pet.phase}阶` : '' }}</span>
              <div class="stats">
                <span>HP {{ pet.maxHp }}</span><span>攻 {{ pet.atkStat }}</span><span>防 {{ pet.defStat }}</span><span>速 {{ pet.spdStat }}</span>
              </div>
              <p class="lore">{{ pet.lore }}</p>
            </div>
            <button class="release" @click.stop="releasePet(pet)" title="放归">✕</button>
          </div>
        </div>
      </section>

      <!-- ============ 设置视图 ============ -->
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
  </div>
</template>
