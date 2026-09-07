// 特征库：程序化 SVG 造型的素材维度。
// 每个维度是一个可选值池，随机组合 + 配色 => 造型空间 > 10^7。

export const BODY_SHAPES = [
  { key: 'round', name: '圆滚滚', path: 'M 50 78 C 20 78 14 52 22 36 C 30 20 70 20 78 36 C 86 52 80 78 50 78 Z' },
  { key: 'pear', name: '梨形', path: 'M 50 80 C 30 80 22 62 26 44 C 30 28 42 22 50 22 C 58 22 70 28 74 44 C 78 62 70 80 50 80 Z' },
  { key: 'tall', name: '瘦长', path: 'M 50 82 C 36 82 30 70 30 54 C 30 34 38 18 50 18 C 62 18 70 34 70 54 C 70 70 64 82 50 82 Z' },
  { key: 'blob', name: '软团', path: 'M 50 78 C 24 78 16 60 20 44 C 24 30 36 24 50 24 C 64 24 76 30 80 44 C 84 60 76 78 50 78 Z' },
  { key: 'drop', name: '水滴', path: 'M 50 82 C 34 82 26 68 28 52 C 30 36 40 16 50 16 C 60 16 70 36 72 52 C 74 68 66 82 50 82 Z' },
];

export const EARS = [
  { key: 'none', name: '无耳' },
  { key: 'round', name: '圆耳', path: 'M 26 30 C 18 18 22 8 30 12 C 36 15 38 24 36 32 M 74 30 C 82 18 78 8 70 12 C 64 15 62 24 64 32' },
  { key: 'pointy', name: '尖耳', path: 'M 28 32 L 20 8 L 40 24 M 72 32 L 80 8 L 60 24' },
  { key: 'long', name: '长耳', path: 'M 32 30 C 24 16 22 4 28 4 C 34 4 38 18 38 30 M 68 30 C 76 16 78 4 72 4 C 66 4 62 18 62 30' },
  { key: 'fin', name: '鱼鳍耳', path: 'M 26 34 C 14 28 10 16 18 14 C 26 12 34 22 34 32 M 74 34 C 86 28 90 16 82 14 C 74 12 66 22 66 32' },
];

export const TAILS = [
  { key: 'none', name: '无尾' },
  { key: 'stub', name: '短尾', path: 'M 76 66 C 86 64 90 58 88 54 C 86 50 80 52 78 58' },
  { key: 'curl', name: '卷尾', path: 'M 76 68 C 90 66 94 54 86 50 C 80 47 76 52 80 56' },
  { key: 'fluff', name: '绒尾', path: 'M 76 66 C 84 60 94 60 96 66 C 94 72 84 72 76 68 Z' },
  { key: 'spark', name: '电尾', path: 'M 76 66 L 88 60 L 84 66 L 94 64 L 82 72' },
];

export const PATTERNS = [
  { key: 'none', name: '纯色' },
  { key: 'spots', name: '斑点' },
  { key: 'stripe', name: '条纹' },
  { key: 'belly', name: '肚皮' },
];

// 身体主色池（饱和度友好，非任何角色的专属配色）
export const PALETTES = [
  { body: '#f4a83c', belly: '#fce8c0', accent: '#d87a20' },
  { body: '#5ab8d8', belly: '#d8f0f8', accent: '#3088a8' },
  { body: '#8fce5a', belly: '#e8f8d0', accent: '#5a9830' },
  { body: '#e87a9a', belly: '#fbe0e8', accent: '#c04a70' },
  { body: '#a88fe0', belly: '#e8e0f8', accent: '#7860b0' },
  { body: '#f4d03c', belly: '#fcf4c8', accent: '#d0a818' },
  { body: '#e8683c', belly: '#fcd8c8', accent: '#b84018' },
  { body: '#6aa8e8', belly: '#d8e8fc', accent: '#3878b8' },
  { body: '#90a8b8', belly: '#e0e8ec', accent: '#607890' },
  { body: '#c8e868', belly: '#f4fcd8', accent: '#98b838' },
];

export const ACCESSORIES = [
  { key: 'none', name: '无装饰' },
  { key: 'flower', name: '头顶小花' },
  { key: 'leaf', name: '叶芽' },
  { key: 'horn', name: '小角' },
  { key: 'gem', name: '额晶' },
];

export const EYE_STYLES = [
  { key: 'dot', name: '豆豆眼' },
  { key: 'round', name: '圆眼' },
  { key: 'sleepy', name: '眯眯眼' },
  { key: 'sparkle', name: '星星眼' },
];
