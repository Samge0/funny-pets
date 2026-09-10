// 关键修复：locale 响应式重渲染。模板里 mapName(x)/typeLabel(x) 这类普通函数调用
// 不是响应式依赖（它们内部读 locale.value，但 Vue 模板只追踪**渲染期间访问**的 ref——
// 函数内部访问的 ref 同样会被追踪……除非组件没有重新渲染的入口）。
// 实际根因排查：typeLabel 是 (tp)=>typeNameOf(tp)，typeNameOf=mapFrom(...) 返回的
// 闭包函数内部读 locale.value —— 理论上会被追踪。但 t() 在 I1a 生效而 mapName 没生效，
// 说明 App.vue 顶部 import 的 mapName 与模板用的是同一引用……
// 真正稳妥的修法：给这些映射函数包一层显式依赖 locale 的 wrapper（读一次 locale.value）。
const fs = require('fs');
const ROOT = 'F:/Space/PRO/test/funny-pets/';
let s = fs.readFileSync(ROOT + 'src/App.vue', 'utf8');
let n = 0;
const rep = (from, to) => { if (s.includes(from)) { s = s.split(from).join(to); n++; } else console.log('MISS:', from.slice(0, 70)); };

// helper 区：wrapper 显式依赖 locale（模板每次渲染都先读 locale.value → 成为响应式依赖）
rep(
  `const typeLabel = (tp) => typeNameOf(tp); // 属性显示名（TYPE_COLORS 仍按 zh 规范 key 索引）`,
  `// 显示名 wrapper：先读 locale.value（建立响应式依赖，切语言触发重渲染）再映射
const typeLabel = (tp) => { void locale.value; return typeNameOf(tp); };`
);
rep(
  `const moveLabel = (m) => moveName(m); // 技能显示名`,
  `const moveLabel = (m) => { void locale.value; return moveName(m); };`
);
// 模板里直接调用的 mapName / rarityName / t：t 内部读了 locale.value 已是依赖；
// mapName/rarityName 也包 wrapper
rep(
  `import { LANGUAGES, t, setLocale, typeName as typeNameOf, mapName, rarityName, moveName, locale } from './core/i18n.js';`,
  `import { LANGUAGES, t, setLocale, typeName as typeNameOf, mapName as mapNameOf, rarityName as rarityNameOf, moveName, locale } from './core/i18n.js';`
);
s = s.split('{{ mapName(map.name) }}').join('{{ mapLabel(map.name) }}');
n++;
s = s.split('rarityName(sharedPet.rarity)').join('rarityLabel(sharedPet.rarity)');
s = s.split('rarityName(giftPet.rarity)').join('rarityLabel(giftPet.rarity)');
s = s.split('rarityName(wild.rarity)').join('rarityLabel(wild.rarity)');
s = s.split('rarityName(pet.rarity)').join('rarityLabel(pet.rarity)');
n += 2;
rep(
  `const moveLabel = (m) => { void locale.value; return moveName(m); };`,
  `const moveLabel = (m) => { void locale.value; return moveName(m); };
const mapLabel = (m) => { void locale.value; return mapNameOf(m); };
const rarityLabel = (r) => { void locale.value; return rarityNameOf(r); };`
);
fs.writeFileSync(ROOT + 'src/App.vue', s);
console.log(`App.vue reactive wrappers: ${n} ops`);
