// 宣传页构建时增强脚本：注入随机精灵展示与属性 chip（含对比度自适应）。
// Vite 会把这个模块打包进宣传页入口，页面上不留运行时依赖。

import { petSvg } from '../src/core/sprites.js';
import { generatePet } from '../src/core/generator.js';
import { TYPES, TYPE_COLORS } from '../src/data/types.js';

// ---- 相对亮度 → chip 文字颜色自适应（WCAG 对比度保障）----
function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chipHtml(type, cls = '') {
  const bg = TYPE_COLORS[type] ?? '#9fa19f';
  const darkText = luminance(bg) > 0.55; // 浅色背景配深色文字
  return `<span class="chip ${darkText ? 'dark-text' : ''}" style="background:${bg}">${type}</span>`;
}

// ---- 精灵展示带：固定种子采样（同一次构建永远同图，缓存友好）----
function renderPets() {
  const band = document.getElementById('pets-band');
  if (!band) return;
  // 挑 5 个确定 seed，尽量覆盖不同稀有度/属性
  const seeds = [20260907, 114523, 777001, 3061204, 51234];
  const mapIds = ['meadow', 'shore', 'cave', 'volcano', 'peak'];
  band.innerHTML = seeds.map((seed, i) => {
    const pet = generatePet(seed, mapIds[i]);
    const chips = pet.types.map(t => chipHtml(t)).join('');
    return `<div class="pet-card">
      <div class="sprite">${petSvg(pet, 84)}</div>
      <div class="nm">${pet.name}</div>
      <div class="chips">${chips}</div>
    </div>`;
  }).join('');
}

// ---- 属性云 ----
function renderTypes() {
  const cloud = document.getElementById('type-cloud');
  if (!cloud) return;
  cloud.innerHTML = TYPES.map(t => chipHtml(t)).join('');
}

renderPets();
renderTypes();
