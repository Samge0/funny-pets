const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';
let n = 0, miss = 0;
const rep = (s, from, to) => { if (s.includes(from)) { n++; return s.split(from).join(to); } miss++; console.log(`MISS: ${from.slice(0, 70)}`); return s; };

let d = fs.readFileSync(ROOT + 'src/components/DevourChoice.vue', 'utf8');
// import
d = rep(d, `import { petSvg } from '../core/sprites.js';`,
  `import { petSvg } from '../core/sprites.js';\nimport { t, partLabel as partLabelI18n, valueLabel as valueLabelI18n, moveName as moveNameI18n } from '../core/i18n.js';`);
// VALUE_LABELS 表 → i18n valueLabel；本地 valueLabel 函数改走 i18n（zh 词典同值）
d = rep(d, `const VALUE_LABELS = {
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
}`,
  `// 部件值显示名走 i18n（zh 词典收录原表同值；en/ja 翻译）
function valueLabel(part, v) {
  if (v == null || v === 'none') return t('无');
  if (part === 'body') return valueLabelI18n(v + '_body') !== v + '_body' ? valueLabelI18n(v + '_body') : (valueLabelI18n(v) !== v ? valueLabelI18n(v) : v);
  const m = valueLabelI18n(v);
  return m !== v ? m : v;
}`);
// partLabel 引用改 i18n（evolve.js PART_LABELS 是 zh 表；i18n partLabel 覆盖 zh/en/ja/tw）
d = rep(d, `import { PART_LABELS, LOOK_TO_SKELETON } from '../core/evolve.js';`,
  `import { LOOK_TO_SKELETON } from '../core/evolve.js';`);
d = rep(d, `const partLabel = (p) => PART_LABELS[p] ?? p;`, `const partLabel = (p) => partLabelI18n(p) !== p ? partLabelI18n(p) : p;`);
// 模板
d = rep(d, `<div class="devour-banner">🍖 吞噬时刻！</div>`, `<div class="devour-banner">{{ t('🍖 吞噬时刻！') }}</div>`);
d = rep(d, `<p class="devour-sub">{{ offer.petName }} 可以吞噬 {{ offer.defeatedName }} 的部分特征——选择你要的战利品：</p>`,
  `<p class="devour-sub">{{ t('{pet} 可以吞噬 {foe} 的部分特征——选择你要的战利品：', { pet: offer.petName, foe: offer.defeatedName }) }}</p>`);
d = rep(d, `<p class="live-hint">{{ changedParts.length ? changedParts.join(' + ') : '勾选部件即时预览' }}</p>`,
  `<p class="live-hint">{{ changedParts.length ? changedParts.join(' + ') : t('勾选部件即时预览') }}</p>`);
d = rep(d, `<p class="live-sub">👆 可拖动旋转查看</p>`, `<p class="live-sub">{{ t('👆 可拖动旋转查看') }}</p>`);
d = rep(d, `<h4>🎨 外观部件（勾选实时预览）</h4>`, `<h4>{{ t('🎨 外观部件（勾选实时预览）') }}</h4>`);
d = rep(d, `<span v-if="pp.part === 'body'" class="body-tag">🦴 换骨架：头身手脚形态全变</span>`,
  `<span v-if="pp.part === 'body'" class="body-tag">{{ t('🦴 换骨架：头身手脚形态全变') }}</span>`);
d = rep(d, `alt="吞前" width="48" height="48" />`, `width="48" height="48" />`);
d = rep(d, `alt="吞后" width="48" height="48" />`, `width="48" height="48" />`);
d = rep(d, `➕ 叠加（保留原{{ partLabel(pp.part)}}，多长一件）`, `{{ t('➕ 叠加（保留原{part}，多长一件）', { part: partLabel(pp.part) }) }}`);
d = rep(d, `🔄 替换（原{{ partLabel(pp.part) }}换成它）`, `{{ t('🔄 替换（原{part}换成它）', { part: partLabel(pp.part) }) }}`);
d = rep(d, `<h4>⚔️ 技能</h4>`, `<h4>{{ t('⚔️ 技能') }}</h4>`);
d = rep(d, `<span class="mv-name" :style="{ '--type-color': typeColor(mv.type) }">{{ mv.name }}</span>`,
  `<span class="mv-name" :style="{ '--type-color': typeColor(mv.type) }">{{ moveNameI18n(mv.name) }}</span>`);
d = rep(d, `<small>{{ mv.power ? \`威力 \${mv.power}\` : '变化技' }}</small>`,
  `<small>{{ mv.power ? t('威力 {n}', { n: mv.power }) : t('变化技') }}</small>`);
d = rep(d, `新学会（当前 {{ offer.currentMoves.length }} 个）`, `{{ t('新学会（当前 {n} 个）', { n: offer.currentMoves.length }) }}`);
d = rep(d, `替换「{{ cm.name }}」`, `{{ t('替换「{name}」', { name: moveNameI18n(cm.name) }) }}`);
d = rep(d, `<button class="ghost" @click="confirmAll">跳过</button>`, `<button class="ghost" @click="confirmAll">{{ t('跳过') }}</button>`);
d = rep(d, `<button class="primary" @click="confirmAll">确认吞噬</button>`, `<button class="primary" @click="confirmAll">{{ t('确认吞噬') }}</button>`);
// partMode 本地枚举文案
d = rep(d, `if (pp.part === 'body') return '体型替换';`, `if (pp.part === 'body') return t('体型替换');`);
d = rep(d, `if (isEmptySlot(pp)) return '🌱 长出';`, `if (isEmptySlot(pp)) return t('🌱 长出');`);
d = rep(d, `if (pp.part === 'pattern' || pp.part === 'eyes') return '🔄 换上';`, `if (pp.part === 'pattern' || pp.part === 'eyes') return t('🔄 换上');`);
d = rep(d, `return partHow[pi] === 'replace' ? '🔄 替换' : '➕ 叠加';`, `return partHow[pi] === 'replace' ? t('🔄 替换') : t('➕ 叠加');`);
// changedParts 的 '叠加'/'换上' 文案词
d = rep(d, `partMode(pp, offer.parts.indexOf(pp)) === '➕ 叠加' ? '叠加' : partMode(pp, offer.parts.indexOf(pp)) === '🔄 替换' ? '换上' : '→'`,
  `partMode(pp, offer.parts.indexOf(pp)) === t('➕ 叠加') ? t('叠加') : partMode(pp, offer.parts.indexOf(pp)) === t('🔄 替换') ? t('🔄 换上') : '→'`);
// 预览宠名字
d = rep(d, `const pet = { seed: offer.seed ?? 1, name: '预览', types: offer.petTypes ?? ['一般'], look };`,
  `const pet = { seed: offer.seed ?? 1, name: 'preview', types: offer.petTypes ?? ['一般'], look };`);
d = rep(d, `name: offer.petName || '预览',`, `name: offer.petName || 'preview',`);
fs.writeFileSync(ROOT + 'src/components/DevourChoice.vue', d);
console.log(`DevourChoice: ${n} replaced, ${miss} missed`);
