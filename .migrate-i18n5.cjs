const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';
let n = 0, miss = 0;
const rep = (s, from, to, tag) => { if (s.includes(from)) { n++; return s.split(from).join(to); } miss++; console.log(`MISS ${tag}: ${from.slice(0, 60)}`); return s; };

// ============ PetDetail.vue ============
let p = fs.readFileSync(ROOT + 'src/components/PetDetail.vue', 'utf8');
p = rep(p, `import { shareUrl, giftUrl } from '../core/sharePet.js';`,
  `import { shareUrl, giftUrl } from '../core/sharePet.js';\nimport { t, rarityName as rarityLabelOf, typeName as typeNameOf, relationTitle as relationTitleOf, traitLabel as traitLabelOf, locale } from '../core/i18n.js';`);
p = rep(p, `<button class="detail-gift" @click="gift" title="生成赠送链接——好友打开后可领取一只它的克隆（你不会失去它）">{{ gifting ? '🎁 生成中…' : '🎁 赠送' }}</button>`,
  `<button class="detail-gift" @click="gift" :title="t('生成赠送链接——好友打开后可领取一只它的克隆（你不会失去它）')">{{ gifting ? t('🎁 生成中…') : t('🎁 赠送') }}</button>`);
p = rep(p, `<button class="detail-share" @click="share" title="生成 AI 分享文案+链接（复制后可直接发社交平台）" :disabled="sharing">{{ sharing ? '✨ 生成中…' : '📣 分享' }}</button>`,
  `<button class="detail-share" @click="share" :title="t('生成 AI 分享文案+链接（复制后可直接发社交平台）')" :disabled="sharing">{{ sharing ? t('✨ 生成中…') : t('📣 分享') }}</button>`);
p = rep(p, `<button class="detail-share-link" @click="copyLink" title="仅复制分享链接">`,
  `<button class="detail-share-link" @click="copyLink" :title="t('仅复制分享链接')">`);
p = rep(p, `<small v-if="pet.phase" class="phase-badge">{{ pet.phase }}阶</small>`,
  `<small v-if="pet.phase" class="phase-badge">{{ t('{n}阶', { n: pet.phase }) }}</small>`);
p = rep(p, `<i class="chip rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityInfo(pet.rarity).name }}</i>`,
  `<i class="chip rarity-chip" :style="{ background: rarityInfo(pet.rarity).color }">{{ rarityLabelOf(pet.rarity) }}</i>`);
p = rep(p, `<i v-for="t in pet.types" :key="t" class="chip" :style="chipStyle(t)">{{ t }}</i>`,
  `<i v-for="tp in pet.types" :key="tp" class="chip" :style="chipStyle(tp)">{{ typeLabel(tp) }}</i>`);
p = rep(p, `function chipStyle(t) { return { background: TYPE_COLORS[t] ?? '#9fa19f' }; }`,
  `function chipStyle(tp) { return { background: TYPE_COLORS[tp] ?? '#9fa19f' }; }\nconst typeLabel = (tp) => typeNameOf(tp);`);
p = rep(p, `<p class="soul-line">「{{ traitText.warmth }} · {{ traitText.energy }} · {{ traitText.pride }} · {{ traitText.curiosity }}」</p>`,
  `<p class="soul-line">「{{ traitLine }}」</p>`);
p = rep(p, `const traitText = computed(() => traitLabels(soul.value?.traits ?? { warmth: 0, energy: 0, pride: 0, curiosity: 0 }));`,
  `const traitText = computed(() => traitLabels(soul.value?.traits ?? { warmth: 0, energy: 0, pride: 0, curiosity: 0 }));\n// 显示层：四维性格词按当前语言映射（zh 保持中文词）\nconst traitLine = computed(() => {\n  const tt = traitText.value;\n  const f = (w) => (locale.value === 'zh' || locale.value === 'zh-TW') ? w : (traitLabelOf(w) ?? w);\n  return [f(tt.warmth), f(tt.energy), f(tt.pride), f(tt.curiosity)].join(' · ');\n});`);
p = rep(p, `<span class="bond-title">{{ soul.relation.title }}</span>`,
  `<span class="bond-title">{{ relationTitleOf(soul.relation.title) }}</span>`);
p = rep(p, `<button :class="{ active: tab === 'soul' }" @click="tab = 'soul'">💬 灵魂对话</button>`,
  `<button :class="{ active: tab === 'soul' }" @click="tab = 'soul'">{{ t('💬 灵魂对话') }}</button>`);
