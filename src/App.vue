<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue';
import { save, showToast, spawnWild, adoptPet, party, withStats, gainExp, persist, rarityInfo, mapInfo, isMapUnlocked, mapLevelRange, llmConfig, saveLlmConfig, petByUid, celebration, closeCelebration, celebrate, waitCelebrationClosed, requestDevourChoice } from './store.js';
import { MAPS } from './data/maps.js';
import { petSvg } from './core/sprites.js';
import { isLlmConfigured, generatePetWithLlm, tauntWithSoul, localTaunt } from './core/llm.js';
import { ensureSoul, makeEphemeralSoul, updateSoul, driftTraits, touchRelation, addEpisodic, onEvolve, forgetSoul } from './core/soul.js';
import { forgetChat } from './chat.js';
import { newBattleState, battleTurn, catchChance } from './core/battle.js';
import { statsAt, offerDevourMoves, offerDevourParts, applyDevour } from './core/evolve.js';
import { bodyTypeBiased } from './core/sprite3d.js';
import { TYPE_COLORS } from './data/types.js';
import { exportSaveText, importSaveText, clearAllStorage } from './storage.js';
import { exportSouls, importSouls } from './core/soul.js';
import { exportChats, importChats } from './chat.js';
import Pet3D from './components/Pet3D.vue';
import Celebration from './components/Celebration.vue';
import PetDetail from './components/PetDetail.vue';
import DevourChoice from './components/DevourChoice.vue';
import GlobalToast from './components/GlobalToast.vue';
import { readSharedFromHash } from './core/sharePet.js';

const view = ref('map'); // map | encounter | battle | dex | settings | shared
const spawning = ref(false);
const wild = ref(null);
const battle = ref(null);
const battleLog = ref([]);
const logEl = ref(null);
watch(battleLog, () => {
  // 新纪录自动滚到底（战报区固定高度不推挤按钮）
  nextTick(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; });
}, { deep: false });
const battleBusy = ref(false);
const showSwitchPanel = ref(false); // 战斗中主动换宠面板（非强制）
const lastExpGain = ref(0);
// 详情弹窗 + 丢球限制
const detailPet = ref(null);
const ballsLeft = ref(5);        // 每只野生精灵限 5 次直接丢球
const BALLS_MAX = 5;

// ---- 分享观赏模式（#p=...）：只读 3D 展示 + 可挑战；禁聊天 ----
const sharedPet = ref(null);   // 分享来的宠物（解码后）
// v2 分享链接是压缩编码（异步 inflate）：挂载前解析，防止短暂闪地图视图
(async function initShared() {
  const shared = await readSharedFromHash();
  if (shared) {
    sharedPet.value = shared.pet;
    view.value = 'shared';
  }
})();
// 挑战分享宠：查看者用自己的出战宠 vs 分享宠（复用战斗引擎；
// 分享宠 as wild——挑战结果只影响查看者本地经验，不写分享者存档天然成立）
function challengeShared() {
  if (!sharedPet.value) return;
  if (!party.value.length) {
    // 查看者还没有精灵：引导去游戏本体（而非只弹 toast 让人摸不着头脑）
    showToast('你还没有精灵！点「返回游戏」→ 点地图去捕捉一只，再回来挑战', 4000);
    return;
  }
  const healthy = party.value.filter(p => p.hp > 0);
  if (!healthy.length) {
    for (const p of save.pets) p.hp = undefined;
    showToast('队伍已休整完毕！');
  }
  const battleParty = party.value.map(p => {
    const copy = withStats({ ...p });
    copy.hp = copy.maxHp;
    copy.boosts = {};
    return copy;
  });
  const first = battleParty.find(p => p.uid === healthy[0]?.uid) ?? battleParty[0];
  const foe = withStats({ ...sharedPet.value });
  foe.hp = foe.maxHp;
  battle.value = newBattleState(first, foe, battleParty);
  battleLog.value = [];
  showSwitchPanel.value = false;
  battleFromChallenge.value = true; // 标记：胜利后不触发吞噬提案（分享宠不是野怪）
  view.value = 'battle';
}
const battleFromChallenge = ref(false);

const petSvgOf = (pet, size) => petSvg(pet, size);
const typeChipStyle = (t) => ({ background: TYPE_COLORS[t] ?? '#9fa19f' });

