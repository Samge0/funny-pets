// 程序化 SVG 精灵渲染：seed/look 相同 => 输出永远相同。
// 纯矢量拼装，零图片资产。

import { mulberry32 } from './rng.js';
import { BODY_SHAPES, EARS, TAILS, PALETTES } from '../data/traits.js';

function find(list, key, dflt) {
  return list.find(x => x.key === key) ?? list.find(x => x.key === dflt) ?? list[0];
}

export function petSvg(pet, size = 96) {
  const rng = mulberry32(pet.seed >>> 0);
  const pal = PALETTES[pet.look.palette % PALETTES.length];
  const body = find(BODY_SHAPES, pet.look.body, 'round');
  const ears = find(EARS, pet.look.ears, 'none');
  const tail = find(TAILS, pet.look.tail, 'none');
  const phase = pet.phase ?? 0;

  // 相位进阶：体型放大 + 光环
  const scale = 1 + phase * 0.08;
  const aura = phase > 0 ? `<ellipse cx="50" cy="52" rx="${40 + phase * 4}" ry="${38 + phase * 4}" fill="${pal.accent}" opacity="0.12"/>` : '';

  const patternSvg = {
    none: '',
    spots: `<circle cx="38" cy="52" r="4" fill="${pal.accent}" opacity="0.5"/><circle cx="58" cy="60" r="3.4" fill="${pal.accent}" opacity="0.5"/><circle cx="50" cy="42" r="3" fill="${pal.accent}" opacity="0.5"/>`,
    stripe: `<path d="M 34 44 L 34 62 M 44 40 L 44 66 M 54 40 L 54 66 M 64 44 L 64 60" stroke="${pal.accent}" stroke-width="4" opacity="0.45" stroke-linecap="round"/>`,
    belly: `<ellipse cx="50" cy="60" rx="16" ry="13" fill="${pal.belly}"/>`,
  }[pet.look.pattern] ?? '';

  const eyesSvg = {
    dot: `<circle cx="40" cy="42" r="3.2" fill="#2a2a3a"/><circle cx="60" cy="42" r="3.2" fill="#2a2a3a"/>`,
    round: `<circle cx="40" cy="42" r="5" fill="#fff"/><circle cx="41.5" cy="42.5" r="2.6" fill="#2a2a3a"/><circle cx="60" cy="42" r="5" fill="#fff"/><circle cx="61.5" cy="42.5" r="2.6" fill="#2a2a3a"/>`,
    sleepy: `<path d="M 35 43 Q 40 47 45 43 M 55 43 Q 60 47 65 43" stroke="#2a2a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sparkle: `<path d="M 40 37 L 41.6 41 L 45.6 42 L 41.6 43 L 40 47 L 38.4 43 L 34.4 42 L 38.4 41 Z" fill="#2a2a3a"/><path d="M 60 37 L 61.6 41 L 65.6 42 L 61.6 43 L 60 47 L 58.4 43 L 54.4 42 L 58.4 41 Z" fill="#2a2a3a"/>`,
  }[pet.look.eyes] ?? '';

  const accSvg = {
    none: '',
    flower: `<circle cx="50" cy="12" r="3.4" fill="#f4d03c"/><circle cx="46" cy="10" r="2.6" fill="#e87a9a"/><circle cx="54" cy="10" r="2.6" fill="#e87a9a"/><circle cx="50" cy="7" r="2.6" fill="#e87a9a"/><circle cx="50" cy="14" r="2.6" fill="#e87a9a"/>`,
    leaf: `<path d="M 50 18 C 50 10 56 6 60 8 C 60 14 56 18 50 18 Z" fill="#5a9830"/>`,
    horn: `<path d="M 50 20 L 46 8 L 54 8 Z" fill="${pal.accent}"/>`,
    gem: `<polygon points="50,6 54,11 50,16 46,11" fill="#7fd4e8" stroke="#3878b8" stroke-width="1"/>`,
  }[pet.look.accessory] ?? '';

  // 嘴：随机弧度
  const mouthY = 52 + Math.floor(rng() * 4);
  const mouth = `<path d="M 46 ${mouthY} Q 50 ${mouthY + 3.5} 54 ${mouthY}" stroke="#2a2a3a" stroke-width="2" fill="none" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(pet.name)}">
  ${aura}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    ${ears.key !== 'none' && ears.path ? `<path d="${ears.path}" fill="${pal.body}" stroke="${pal.accent}" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
    ${tail.key !== 'none' && tail.path ? `<path d="${tail.path}" fill="${pal.accent}" stroke="${pal.accent}" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
    <path d="${body.path}" fill="${pal.body}" stroke="${pal.accent}" stroke-width="2"/>
    ${patternSvg}
    ${eyesSvg}
    ${mouth}
    ${accSvg}
  </g>
</svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
