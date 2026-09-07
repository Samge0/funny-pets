// 宣传页构建时增强脚本：注入 18 属性 chip 云（含对比度自适应）。
// 精灵展示带已改为静态 3D 快照 PNG（scripts/render-promo-pets.mjs 生成），不再动态注入。

import { TYPES, TYPE_COLORS } from '../src/data/types.js';

// ---- 相对亮度 → chip 文字颜色自适应（WCAG 对比度保障）----
function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chipHtml(type) {
  const bg = TYPE_COLORS[type] ?? '#9fa19f';
  const darkText = luminance(bg) > 0.55; // 浅色背景配深色文字
  return `<span class="chip ${darkText ? 'dark-text' : ''}" style="background:${bg}">${type}</span>`;
}

// ---- 属性云 ----
function renderTypes() {
  const cloud = document.getElementById('type-cloud');
  if (!cloud) return;
  cloud.innerHTML = TYPES.map(t => chipHtml(t)).join('');
}

renderTypes();