// 图鉴快照缓存：seed+phase 相同直接复用 dataURL（避免几十个 WebGL context）
const snapCache = reactive(new Map()); // reactive：渲染完成后触发卡片 img 重渲染
async function renderSnapshotSafe(pet) {
  try {
    const { renderSnapshotOutlined } = await import('./core/snapshot.js');
    return renderSnapshotOutlined(pet, 160);
  } catch {
    return petSvgDataUrl(pet);
  }
}
// 占位 SVG 必须编码为 dataURL 才能作为 <img src>（裸字符串会被当相对路径 → 404 破图）
function petSvgDataUrl(pet) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(petSvg(pet, 96));
}
function petSnapshot(pet) {
  // look 参与缓存 key：吞噬/进化改变部件后快照必须重新渲染（旧 key 只有 seed:phase 会命中陈旧缓存）
  const key = petSnapshotKey(pet);
  if (!snapCache.has(key)) {
    snapCache.set(key, petSvgDataUrl(pet)); // 先占位，渲染完响应式刷新
    renderSnapshotSafe(pet).then(url => { if (url) snapCache.set(key, url); });
  }
  return snapCache.get(key);
}
function petSnapshotKey(pet) {
  const lookSig = `${pet.look.ears}-${pet.look.tail}-${pet.look.accessory}-${pet.look.pattern}-${pet.look.eyes}-${pet.look.body}`;
  const extraSig = (pet.extraParts ?? []).map(e => `${e.part}=${e.value}`).join(',');
  return `${pet.seed}:${pet.phase ?? 0}:${lookSig}:${extraSig}`;
}

// ---- 刷新野生精灵 ----
async function encounter(mapId) {
  const map = MAPS.find(m => m.id === mapId);
  if (!isMapUnlocked(map)) {
    // 解锁条件提示（GlobalToast 已恢复渲染；补充还差几只的具体进度）
    const need = map.unlockAt - save.counters.caught;
    showToast(`「${map.name}」尚未解锁：需要捕捉满 ${map.unlockAt} 只精灵，还差 ${need} 只（当前 ${save.counters.caught}/${map.unlockAt}）`, 3200);
    return;
  }
  spawning.value = true;
  wild.value = null;
  try {
    let overrides = null;
    if (llmConfig.enabled && isLlmConfigured(llmConfig)) {
      // 超时 + 一次自动重试：慢/挂的接口不再长时间卡住"生成中"，瞬时抖动不直接降级随机
      // （此前无超时会 fetch 悬挂；单次失败立刻降级 → 用户感觉"经常生成失败"）
      const genWithTimeout = () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        return generatePetWithLlm(llmConfig, ctrl.signal).finally(() => clearTimeout(timer));
      };
      try {
        overrides = await genWithTimeout();
      } catch (err1) {
        console.warn('LLM 生成首次失败，重试一次', err1);
        try {
          overrides = await genWithTimeout();
        } catch (err2) {
          console.warn('LLM 生成重试仍失败，降级本地随机', err2);
          showToast('LLM 生成失败，本次使用本地随机');
        }
      }
    }
    wild.value = spawnWild(mapId, overrides);
    ballsLeft.value = BALLS_MAX; // 新遭遇重置丢球次数
    view.value = 'encounter';
  } finally {
    spawning.value = false;
  }
}

