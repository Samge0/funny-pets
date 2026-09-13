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
  { key: 'round', name: '圆耳' },
  { key: 'pointy', name: '尖耳' },
  { key: 'long', name: '长耳' },
  { key: 'fin', name: '鱼鳍耳' },
  { key: 'fluffy', name: '绒绒耳' },   // v11 萌宠包：圆胖三角毛耳（耳尖一撮奶毛）
  { key: 'droopy', name: '折垂耳' },   // v11：软塌下垂小狗耳
  { key: 'stub', name: '小圆短耳' },   // v11：小豆耳（幼态感）
];

export const TAILS = [
  { key: 'none', name: '无尾' },
  { key: 'stub', name: '短尾' },
  { key: 'curl', name: '卷尾' },
  { key: 'fluff', name: '绒尾' },
  { key: 'spark', name: '电尾' },
];

export const PATTERNS = [
  { key: 'none', name: '纯色' },
  { key: 'spots', name: '斑点' },
  { key: 'stripe', name: '条纹' },
  { key: 'belly', name: '肚皮' },
];

// 身体主色池（饱和度友好，非任何角色的专属配色）
// v11 萌宠包追加 6 色：马卡龙粉彩系（低饱和高明度，孩子/女生审美）
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
  // ---- v11 马卡龙新色（10~15）----
  { body: '#ffd6e0', belly: '#fff0f4', accent: '#e88aa8' },  // 10 樱花粉
  { body: '#c3e8ff', belly: '#eef8ff', accent: '#7ab8e0' },  // 11 婴儿蓝
  { body: '#d8ffd0', belly: '#f2fff0', accent: '#88c878' },  // 12 抹茶绿
  { body: '#ffe8c8', belly: '#fff6e8', accent: '#e0b070' },  // 13 奶油杏
  { body: '#e8d8ff', belly: '#f8f2ff', accent: '#b098e0' },  // 14 香芋紫
  { body: '#fff0c8', belly: '#fffaf0', accent: '#e8c870' },  // 15 奶黄
];

export const ACCESSORIES = [
  { key: 'none', name: '无装饰' },
  { key: 'flower', name: '头顶小花' },
  { key: 'leaf', name: '叶芽' },
  { key: 'horn', name: '小角' },
  { key: 'gem', name: '额晶' },
  { key: 'bow', name: '蝴蝶结' },      // v11：头侧蝴蝶结（萌系标配）
  { key: 'bell', name: '铃铛' },       // v11：颈圈金铃铛
];

export const EYE_STYLES = [
  { key: 'dot', name: '豆豆眼' },
  { key: 'round', name: '圆眼' },
  { key: 'sleepy', name: '眯眯眼' },
  { key: 'sparkle', name: '星星眼' },
  { key: 'big', name: '葡葡大眼' },    // v11：超比例大圆眼（婴儿图式核心）
  { key: 'shy', name: '弯弯笑眼' },    // v11：两道向下弯弧（笑成月牙）
];
