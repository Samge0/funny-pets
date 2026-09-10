// 第二批：App.vue 模板区 + 组件 + import 注入
const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';

const RULES = {
  'src/App.vue': [
    // import
    [`import { LANGUAGES, readLangPref, writeLangPref } from './core/i18n.js';`,
     `import { LANGUAGES, t, setLocale, typeName as typeNameOf, mapName, rarityName, locale } from './core/i18n.js';`],
    // langPref 状态改为 setLocale（切换即时生效）
    [`const langPref = ref(readLangPref());
function onLangChange() {
  const ok = writeLangPref(langPref.value);
  if (ok) showToast(t('语言已切换'), 2000);
}`,
     `const langPref = locale; // 直接绑定 i18n 的响应式 locale：切换即全局重渲染
function onLangChange() {
  const ok = setLocale(langPref.value);
  if (ok) showToast(t('语言已切换'), 2000);
}`],
    // typeChip 显示名映射 helper
    [`const typeChipStyle = (t2) => ({ background: TYPE_COLORS[t2] ?? '#9fa19f' });`,
     `const typeChipStyle = (t2) => ({ background: TYPE_COLORS[t2] ?? '#9fa19f' });
const typeLabel = (t2) => typeNameOf(t2); // 属性显示名（语言映射；TYPE_COLORS 仍按 zh key 索引）`],
    // 地图视图
    [`<p class="hint">点击地图探索 · 已捕捉 {{ save.counters.caught }}/{{ collectionGoal }} 只 · 遭遇 {{ save.counters.encounters }} 次 · 进化 {{ save.counters.evolutions }} 次</p>`,
     `<p class="hint">{{ t('点击地图探索 · 已捕捉 {c}/{g} 只 · 遭遇 {e} 次 · 进化 {v} 次', { c: save.counters.caught, g: collectionGoal, e: save.counters.encounters, v: save.counters.evolutions }) }}</p>`],
    [`{{ map.name }}
              <small v-if="!isMapUnlocked(map)">🔒 捕捉 {{ map.unlockAt }} 只解锁</small>
              <small v-else class="lv-range">野生 Lv.{{ mapLevelRange(map.id)[0] }}-{{ mapLevelRange(map.id)[1] }}</small>`,
     `{{ mapName(map.name) }}
              <small v-if="!isMapUnlocked(map)">{{ t('🔒 捕捉 {n} 只解锁', { n: map.unlockAt }) }}</small>
              <small v-else class="lv-range">{{ t('野生 Lv.{a}-{b}', { a: mapLevelRange(map.id)[0], b: mapLevelRange(map.id)[1] }) }}</small>`],
    [`<i v-for="t2 in map.favorTypes" :key="t2" class="chip" :style="typeChipStyle(t2)">{{ t2 }}</i>`,
     `<i v-for="t2 in map.favorTypes" :key="t2" class="chip" :style="typeChipStyle(t2)">{{ typeLabel(t2) }}</i>`],
    [`<span class="map-desc">{{ map.desc }}</span>`, `<span class="map-desc" v-if="locale === 'zh' || locale === 'zh-TW'">{{ map.desc }}</span>`],
    [`<p>草丛沙沙作响…</p>`, `<p>{{ t('草丛沙沙作响…') }}</p>`],
    // shared 视图
    [`<p class="shared-owner-hint">🐾 来自好友分享的精灵 · 点击它会跳一下</p>`, `<p class="shared-owner-hint">{{ t('🐾 来自好友分享的精灵 · 点击它会跳一下') }}</p>`],
    [`{{ t2 }}`, `{{ typeLabel(t2) }}`],
    [`<i class="chip rarity-chip" :style="{ background: rarityInfo(sharedPet.rarity).color }">{{ rarityInfo(sharedPet.rarity).name }}</i>`,
     `<i class="chip rarity-chip" :style="{ background: rarityInfo(sharedPet.rarity).color }">{{ rarityName(sharedPet.rarity) }}</i>`],
    [`<button class="primary" @click="challengeShared">⚔️ 用我的精灵挑战</button>`, `<button class="primary" @click="challengeShared">{{ t('⚔️ 用我的精灵挑战') }}</button>`],
    [`<button class="ghost" @click="exitShared">返回游戏</button>`, `<button class="ghost" @click="exitShared">{{ t('返回游戏') }}</button>`],
    // gift 视图
    [`<p class="shared-owner-hint">🎁 好友赠送的精灵 · 点击它会跳一下</p>`, `<p class="shared-owner-hint">{{ t('🎁 好友赠送的精灵 · 点击它会跳一下') }}</p>`],
    [`<i class="chip rarity-chip" :style="{ background: rarityInfo(giftPet.rarity).color }">{{ rarityInfo(giftPet.rarity).name }}</i>`,
     `<i class="chip rarity-chip" :style="{ background: rarityInfo(giftPet.rarity).color }">{{ rarityName(giftPet.rarity) }}</i>`],
    [`<button v-if="!isGiftClaimed(giftPet)" class="primary gift-claim" @click="claimGift">🎁 领取它！</button>`, `<button v-if="!isGiftClaimed(giftPet)" class="primary gift-claim" @click="claimGift">{{ t('🎁 领取它！') }}</button>`],
    [`<button v-else class="ghost" disabled>✅ 已领取</button>`, `<button v-else class="ghost" disabled>{{ t('✅ 已领取') }}</button>`],
    [`<button class="ghost" @click="exitGift">返回游戏</button>`, `<button class="ghost" @click="exitGift">{{ t('返回游戏') }}</button>`],
    // encounter 视图
    [`<button class="primary" @click="startBattle">开战（打残再捕更容易）</button>`, `<button class="primary" @click="startBattle">{{ t('开战（打残再捕更容易）') }}</button>`],
    [`@click="throwDirect">直接丢球{{ ballsLeft < BALLS_MAX ? \`（剩\${ballsLeft}）\` : '' }}</button>`,
     `@click="throwDirect">{{ ballsLeft < BALLS_MAX ? t('直接丢球（剩{n}）', { n: ballsLeft }) : t('直接丢球') }}</button>`],
    [`<button class="ghost" @click="fleeWild">离开</button>`, `<button class="ghost" @click="fleeWild">{{ t('离开') }}</button>`],
    // battle 视图
    [`<p class="hint">哪只精灵继续战斗？</p>`, `<p class="hint">{{ t('哪只精灵继续战斗？') }}</p>`],
    [`<p class="hint">换上哪只精灵？（换宠会消耗本回合，对方趁机攻击）</p>`, `<p class="hint">{{ t('换上哪只精灵？（换宠会消耗本回合，对方趁机攻击）') }}</p>`],
    [`<small>{{ p.hp > 0 ? \`HP \${p.hp}/\${p.maxHp}\` : '已倒下' }}</small>`, `<small>{{ p.hp > 0 ? \`HP \${p.hp}/\${p.maxHp}\` : t('已倒下') }}</small>`],
    [`{{ mv.name }}<small>{{ mv.power ? \`威力 \${mv.power}\` : '变化' }}</small>`, `{{ moveLabel(mv.name) }}<small>{{ mv.power ? t('威力 {n}', { n: mv.power }) : t('变化') }}</small>`],
    [`丢球 <small>{{ Math.round(catchChance(battle.wild) * 100) }}%</small>`, `{{ t('丢球') }} <small>{{ Math.round(catchChance(battle.wild) * 100) }}%</small>`],
    [`换宠 <small>{{ battle.party.filter(p => p.hp > 0 && p.uid !== battle.active.uid).length }} 只可用</small>`,
     `{{ t('换宠') }} <small>{{ battle.party.filter(p => p.hp > 0 && p.uid !== battle.active.uid).length }}</small>`],
    [`<button class="ghost" :disabled="battleBusy || !!battle.ended || showSwitchPanel" @click="act({ type: 'run' })">逃跑</button>`,
     `<button class="ghost" :disabled="battleBusy || !!battle.ended || showSwitchPanel" @click="act({ type: 'run' })">{{ t('逃跑') }}</button>`],
    [`<button class="ghost" @click="showSwitchPanel = false">取消</button>`, `<button class="ghost" @click="showSwitchPanel = false">{{ t('取消') }}</button>`],
    // dex 视图
    [`<p class="hint">已遇见 {{ totalSeen }} 种 · 已捕捉 {{ save.pets.length }}/{{ collectionGoal }} · 上阵 {{ save.partyIds.length }}/4（点击卡片切换上阵 · 按钮排序）</p>`,
     `<p class="hint">{{ t('已遇见 {s} 种 · 已捕捉 {c}/{g} · 上阵 {p}/4（点击卡片切换上阵 · 按钮排序）', { s: totalSeen, c: save.pets.length, g: collectionGoal, p: save.partyIds.length }) }}</p>`],
    [`<div v-if="!dexList.length" class="empty">还没有捕捉到精灵，去地图逛逛吧！</div>`, `<div v-if="!dexList.length" class="empty">{{ t('还没有捕捉到精灵，去地图逛逛吧！') }}</div>`],
    [`<small v-if="pet.phase" class="phase-badge">{{ pet.phase }}阶</small>`, `<small v-if="pet.phase" class="phase-badge">{{ t('{n}阶', { n: pet.phase }) }}</small>`],
    [`<span class="lv">Lv.{{ pet.level }} · 点击查看详情/聊天</span>`, `<span class="lv">Lv.{{ pet.level }} · {{ t('点击查看详情/聊天') }}</span>`],
    [`<span>HP {{ pet.maxHp }}</span><span>攻 {{ pet.atkStat }}</span><span>防 {{ pet.defStat }}</span><span>速 {{ pet.spdStat }}</span>`,
     `<span>HP {{ pet.maxHp }}</span><span>{{ t('攻') }} {{ pet.atkStat }}</span><span>{{ t('防') }} {{ pet.defStat }}</span><span>{{ t('速') }} {{ pet.spdStat }}</span>`],
    [`@click.stop="releasePet(pet)" title="放归">✕</button>`, `@click.stop="releasePet(pet)" :title="t('放归')">✕</button>`],
    [`@click="movePet(pet, 'top')" title="置顶">⤒</button>`, `@click="movePet(pet, 'top')" :title="t('置顶')">⤒</button>`],
    [`@click="movePet(pet, 'up')" title="上移">↑</button>`, `@click="movePet(pet, 'up')" :title="t('上移')">↑</button>`],
    [`@click="movePet(pet, 'down')" title="下移">↓</button>`, `@click="movePet(pet, 'down')" :title="t('下移')">↓</button>`],
    [`:title="save.partyIds.includes(pet.uid) ? '下阵' : '上阵'">`, `:title="save.partyIds.includes(pet.uid) ? t('下阵') : t('上阵')">`],
    [`{{ save.partyIds.includes(pet.uid) ? '出战中' : '上阵' }}`, `{{ save.partyIds.includes(pet.uid) ? t('出战中') : t('上阵') }}`],
    // 稀有度 chip（dex/encounter 通用——rarityInfo().name 出现处全部换 rarityName）
    [`{{ rarityInfo(pet.rarity).name }}`, `{{ rarityName(pet.rarity) }}`],
    [`{{ rarityInfo(wild.rarity).name }}`, `{{ rarityName(wild.rarity) }}`],
    // 设置页
    [`<h3>🌍 语言 / Language</h3>`, `<h3>{{ t('🌍 语言 / Language') }}</h3>`],
    [`<p class="hint">AI 生成内容的输出语言（精灵名字与描述、灵魂聊天、战斗台词、分享文案）。默认跟随浏览器，可手动切换。</p>`,
     `<p class="hint">{{ t('界面与 AI 输出语言。默认跟随浏览器，可手动切换。') }}</p>`],
    [`<span>输出语言</span>`, `<span>{{ t('输出语言') }}</span>`],
    [`<h3>🤖 AI 随机生成（可选）</h3>`, `<h3>{{ t('🤖 AI 随机生成（可选）') }}</h3>`],
    [`<p class="hint">配置 OpenAI 兼容接口后，每次刷新精灵由大模型生成名字、属性与描述；关闭或失败时自动使用本地随机。API Key 仅保存在你的浏览器本地。</p>`,
     `<p class="hint">{{ t('配置 OpenAI 兼容接口后，每次刷新精灵由大模型生成名字、属性与描述；关闭或失败时自动使用本地随机。API Key 仅保存在你的浏览器本地。') }}</p>`],
    [`/> 启用 AI 生成</label>`, `/> {{ t('启用 AI 生成') }}</label>`],
    [`<h3>💾 存档</h3>`, `<h3>{{ t('💾 存档') }}</h3>`],
    [`<p class="hint">数据保存在浏览器 localStorage。换浏览器/清缓存前请先导出。</p>`, `<p class="hint">{{ t('数据保存在浏览器 localStorage。换浏览器/清缓存前请先导出。') }}</p>`],
    [`<button class="primary" @click="doExport">导出存档</button>`, `<button class="primary" @click="doExport">{{ t('导出存档') }}</button>`],
    [`>导入存档<input`, `>{{ t('导入存档') }}<input`],
    [`<button class="danger" @click="doReset">清空存档</button>`, `<button class="danger" @click="doReset">{{ t('清空存档') }}</button>`],
    [`<h3>📎 关于</h3>`, `<h3>{{ t('📎 关于') }}</h3>`],
    [`<p class="hint">奇幻萌宠 FunPets 是纯前端开源休闲游戏，喜欢的话去仓库点个 ⭐ 吧～</p>`,
     `<p class="hint">{{ t('奇幻萌宠 FunPets 是纯前端开源休闲游戏，喜欢的话去仓库点个 ⭐ 吧～') }}</p>`],
  ],
};

for (const [file, rules] of Object.entries(RULES)) {
  let s = fs.readFileSync(ROOT + file, 'utf8');
  let n = 0;
  for (const [from, to] of rules) {
    if (s.includes(from)) { s = s.split(from).join(to); n++; }
    else console.log(`MISS ${file}: ${String(from).slice(0, 70)}...`);
  }
  fs.writeFileSync(ROOT + file, s);
  console.log(`${file}: ${n}/${rules.length} replaced`);
}
