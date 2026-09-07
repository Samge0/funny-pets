// 6 张地图：每张有属性偏好（该系权重更高）+ 稀有度权重修饰 + 主题配色。

export const MAPS = [
  {
    id: 'meadow',
    name: '微风草原',
    desc: '起伏的青草丘，新手训练家的第一站。',
    favorTypes: ['一般', '草', '虫'],
    rarityBonus: { common: 1.2, uncommon: 1.0, rare: 0.9, epic: 0.8, legend: 0.5 },
    sky: ['#a8d8a8', '#e8f4d0'],
    ground: '#7ab86a',
    unlockAt: 0,
  },
  {
    id: 'shore',
    name: '月光浅滩',
    desc: '潮声轻柔的海岸，夜里精灵们会来喝水。',
    favorTypes: ['水', '冰', '飞行'],
    rarityBonus: { common: 1.0, uncommon: 1.1, rare: 1.1, epic: 0.9, legend: 0.7 },
    sky: ['#8fb8d8', '#d0e8f4'],
    ground: '#5a8ab8',
    unlockAt: 3,
  },
  {
    id: 'cave',
    name: '回声洞窟',
    desc: '深处传来叮咚的回声，墙壁上嵌着发光的晶石。',
    favorTypes: ['岩石', '地面', '钢'],
    rarityBonus: { common: 0.9, uncommon: 1.1, rare: 1.2, epic: 1.1, legend: 0.8 },
    sky: ['#6a6a7a', '#a8a8b8'],
    ground: '#5a5a6a',
    unlockAt: 8,
  },
  {
    id: 'volcano',
    name: '烬尾火山',
    desc: '山脚有温泉，山顶的火山口终年冒着热气。',
    favorTypes: ['火', '地面', '格斗'],
    rarityBonus: { common: 0.8, uncommon: 1.1, rare: 1.3, epic: 1.2, legend: 1.0 },
    sky: ['#d88f6a', '#f4d0b0'],
    ground: '#a85a3a',
    unlockAt: 14,
  },
  {
    id: 'forest',
    name: '雾语秘林',
    desc: '雾气终年不散，古树的枝干间藏着说不清的目光。',
    favorTypes: ['幽灵', '恶', '毒', '超能力'],
    rarityBonus: { common: 0.7, uncommon: 1.0, rare: 1.3, epic: 1.4, legend: 1.3 },
    sky: ['#7a8a9a', '#b8c8c0'],
    ground: '#4a6a5a',
    unlockAt: 20,
  },
  {
    id: 'peak',
    name: '天穹之巅',
    desc: '云海之上的孤峰，据说最接近星空的地方。',
    favorTypes: ['龙', '飞行', '电', '妖精', '超能力'],
    rarityBonus: { common: 0.5, uncommon: 0.8, rare: 1.4, epic: 1.6, legend: 2.0 },
    sky: ['#9a8fd8', '#e0d8f4'],
    ground: '#b8b0d8',
    unlockAt: 30,
  },
];

// 稀有度基础权重（会乘以地图 rarityBonus）
export const BASE_RARITY_WEIGHT = {
  common: 60, uncommon: 25, rare: 11, epic: 3.5, legend: 0.5,
};