p = rep(p, `@click="tab = 'profile'">🧠 记忆 <em>{{ soul.memory.profile.length }}</em></button>`,
  `@click="tab = 'profile'">{{ t('🧠 记忆') }} <em>{{ soul.memory.profile.length }}</em></button>`);
p = rep(p, `@click="tab = 'story'">📖 经历 <em>{{ soul.memory.episodic.length }}</em></button>`,
  `@click="tab = 'story'">{{ t('📖 经历') }} <em>{{ soul.memory.episodic.length }}</em></button>`);
p = rep(p, `<p>你们还没有聊过天。</p>`, `<p>{{ t('你们还没有聊过天。') }}</p>`);
p = rep(p, `<p class="dim">它喜欢{{ soul.identity.love }}，讨厌{{ soul.identity.hate }}。聊聊这些它会更喜欢你。</p>`,
  `<p class="dim">{{ t('它喜欢{love}，讨厌{hate}。聊聊这些它会更喜欢你。', { love: soul.identity.love, hate: soul.identity.hate }) }}</p>`);
p = rep(p, `:placeholder="llmReady ? \`和\${pet.name}说点什么…\` : '需在设置页启用 AI 后聊天'"`,
  `:placeholder="llmReady ? t('和{name}说点什么…', { name: pet.name }) : t('需在设置页启用 AI 后聊天')"`);
p = rep(p, `<button type="submit" class="primary" :disabled="!llmReady || typing || !draft.trim()">发送</button>`,
  `<button type="submit" class="primary" :disabled="!llmReady || typing || !draft.trim()">{{ t('发送') }}</button>`);
p = rep(p, `<small>对话 {{ soul.relation.chats }} 次 · 每 20 条自动沉淀为长期记忆</small>`,
  `<small>{{ t('对话 {n} 次 · 每 20 条自动沉淀为长期记忆', { n: soul.relation.chats }) }}</small>`);
p = rep(p, `<button class="ghost sm" @click="clearChat">清空记录</button>`,
  `<button class="ghost sm" @click="clearChat">{{ t('清空记录') }}</button>`);
p = rep(p, `<div v-if="!soul.memory.profile.length" class="empty">还没有沉淀出长期记忆，多和它聊天吧。</div>`,
  `<div v-if="!soul.memory.profile.length" class="empty">{{ t('还没有沉淀出长期记忆，多和它聊天吧。') }}</div>`);
p = rep(p, `<div v-if="!soul.memory.episodic.length" class="empty">还没有值得记录的经历。</div>`,
  `<div v-if="!soul.memory.episodic.length" class="empty">{{ t('还没有值得记录的经历。') }}</div>`);
// script toasts
p = rep(p, `catch { showToast('复制失败，请手动复制地址栏', 2600); }`,
  `catch { showToast(t('复制失败，请手动复制地址栏'), 2600); }`);
p = rep(p, `writeClipboard(url, () => showToast('分享链接已复制！好友打开即可观赏或挑战', 3200));`,
  `writeClipboard(url, () => showToast(t('分享链接已复制！好友打开即可观赏或挑战'), 3200));`);
p = rep(p, `const line1 = \`我把「\${props.pet.name}」赠送给你啦！纯前端小礼物🎁\`;`,
  `const line1 = t('我把「{name}」赠送给你啦！纯前端小礼物🎁', { name: props.pet.name });`);
p = rep(p, `const line2 = '打开链接领取一只它的克隆（我的原宠还在我身边，放心）——它的灵魂档案和 AI 聊天会用你自己的配置重新开始。';`,
  `const line2 = t('打开链接领取一只它的克隆（我的原宠还在我身边，放心）——它的灵魂档案和 AI 聊天会用你自己的配置重新开始。');`);
p = rep(p, `writeClipboard(\`\${line1}\\n\${line2}\\n\${url}\`, () => showToast('赠送链接已复制！发给好友即可领取（你不会失去它）', 3600));`,
  `writeClipboard(\`\${line1}\\n\${line2}\\n\${url}\`, () => showToast(t('赠送链接已复制！发给好友即可领取（你不会失去它）'), 3600));`);
p = rep(p, `const traits = tt ? \`\${tt.warmth}、\${tt.energy}、\${tt.pride}、\${tt.curiosity}\` : '活泼可爱';`,
  `const traits = tt ? [tt.warmth, tt.energy, tt.pride, tt.curiosity].map(w => traitLabelOf(w) ?? w).join(', ') : t('活泼可爱');`);
