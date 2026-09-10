const fs = require('fs');
const p = 'F:/Space/PRO/test/funny-pets/src/App.vue';
let s = fs.readFileSync(p, 'utf8');
const before = s;

s = s.replace(
  "const typeChipStyle = (t) => ({ background: TYPE_COLORS[t] ?? '#9fa19f' });",
  "const typeChipStyle = (tp) => ({ background: TYPE_COLORS[tp] ?? '#9fa19f' });\nconst typeLabel = (tp) => typeNameOf(tp); // 属性显示名（TYPE_COLORS 仍按 zh 规范 key 索引）"
);

const re = /<i v-for="t in ([^"]+)" :key="t" class="chip" :style="typeChipStyle\(t\)">\{\{ t \}\}<\/i>/g;
let cnt = 0;
s = s.replace(re, (m, expr) => { cnt++; return `<i v-for="tp in ${expr}" :key="tp" class="chip" :style="typeChipStyle(tp)">{{ typeLabel(tp) }}</i>`; });

fs.writeFileSync(p, s);
console.log('typeChipStyle renamed:', before !== s, '| loops rewritten:', cnt, '| changed:', before.length - s.length, 'chars');
