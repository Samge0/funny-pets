// 技能库：按属性划分的招式池。全部原创命名。
// power: null 表示变化类技能（提供 buff/回复效果）。

export const MOVES = {
  '一般': [
    { name: '扑击', power: 40 }, { name: '猛撞', power: 55 },
    { name: '瞪眼', power: null, effect: 'defdown' }, { name: '深呼吸', power: null, effect: 'heal' },
  ],
  '火': [
    { name: '火星弹', power: 45 }, { name: '烈焰冲撞', power: 70 },
    { name: '灼热咆哮', power: null, effect: 'atkdown' },
  ],
  '水': [
    { name: '水泡射击', power: 45 }, { name: '浪涌', power: 70 },
    { name: '水流护体', power: null, effect: 'defup' },
  ],
  '电': [
    { name: '电火花', power: 45 }, { name: '十万奔腾', power: 70 },
    { name: '麻痹闪光', power: null, effect: 'spddown' },
  ],
  '草': [
    { name: '藤鞭', power: 45 }, { name: '光合炮', power: 70 },
    { name: '寄生种子', power: null, effect: 'heal' },
  ],
  '冰': [
    { name: '霜冻吐息', power: 45 }, { name: '极寒冰锥', power: 70 },
    { name: '冰晶护盾', power: null, effect: 'defup' },
  ],
  '格斗': [
    { name: '连环踢', power: 50 }, { name: '爆裂拳', power: 75 },
    { name: '蓄力', power: null, effect: 'atkup' },
  ],
  '毒': [
    { name: '毒针', power: 40 }, { name: '污泥炸弹', power: 65 },
    { name: '毒雾', power: null, effect: 'defdown' },
  ],
  '地面': [
    { name: '泼沙', power: 40 }, { name: '大地裂击', power: 75 },
    { name: '钻地', power: null, effect: 'defup' },
  ],
  '飞行': [
    { name: '疾风斩', power: 45 }, { name: '俯冲撞击', power: 70 },
    { name: '拔羽', power: null, effect: 'atkup' },
  ],
  '超能力': [
    { name: '念力波', power: 50 }, { name: '精神冲击', power: 70 },
    { name: '冥想', power: null, effect: 'atkup' },
  ],
  '虫': [
    { name: '虫咬', power: 45 }, { name: '蜇刺连击', power: 65 },
    { name: '吐丝', power: null, effect: 'spddown' },
  ],
  '岩石': [
    { name: '滚石', power: 45 }, { name: '岩崩', power: 75 },
    { name: '硬化', power: null, effect: 'defup' },
  ],
  '幽灵': [
    { name: '舌头舔', power: 40 }, { name: '暗影球', power: 70 },
    { name: '怨念', power: null, effect: 'defdown' },
  ],
  '龙': [
    { name: '龙息', power: 55 }, { name: '流星群击', power: 80 },
    { name: '龙之舞', power: null, effect: 'atkup' },
  ],
  '恶': [
    { name: '偷袭', power: 50 }, { name: '暗黑爆碎', power: 70 },
    { name: '虚张声势', power: null, effect: 'atkup' },
  ],
  '钢': [
    { name: '金属爪', power: 50 }, { name: '铁头功', power: 70 },
    { name: '身体硬化', power: null, effect: 'defup' },
  ],
  '妖精': [
    { name: '星光闪', power: 45 }, { name: '魔法闪耀', power: 70 },
    { name: '撒娇', power: null, effect: 'atkdown' },
  ],
};
