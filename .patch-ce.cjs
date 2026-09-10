
const fs = require('fs');
const p = 'F:/Space/PRO/test/funny-pets/src/components/Celebration.vue';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("import { t, rarityName as rarityLabelOf, typeName as typeNameOf } from '../core/i18n.js';",
  "import { t, rarityName as rarityLabelOf, typeName as typeNameOf, locale } from '../core/i18n.js';");
s = s.replace('const typeLabel = (tp) => typeNameOf(tp);',
  'const typeLabel = (tp) => { void locale.value; return typeNameOf(tp); };');
if (!s.includes('const rarityLabel =')) {
  s = s.replace('const typeLabel = (tp) => { void locale.value; return typeNameOf(tp); };',
    'const typeLabel = (tp) => { void locale.value; return typeNameOf(tp); };\nconst rarityLabel = (r) => { void locale.value; return rarityLabelOf(r); };');
}
s = s.replace('{{ rarityLabelOf(celebration.pet.rarity) }}', '{{ rarityLabel(celebration.pet.rarity) }}');
fs.writeFileSync(p, s);
console.log('celebration wrapped:', s.includes('void locale.value; return typeNameOf'), '| rarityLabel:', s.includes('const rarityLabel ='));
