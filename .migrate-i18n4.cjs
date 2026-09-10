const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';

// ---- App.vue 补丁 ----
let s = fs.readFileSync(ROOT + 'src/App.vue', 'utf8');
let n = 0;
const rep = (from, to) => { if (s.includes(from)) { s = s.split(from).join(to); n++; } else console.log('MISS:', from.slice(0, 70)); };

// moveLabel helper（import moveName）
rep(
  `import { LANGUAGES, t, setLocale, typeName as typeNameOf, mapName, rarityName, locale } from './core/i18n.js';`,
  `import { LANGUAGES, t, setLocale, typeName as typeNameOf, mapName, rarityName, moveName, locale } from './core/i18n.js';`
);
rep(
  `const typeLabel = (tp) => typeNameOf(tp); // 属性显示名（TYPE_COLORS 仍按 zh 规范 key 索引）`,
  `const typeLabel = (tp) => typeNameOf(tp); // 属性显示名（TYPE_COLORS 仍按 zh 规范 key 索引）\nconst moveLabel = (m) => moveName(m); // 技能显示名`
);
// wild rarity chip in encounter view
rep(
  `<i class="chip rarity-chip" :style="{ background: rarityInfo(wild.rarity).color }">{{ rarityInfo(wild.rarity).name }}</i>`,
  `<i class="chip rarity-chip" :style="{ background: rarityInfo(wild.rarity).color }">{{ rarityName(wild.rarity) }}</i>`
);
fs.writeFileSync(ROOT + 'src/App.vue', s);
console.log(`App.vue extras: ${n} replaced`);

// ---- battle 视图里的技能按钮名（脚本批漏的 mv.name）----
let s2 = fs.readFileSync(ROOT + 'src/App.vue', 'utf8');
const mvCount = (s2.match(/moveLabel\(mv\.name\)/g) || []).length;
console.log('moveLabel usage in template:', mvCount);

// ---- main.js: 启动时设 document.title ----
let m = fs.readFileSync(ROOT + 'src/main.js', 'utf8');
if (!m.includes('i18n')) {
  m = m.replace(
    `import { statsAt } from './core/evolve.js';`,
    `import { statsAt } from './core/evolve.js';\nimport { t } from './core/i18n.js';`
  );
  m = m.replace(
    `app.mount('#app');`,
    `app.mount('#app');\ndocument.title = t('app.title'); // 标题随语言切换（setLocale 内也会更新）`
  );
  fs.writeFileSync(ROOT + 'src/main.js', m);
  console.log('main.js title hook added');
}
