// i18n 完整性审计：找出 App.vue + PetDetail.vue 中 t() 使用但词典未收录的 key。
// zh key 缺失=en/ja/zh-TW 下直接显示中文原文（i18n 债）。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = join(root, 'src');

// 1. 收集所有 t('...') 的 key（App.vue / PetDetail.vue / paint.js 不用 t）
function keysOf(file) {
  const text = readFileSync(join(src, file), 'utf8');
  const keys = new Set();
  // 单引号形式 t('xxx') —— 双引号/模板串本项目未用
  for (const m of text.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\s*[),]/g)) keys.add(m[1]);
  return keys;
}
const all = new Set([...keysOf('App.vue'), ...keysOf('components/PetDetail.vue')]);

// 2. 从 i18n.js 提取 EN 词典的 key 集合（粗提取：'...' 单引号键值对）
const i18n = readFileSync(join(src, 'core', 'i18n.js'), 'utf8');
const enStart = i18n.indexOf('const EN = {');
const enEnd = i18n.indexOf('\n};', enStart);
const enBlock = i18n.slice(enStart, enEnd);
const dictKeys = new Set();
for (const m of enBlock.matchAll(/'((?:[^'\\]|\\.)*)'\s*:/g)) dictKeys.add(m[1]);

// 3. 差集 = 缺失翻译的 key
const missing = [...all].filter(k => !dictKeys.has(k)).sort();
console.log(`total t() keys: ${all.length}, EN dict keys: ${dictKeys.size}, missing: ${missing.length}`);
for (const k of missing) console.log('MISS:', JSON.stringify(k));
if (missing.length) {
  console.log('I18N-GAP-CONFIRMED');
  process.exit(1);
}
console.log('i18n coverage OK');