p = rep(p, `const relation = soulCur ? \`好感 \${Math.round(soulCur.relation.affinity)}/100（\${soulCur.relation.title}）\` : '亲密伙伴';`,
  `const relation = soulCur ? \`\${Math.round(soulCur.relation.affinity)}/100 (\${relationTitleOf(soulCur.relation.title)})\` : t('亲密伙伴');`);
p = rep(p, `if (llmReady.value) showToast('AI 文案生成失败，已用模板文案', 2600);`,
  `if (llmReady.value) showToast(t('AI 文案生成失败，已用模板文案'), 2600);`);
p = rep(p, `writeClipboard(\`\${copy}\\n\${url}\`, () => showToast('分享文案+链接已复制，去社交平台粘贴吧！', 3200));`,
  `writeClipboard(\`\${copy}\\n\${url}\`, () => showToast(t('分享文案+链接已复制，去社交平台粘贴吧！'), 3200));`);
p = rep(p, `showToast(\`聊天失败：\${err.message}\`);`,
  `showToast(t('聊天失败：{err}', { err: err.message }));`);
p = rep(p, `if (!confirm(\`清空与 \${props.pet.name} 的全部聊天记录？（灵魂档案与长期记忆保留）\`)) return;`,
  `if (!confirm(t('清空与 {name} 的全部聊天记录？（灵魂档案与长期记忆保留）', { name: props.pet.name }))) return;`);
p = rep(p, `showToast('聊天记录已清空（长期记忆保留）');`,
  `showToast(t('聊天记录已清空（长期记忆保留）'));`);
fs.writeFileSync(ROOT + 'src/components/PetDetail.vue', p);

// ============ Celebration.vue ============
let c = fs.readFileSync(ROOT + 'src/components/Celebration.vue', 'utf8');
c = rep(c, `<button class="cele-btn" @click="closeCelebration">太棒了！</button>`,
  `<button class="cele-btn" @click="closeCelebration">{{ t('太棒了！') }}</button>`);
c = rep(c, `import { withStats } from '../store.js';`,
  `import { withStats } from '../store.js';\nimport { t, rarityName as rarityLabelOf } from '../core/i18n.js';`);
c = rep(c, `const bannerText = computed(() => ({\n  catch: '🎉 捕捉成功！',\n  evolve: '✨ 进化了！',\n  levelup: '⬆️ 等级提升！',\n  win: '🎉 战斗胜利！',\n}[celebration.kind] ?? ''));`,
  `const bannerText = computed(() => t({\n  catch: '🎉 捕捉成功！',\n  evolve: '✨ 进化了！',\n  levelup: '⬆️ 等级提升！',\n  win: '🎉 战斗胜利！',\n}[celebration.kind] ?? ''));`);
c = rep(c, `const names = { hp: 'HP', atk: '攻击', def: '防御', spd: '速度' };`,
  `const names = { hp: t('HP'), atk: t('攻击'), def: t('防御'), spd: t('速度') };`);
c = rep(c, `<i v-for="t in celebration.pet.types" :key="t" class="chip" :style="chipStyle(t)">{{ t }}</i>`,
  `<i v-for="tp in celebration.pet.types" :key="tp" class="chip" :style="chipStyle(tp)">{{ typeLabel(tp) }}</i>`);
c = rep(c, `function chipStyle(t) {\n  return { background: TYPE_COLORS[t] ?? '#9fa19f' };\n}`,
  `function chipStyle(tp) {\n  return { background: TYPE_COLORS[tp] ?? '#9fa19f' };\n}`);
c = rep(c, `import { t, rarityName as rarityLabelOf } from '../core/i18n.js';`,
  `import { t, rarityName as rarityLabelOf, typeName as typeNameOf } from '../core/i18n.js';\nconst typeLabel = (tp) => typeNameOf(tp);`);
c = rep(c, `{{ rarityInfo(celebration.pet.rarity).name }}`, `{{ rarityLabelOf(celebration.pet.rarity) }}`);
fs.writeFileSync(ROOT + 'src/components/Celebration.vue', c);

// ============ DevourChoice.vue ============
let d = fs.readFileSync(ROOT + 'src/components/DevourChoice.vue', 'utf8');
// import + VALUE_LABELS/partLabel 本地化
d = rep(d, `import { LOOK_TO_SKELETON } from '../core/sprite3d.js';`,
  `import { LOOK_TO_SKELETON } from '../core/sprite3d.js';\nimport { t, partLabel as partLabelOf, valueLabel as valueLabelOf, moveName as moveNameOf } from '../core/i18n.js';`);
fs.writeFileSync(ROOT + 'src/components/DevourChoice.vue', d);
console.log(`components: ${n} replaced, ${miss} missed`);