function exitShared() {
  sharedPet.value = null;
  history.replaceState(null, '', location.pathname + location.search); // 清掉 #p= 防刷新再进
  view.value = 'map';
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
  // 没有精灵时开战会以 undefined 组队直接崩溃——引导先去捕捉
  if (!party.value.length) {
    showToast('还没有精灵伙伴！先丢球捕捉一只吧');
    return;
  }
  const healthy = party.value.filter(p => p.hp > 0);
  if (!healthy.length) {
    // 全队倒下：原地复活（休闲游戏，不设惩罚死循环）
    for (const p of save.pets) p.hp = undefined;
    showToast('队伍已休整完毕！');
    healthy.push(...party.value);
  }
  // 组建战斗队伍：存档中从未上场的宠物没有 hp 字段，按满血补齐。
  // 捕捉时已剥离战斗态（hp/boosts），这里统一从满血开始（休闲设计：战斗损伤不入档）
  const battleParty = party.value.map(p => {
    const copy = withStats({ ...p });
    copy.hp = copy.maxHp; // 每场战斗从满血开始（战斗内扣血只影响本场）
    copy.boosts = {};
    return copy;
  });
  const first = battleParty.find(p => p.uid === healthy[0].uid) ?? battleParty[0];
  const wildFull = withStats({ ...wild.value });
  if (wildFull.hp == null || wildFull.hp <= 0) wildFull.hp = wildFull.maxHp;
  battle.value = newBattleState(first, wildFull, battleParty);
  battleLog.value = [];
  showSwitchPanel.value = false; // 新战斗重置主动换宠面板
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

// ---- 战斗吐槽（灵魂驱动：persona + 记忆 + 羁绊；LLM 流式，失败降级本地模板） ----
// 双气泡：taunt=我方 / wildTaunt=敌方（独立流式互不打断，攻防交替各自说话）
const taunt = reactive({ text: '', who: null });
const wildTaunt = reactive({ text: '', who: null });
let tauntAbort = null;
let wildTauntAbort = null;
function soulOf(pet) {
  return ensureSoul(pet);
}
// 野生精灵临时灵魂：一场战斗一份随机性格（纯内存对象，不进 localStorage——
// 野生精灵不是玩家的，不该污染玩家精灵的灵魂档案库）
const wildSoulCache = new Map();
function wildSoulOf(pet) {
  if (!wildSoulCache.has(pet.uid ?? pet.seed)) {
    wildSoulCache.set(pet.uid ?? pet.seed, makeEphemeralSoul(pet));
    if (wildSoulCache.size > 12) wildSoulCache.delete(wildSoulCache.keys().next().value); // 防泄漏
  }
  return wildSoulCache.get(pet.uid ?? pet.seed);
}

// 流式文本的安全可见部分：__STATE__ 标记（含被 delta 拆碎的尾部前缀）不上屏
// 例：raw="__STAT" 扣住全部；raw="打得好！__STATE__{\"a" 只显示"打得好！"；
//     raw="__STATE__{\"affinityDelta\":2,\"drift\":{\"warm" 截断 JSON 全部隐藏
function visibleTauntText(raw) {
  const MARK = '__STATE__';
  const idx = raw.indexOf(MARK);
  if (idx >= 0) return raw.slice(0, idx).trimEnd();
  // 尾部可能是标记前缀（最长 9 字符）：扣住待判，避免碎片闪现
  for (let len = Math.min(MARK.length - 1, raw.length); len > 0; len--) {
    if (raw.endsWith(MARK.slice(0, len))) return raw.slice(0, raw.length - len);
  }
  return raw;
}

// 流式渲染一个气泡（SSE 增量 + __STATE__ 行过滤 + 结束后淡出）
function streamTaunt(bubble, attacker, defender, evt, soul, isWild) {
  const trainerTitle = soul.relation.title;
  const hpRatio = attacker.hp / Math.max(1, attacker.maxHp);
  const effText = evt.eff >= 2 ? '效果超级拔群' : evt.eff > 1 ? '效果拔群' : evt.eff === 0 ? '完全无效' : evt.eff < 1 ? '效果不佳' : '效果一般';
  // 视角文案：我方=对训练家说心声 / 敌方=野外精灵对入侵者的反应
  const scene = isWild
    ? `你是野生精灵，一个训练家带着${defender.name}闯进了你的领地。你用技能「${evt.moveName}」${evt.crit ? '打出了会心一击，' : ''}对${defender.name}造成 ${evt.damage} 点伤害（${effText}）。你当前体力 ${Math.round(hpRatio * 100)}%。用一句话说出你此刻的心声（可以对入侵者放话、嘲讽或为自己打气）。`
    : `你的技能「${evt.moveName}」${evt.crit ? '打出了会心一击' : ''}，对${defender.name}造成 ${evt.damage} 点伤害（${effText}）。你当前体力 ${Math.round(hpRatio * 100)}%。用一句话说出你此刻的战斗心声。`;

  const localFallback = localTaunt(attacker, defender, evt.moveName, evt.damage, evt.eff, evt.crit, hpRatio, trainerTitle);
  bubble.who = isWild ? 'wild' : 'player';

  if (!llmConfig.enabled || !isLlmConfigured(llmConfig)) {
    bubble.text = localFallback;
    setTimeout(() => { if (bubble.text === localFallback) bubble.text = ''; }, 2600);
    return;
  }
  const abort = new AbortController();
  if (isWild) { wildTauntAbort?.abort(); wildTauntAbort = abort; }
  else { tauntAbort?.abort(); tauntAbort = abort; }
  bubble.text = '';
  bubble._raw = '';
  tauntWithSoul(llmConfig, attacker, soul, scene, abort.signal,
    (delta) => {
      bubble._raw = (bubble._raw ?? '') + delta;
      // 状态标记可能被流式 delta 拆成碎片（如 "__STAT"+"E__{"）分批到达：
      // 尾部若疑似标记前缀，先扣住不上屏，等下个 delta 再判定；标记一旦出现即截断
      bubble.text = visibleTauntText(bubble._raw);
    })
    .then(result => {
      bubble._raw = '';
      bubble.text = result.body || bubble.text;
      // 灵魂成长只对我方精灵生效（野生临时灵魂无需成长）
      if (!isWild && attacker.uid != null) {
        updateSoul(attacker.uid, (sl) => {
          touchRelation(sl, 'battle');
          driftTraits(sl, result.state.drift);
        });
      }
      setTimeout(() => { if (bubble.text === result.body) bubble.text = ''; }, 2800);
    })
    .catch(() => {
      // LLM 失败：本地兜底台词上屏（此前 bubble.text 被清空后失败则静默无台词）
      if (!bubble.text) {
        bubble.text = localFallback;
        setTimeout(() => { if (bubble.text === localFallback) bubble.text = ''; }, 2600);
      }
    });
}

function fireTaunt(attacker, defender, evt) {
  streamTaunt(taunt, attacker, defender, evt, soulOf(attacker), false);
}
// 敌方精灵的战斗心声（流式）：野生灵魂 + 野外视角
function fireWildTaunt(attacker, defender, evt) {
  streamTaunt(wildTaunt, attacker, defender, evt, wildSoulOf(attacker), true);
}
function fireTauntMiss(attacker, defender) {
  const soul = soulOf(attacker);
  taunt.text = localTaunt(attacker, defender, '', 0, 1, false, attacker.hp / Math.max(1, attacker.maxHp), soul.relation.title);
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
        else if (e.side === 'wild') fireWildTaunt(state.wild, state.active, e); // 敌方也有战斗心声（流式）
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
    else if (state.ended === 'ran') {
      // 逃跑成功：正常退出战斗返回地图（此前无处理导致界面卡死）
      battle.value = null;
      wild.value = null;
      const backToShared = battleFromChallenge.value;
      battleFromChallenge.value = false;
      view.value = backToShared && sharedPet.value ? 'shared' : 'map';
      showToast('成功逃走了！');
    }
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

async function winBattle() {
  const state = battle.value;
  const mine = petByUid(state.active.uid) ?? state.active;
  ensureSoul(mine);
  const exp = 26 + state.wild.level * 6;
  lastExpGain.value = exp;
  const r = gainExp(mine, exp);
  save.counters.battlesWon++;
  // 灵魂成长：胜利写入经历 + 羁绊升温
  updateSoul(mine.uid, (sl) => {
    touchRelation(sl, 'battle');
    touchRelation(sl, 'win');
    addEpisodic(sl, `在${mapInfo(state.wild.caughtMap ?? state.wild.caughtAt ?? '野外').name}战胜了野生的${state.wild.name}（Lv.${state.wild.level}）。`);
  });
  // 经验分享：其余队员 40%；队友也可能跨过进化门槛（此前静默进化：不计数/不继承灵魂）
  const sharedEvolved = [];
  for (const p of save.pets) {
    if (p.uid !== mine.uid && save.partyIds.includes(p.uid)) {
      const r2 = gainExp(p, Math.round(exp * 0.4));
      if (r2.evolvedTo) {
        save.counters.evolutions++;
        const soul2 = ensureSoul(r2.evolvedTo);
        onEvolve(soul2, r2.evolvedTo.name, r2.evolvedTo.phase ?? 1);
        sharedEvolved.push(r2.evolvedTo);
      }
    }
  }
  // 吞噬：每场胜利都掷（升级=满档 60%/55%，未升级=常驻档 35%/30%）。
  // 之前只在升级时掷——高等级几十场升一级，吞噬体验极度匮乏。
  // 候选交给玩家在弹窗里自选（新增 or 替换谁）。
  // 挑战赛（好友分享宠）不掷：那不是野怪，没有"战利品"语义
  let devourDesc = '';
  {
    const luck = r.levels > 0 ? 'levelup' : 'flat';
    const moveOffers = battleFromChallenge.value ? [] : offerDevourMoves(mine, state.wild.moves ?? [], luck);
    const partOffers = battleFromChallenge.value ? [] : offerDevourParts(mine, state.wild.look, luck);
    if (moveOffers.length || partOffers.length) {
      // 先弹庆祝窗，关掉后再弹吞噬选择（顺序体验：先知道战果，再分配战利品）
      if (r.evolvedTo) {
        save.counters.evolutions++;
        const soul = ensureSoul(r.evolvedTo);
        onEvolve(soul, r.evolvedTo.name, r.evolvedTo.phase ?? 1);
        celebrate('evolve', r.evolvedTo, `进化成了 ${r.evolvedTo.name}！灵魂也成长了`);
      } else if (r.leveled) {
        celebrate('levelup', mine, `${mine.name} 升到了 Lv.${mine.level}！获得 ${exp} 点经验`, r.statGains);
      } else {
        celebrate('win', mine, `${mine.name} 战胜了 ${state.wild.name}，+${exp} 经验`);
      }
      battle.value = null;
      wild.value = null;
      view.value = 'map';
      // 先庆祝、玩家关掉庆祝弹窗后再弹吞噬提案：两 mask 同帧共存时吞噬(z=210)
      // 盖住庆祝(z=200)的「太棒了！」按钮 → 庆祝关不掉 → 软锁（deep-test8 稳定复现）
      await waitCelebrationClosed();
      const { movePicks, partPicks } = await requestDevourChoice({
        petUid: mine.uid,
        petName: mine.name,
        seed: mine.seed,
        petTypes: mine.types,
        petPhase: mine.phase ?? 0,
        // 出战宠真实骨架：存量精灵无 bodyType 字段时按 bodyTypeBiased 定死传入，
        // 保证预览骨架与游戏内渲染完全一致（否则重掷 bias 会漂移成别的骨架）
        petBodyType: mine.bodyType ?? bodyTypeBiased(mine),
        currentExtraParts: [...(mine.extraParts ?? [])],
        defeatedName: state.wild.name,
        moves: moveOffers,
        parts: partOffers,
        currentMoves: mine.moves.map(m => ({ name: m.name, power: m.power })),
        currentLook: { ...mine.look },
      });
      if (movePicks.length || partPicks.length) {
        const desc = applyDevour(mine, movePicks, partPicks);
        devourDesc = desc.join('；');
        if (desc.length) {
          addEpisodic(ensureSoul(mine), `吞噬了${state.wild.name}的${desc.length}处特征：${desc.slice(0, 3).join('、')}${desc.length > 3 ? '…' : ''}。更强了！`);
          showToast(`${mine.name} 吞噬成功！${devourDesc}`, 3600);
        }
      }
      persist();
      return; // 庆祝+吞噬流程已完整走完（含 view 切换），不走下方公共出口
    }
  }
  persist();
  if (r.evolvedTo) {
    save.counters.evolutions++;
    // 灵魂可能尚未建立（老存档精灵直接跳到进化）——ensure 后再继承
    const soul = ensureSoul(r.evolvedTo);
    onEvolve(soul, r.evolvedTo.name, r.evolvedTo.phase ?? 1);
    celebrate('evolve', r.evolvedTo, `进化成了 ${r.evolvedTo.name}！灵魂也成长了`);
  } else if (sharedEvolved.length) {
    // 主战精灵没进化但队友进化了：也要庆祝（取最后一只）
    const e = sharedEvolved[sharedEvolved.length - 1];
    celebrate('evolve', e, `队伍中的 ${e.name} 进化了！`);
  } else if (r.leveled) {
    celebrate('levelup', mine, `${mine.name} 升到了 Lv.${mine.level}！${r.newMoves.length ? r.newMoves.join('，') : `获得 ${exp} 点经验`}`, r.statGains);
  } else {
    // 普通胜利也有弹窗（此前只发 toast，玩家常误以为赢了没反应）
    celebrate('win', mine, `${mine.name} 战胜了 ${state.wild.name}，+${exp} 经验`);
  }
  battle.value = null;
  wild.value = null;
  // 挑战赛胜利后回到分享观赏页（继续看/再战），普通胜利回地图
  const backToShared = battleFromChallenge.value;
  battleFromChallenge.value = false;
  view.value = backToShared && sharedPet.value ? 'shared' : 'map';
}

function loseBattle() {
  const state = battle.value;
  const mine = petByUid(state.active.uid) ?? state.active;
  ensureSoul(mine);
  const r = gainExp(mine, 10 + mine.level * 2);
  // 灵魂成长：倒下也是共同经历（羁绊微升——共患难）
  updateSoul(mine.uid, (sl) => {
    touchRelation(sl, 'battle');
    touchRelation(sl, 'loss');
    addEpisodic(sl, `被野生的${state.wild.name}打败了，虽然很不甘心，但下次会赢回来。`);
  });
  // 检查是否还有活着的队员 → 有则转强制换宠；没有才整场结束（休闲复活）
  const alive = state.party.filter(p => p.uid !== state.active.uid && p.hp > 0);
  if (alive.length) {
    state.ended = 'switch';
    battleLog.value.push({ type: 'status', text: `${state.active.name} 倒下了，请选择下一只精灵！` });
    showToast(`${state.active.name} 倒下了！换其他精灵继续战斗`);
    // 败北经验也可能触发进化（此前静默进化：不计数/不继承灵魂/不庆祝）
    if (r.evolvedTo) {
      save.counters.evolutions++;
      const soul = ensureSoul(r.evolvedTo);
      onEvolve(soul, r.evolvedTo.name, r.evolvedTo.phase ?? 1);
      celebrate('evolve', r.evolvedTo, `虽然输了，但 ${r.evolvedTo.name} 进化了！`);
    }
    return; // 保持 battle 状态，force-switch 面板出现
  }
  // 全军覆没：休闲模式原地满血复活
  for (const p of save.pets) p.hp = undefined;
  persist();
  if (r.evolvedTo) {
    save.counters.evolutions++;
    const soul = ensureSoul(r.evolvedTo);
    onEvolve(soul, r.evolvedTo.name, r.evolvedTo.phase ?? 1);
    celebrate('evolve', r.evolvedTo, `虽然输了，但 ${r.evolvedTo.name} 进化了！`);
  } else {
    showToast('全军覆没…精灵们休息了一会儿又满血复活（休闲模式）');
  }
  battle.value = null;
  wild.value = null;
  // 挑战赛战败也回分享观赏页（可再战），普通战败回地图
  const backToShared = battleFromChallenge.value;
  battleFromChallenge.value = false;
  view.value = backToShared && sharedPet.value ? 'shared' : 'map';
}

// 捕捉成功嗨点
function succeedCatch() {
  // 防御：挑战赛（好友分享宠）不允许被捕捉（按钮已隐藏，此为引擎级兜底）
  if (battleFromChallenge.value) {
    battleFromChallenge.value = false;
    battle.value = null;
    view.value = sharedPet.value ? 'shared' : 'map';
    showToast('好友的精灵不能被捕捉！');
    return;
  }
  const caught = JSON.parse(JSON.stringify(battle.value?.wild ?? wild.value));
  const adopted = adoptPet(caught);
  // 新伙伴的灵魂在此刻诞生（persona 按 seed 掷点固化）
  const soul = ensureSoul(adopted);
  addEpisodic(soul, `在${mapInfo(caught.caughtMap ?? caught.caughtAt).name}与训练家相遇，被捕捉后加入了队伍。这是你们缘分的开始。`);
  celebrate('catch', adopted, '加入你的队伍！');
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

// 图鉴排序按钮：置顶/上移/下移（拖拽与页面滚动冲突，改为按钮操作）
function movePet(pet, dir) {
  const idx = save.pets.findIndex(p => p.uid === pet.uid);
  if (idx < 0) return;
  let to;
  if (dir === 'top') {
    if (idx === 0) return;
    to = 0;
  } else if (dir === 'up') {
    if (idx === 0) return;
    to = idx - 1;
  } else if (dir === 'down') {
    if (idx === save.pets.length - 1) return;
    to = idx + 1;
  } else return;
  save.pets.splice(to, 0, save.pets.splice(idx, 1)[0]);
  persist();
}

function toggleParty(uid) {
  const i = save.partyIds.indexOf(uid);
  if (i >= 0) save.partyIds.splice(i, 1);
  else if (save.partyIds.length < 4) save.partyIds.push(uid);
  else { showToast('最多上阵 4 只'); return; }
  // 上阵的宠物提到图鉴最前（按 partyIds 顺序）；下阵的移到末尾。
  // 只在状态变化时执行一次——用户随后仍可手动微调排序（出战顺序=图鉴顺序）。
  const inParty = save.partyIds.map(id => save.pets.find(p => p.uid === id)).filter(Boolean);
  const others = save.pets.filter(p => !save.partyIds.includes(p.uid));
  save.pets = [...inParty, ...others];
  persist();
}

function releasePet(pet) {
  if (!confirm(`确定放归 ${pet.name} 吗？此操作不可撤销。`)) return;
  save.pets = save.pets.filter(p => p.uid !== pet.uid);
  save.partyIds = save.partyIds.filter(id => id !== pet.uid);
  // 同步清理灵魂档案与聊天记录（避免残留孤儿数据）
  forgetSoul(pet.uid);
  forgetChat(pet.uid);
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
  // 存档 + 灵魂档案 + 聊天记录 + LLM 配置一起导出（人格/羁绊/记忆/接口配置不丢失）
  const blob = new Blob([exportSaveText(JSON.parse(JSON.stringify({ ...save, version: 1 })), {
    souls: exportSouls(),
    chats: exportChats(),
    llm: { ...llmConfig },
  })], { type: 'application/json' });
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
    const { save: data, souls, chats, llm } = importSaveText(text);
    if (!confirm('导入会覆盖当前存档，确定继续吗？')) return;
    Object.assign(save, data);
    // 恢复灵魂与聊天（有则覆盖，无则保留导入文件中原样内容）
    if (souls) importSouls(souls);
    if (chats) importChats(chats);
    // 存档整理：出战宠按 partyIds 顺序提到前面（图鉴展示与出战序列一致）
    {
      const inParty = save.partyIds.map(id => save.pets.find(p => p.uid === id)).filter(Boolean);
      const others = save.pets.filter(p => !save.partyIds.includes(p.uid));
      save.pets = [...inParty, ...others];
    }
    persist();
    if (llm) {
      Object.assign(llmConfig, {
        baseUrl: String(llm.baseUrl ?? ''),
        model: String(llm.model ?? ''),
        apiKey: String(llm.apiKey ?? ''),
        enabled: !!llm.enabled,
      });
      saveLlmConfig();
    }
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
  // 一并清理灵魂档案与聊天记录（与存档同生命周期，避免残留脏数据）
  clearAllStorage();
  location.reload();
}

// 挂载后回到地图（但分享观赏模式除外：#p= 链接进来要保持 shared 视图）。
// initShared 是异步（v2 压缩解码）——挂载时可能尚未完成：只在没有 #p= hash 时立即回地图
onMounted(() => { if (!sharedPet.value && !location.hash.match(/^#p=/)) view.value = 'map'; });
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
        <!-- 分享模式：相遇位变「分享宠」入口（查看者点地图/图鉴后还能回来挑战） -->
        <button v-if="sharedPet" :class="{ active: view === 'shared' }" @click="view = 'shared'">🐾 分享宠</button>
        <button v-else :class="{ active: view === 'encounter' || view === 'battle' }"
          :disabled="!wild && !battle"
          @click="if (battle) view = 'battle'; else if (wild) view = 'encounter'">相遇</button>
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

      <!-- ============ 分享观赏（#p= 链接）：只读 3D + 挑战 ============ -->
      <section v-else-if="view === 'shared' && sharedPet" class="encounter-view shared-view">
        <div class="wild-card">
          <div class="wild-sprite3d">
            <Pet3D :pet="sharedPet" :size="200" drag-mode="free" />
          </div>
          <h2>{{ sharedPet.name }} <small class="lv">Lv.{{ sharedPet.level }}</small></h2>
          <p class="shared-owner-hint">🐾 来自好友分享的精灵 · 点击它会跳一下</p>
          <div class="chips">
            <i v-for="t in sharedPet.types" :key="t" class="chip" :style="typeChipStyle(t)">{{ t }}</i>
            <i class="chip rarity-chip" :style="{ background: rarityInfo(sharedPet.rarity).color }">{{ rarityInfo(sharedPet.rarity).name }}</i>
          </div>
          <p class="lore">{{ sharedPet.lore }}</p>
          <div class="actions">
            <button class="primary" @click="challengeShared">⚔️ 用我的精灵挑战</button>
            <button class="ghost" @click="exitShared">返回游戏</button>
          </div>
        </div>
      </section>

      <!-- ============ 相遇 ============ -->
      <section v-else-if="view === 'encounter' && wild" class="encounter-view">
        <div class="wild-card" :style="{ '--rarity': rarityInfo(wild.rarity).color }">
          <div class="wild-sprite3d">
            <Pet3D :pet="wild" :size="200" drag-mode="panY" />
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
        <div class="battle-arena" :class="{ 'has-taunt': !!taunt.text }">
          <!-- 野生（左） -->
          <div class="fighter wild" :class="{ attacking: anim.who === 'wild' && anim.kind === 'attack', hit: anim.who === 'wild' && anim.kind === 'hit', fainting: anim.who === 'wild' && anim.kind === 'faint' }">
            <div class="plate">
              <div class="plate-row"><strong>{{ battle.wild.name }}</strong><span>Lv.{{ battle.wild.level }}</span></div>
              <div class="hp-bar"><i :style="{ width: Math.max(0, battle.wild.hp / battle.wild.maxHp * 100) + '%' }" :class="{ low: battle.wild.hp / battle.wild.maxHp < 0.25 }"></i></div>
              <span class="hp-num">{{ battle.wild.hp }} / {{ battle.wild.maxHp }}</span>
            </div>
            <div class="fighter-model"><Pet3D :pet="battle.wild" :size="130" drag-mode="panY" /></div>
          </div>
          <div class="vs">⚡</div>
          <!-- 我方（右） -->
          <div class="fighter mine" :class="{ attacking: anim.who === 'player' && anim.kind === 'attack', hit: anim.who === 'player' && anim.kind === 'hit', fainting: anim.who === 'player' && anim.kind === 'faint' }">
            <div class="fighter-model"><Pet3D :pet="battle.active" :size="130" drag-mode="panY" /></div>
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
          <!-- 灵魂对话气泡：流式输出在竞技场底部（精灵下方），随说话者靠左/靠右；双方独立互不打断 -->
          <Transition name="taunt">
            <div v-if="taunt.text" class="taunt-bubble" :class="'taunt-' + (taunt.who === 'wild' ? 'wild' : 'mine')">
              <span class="taunt-who">{{ taunt.who === 'wild' ? battle.wild.name : battle.active.name }}</span>
              <span class="taunt-text">{{ taunt.text }}</span>
            </div>
          </Transition>
          <Transition name="taunt">
            <div v-if="wildTaunt.text" class="taunt-bubble taunt-wild">
              <span class="taunt-who">{{ battle.wild.name }}</span>
              <span class="taunt-text">{{ wildTaunt.text }}</span>
            </div>
          </Transition>
        </div>

        <!-- 操作区（优先级最高，不被战报推挤） -->
        <!-- 强制换宠 -->
        <div v-if="battle.ended === 'switch'" class="battle-actions force-switch">
          <p class="hint">哪只精灵继续战斗？</p>
          <button v-for="(p, i) in battle.party" :key="p.uid" class="skill switch-opt" :disabled="p.hp <= 0 || p.uid === battle.active.uid" @click="switchPet(i)">
            <img class="switch-avatar" :src="petSnapshot(p)" :alt="p.name" width="44" height="44" />
            <span class="switch-meta">{{ p.name }}<small>{{ p.hp > 0 ? `HP ${p.hp}/${p.maxHp}` : '已倒下' }}</small></span>
          </button>
        </div>

        <!-- 常规操作：win/lose 结算动画期间按钮禁用但保持显示，避免按钮区塌陷跳版 -->
        <div class="battle-actions" v-else-if="!battle.ended || battle.ended === 'win' || battle.ended === 'lose'">
          <button v-for="(mv, i) in battle.active.moves" :key="mv.name" class="skill" :disabled="battleBusy || !!battle.ended || showSwitchPanel"
            :style="{ '--type-color': typeChipStyle(mv.type ?? battle.active.types[0]).background }"
            @click="act({ type: 'move', moveIndex: i })">
            {{ mv.name }}<small>{{ mv.power ? `威力 ${mv.power}` : '变化' }}</small>
          </button>
          <!-- 挑战赛（好友分享宠）不能丢球捕捉——那是别人的精灵，捕捉语义不成立 -->
          <button v-if="!battleFromChallenge" class="ball" :disabled="battleBusy || !!battle.ended || showSwitchPanel" @click="act({ type: 'ball' })">
            丢球 <small>{{ Math.round(catchChance(battle.wild) * 100) }}%</small>
          </button>
          <button class="switch-toggle" :disabled="battleBusy || !!battle.ended" @click="showSwitchPanel = !showSwitchPanel" title="切换出战精灵（换上后对方会趁机攻击）">
            换宠 <small>{{ battle.party.filter(p => p.hp > 0 && p.uid !== battle.active.uid).length }} 只可用</small>
          </button>
          <button class="ghost" :disabled="battleBusy || !!battle.ended || showSwitchPanel" @click="act({ type: 'run' })">逃跑</button>
        </div>

        <!-- 主动换宠面板（非强制：点「换宠」展开；选择后 wild 趁机攻击，符合宝可梦规则） -->
        <div v-if="!battle.ended && showSwitchPanel" class="battle-actions force-switch">
          <p class="hint">换上哪只精灵？（换宠会消耗本回合，对方趁机攻击）</p>
          <button v-for="(p, i) in battle.party" :key="p.uid" class="skill switch-opt" :disabled="p.hp <= 0 || p.uid === battle.active.uid" @click="showSwitchPanel = false; switchPet(i)">
            <img class="switch-avatar" :src="petSnapshot(p)" :alt="p.name" width="44" height="44" />
            <span class="switch-meta">{{ p.name }}<small>{{ p.hp > 0 ? `HP ${p.hp}/${p.maxHp}` : '已倒下' }}</small></span>
          </button>
          <button class="ghost" @click="showSwitchPanel = false">取消</button>
        </div>

        <!-- 战报（固定高度可滚动，新纪录自动滚到底，不再推挤按钮） -->
        <div class="battle-log" ref="logEl">
          <p v-for="(e, i) in battleLog.slice(-12)" :key="i" :class="{ hl: e.type === 'faint' || (e.type === 'ball' && e.caught) }">{{ e.text }}</p>
        </div>
      </section>

      <!-- ============ 图鉴 ============ -->
      <section v-else-if="view === 'dex'" class="dex-view">
        <p class="hint">已遇见 {{ totalSeen }} 种 · 已捕捉 {{ save.pets.length }}/{{ collectionGoal }} · 上阵 {{ save.partyIds.length }}/4（点击卡片切换上阵 · 按钮排序）</p>
        <div v-if="!dexList.length" class="empty">还没有捕捉到精灵，去地图逛逛吧！</div>
        <div class="dex-grid">
          <div v-for="(pet, di) in dexList" :key="pet.uid" class="dex-card" :class="{ inParty: save.partyIds.includes(pet.uid) }"
            @click="detailPet = pet">
            <div class="dex-sprite"><img :key="petSnapshotKey(pet)" :src="petSnapshot(pet)" :alt="pet.name" width="84" height="84" loading="lazy" /></div>
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
            <div class="sort-btns" @click.stop>
              <button class="sort-btn" :disabled="di === 0" @click="movePet(pet, 'top')" title="置顶">⤒</button>
              <button class="sort-btn" :disabled="di === 0" @click="movePet(pet, 'up')" title="上移">↑</button>
              <button class="sort-btn" :disabled="di === dexList.length - 1" @click="movePet(pet, 'down')" title="下移">↓</button>
            </div>
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

    <!-- 吞噬选择弹窗（升级战利品） -->
    <DevourChoice />

    <!-- 全局轻提示 -->
    <GlobalToast />

    <!-- 全屏庆祝弹窗 -->
    <Celebration />
  </div>
</template>
