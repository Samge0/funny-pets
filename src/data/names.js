// 名字库：前缀 + 词根 + 后缀 组合出原创精灵名，纯本地生成用。
// 全部为原创虚构词，不来自任何现有作品。

export const NAME_PREFIX = [
  '波', '奇', '毛', '嘟', '咕', '蹦', '闪', '雾', '岩', '叶',
  '焰', '冰', '雷', '影', '光', '云', '沙', '露', '羽', '壳',
  '刺', '绒', '泡', '藤', '晶', '风', '苔', '菇', '鳍', '角',
];

export const NAME_ROOT = [
  '波', '球', '团', '灵', '兽', '崽', '妮', '诺', '拉', '姆',
  '丘', '比', '托', '可', '鲁', '米', '达', '隆', '妮', '娜',
];

export const NAME_SUFFIX = [
  '', '', '', '', '', // 大多数不带后缀，保持短名
  '仔', '宝', '酱', '君', '狸', '雀', '蜥', '獭', '鸥', '萤',
];

// LLM 生成失败时的兜底图鉴描述模板
export const LORE_TEMPLATES = [
  '喜欢在{place}打盹，{habit}时会发出细小的呼噜声。',
  '据说是由{origin}诞生的精灵，最喜欢{food}。',
  '性格{personality}，遇到危险时会把身体蜷成一团滚走。',
  '常常在{place}附近徘徊，收集{collect}藏进自己的窝。',
  '传说摸一摸它的{part}就能{luck}，因此很受欢迎。',
];

export const LORE_WORDS = {
  place: ['溪边', '树洞里', '月光下的草丛', '温泉旁', '风车下', '蘑菇圈中', '岩石背阴处', '屋檐上'],
  habit: ['开心', '害羞', '觅食', '下雨前', '被挠下巴'],
  origin: ['一颗会发光的露珠', '旧毛毯的味道', '夏天的第一声蝉鸣', '一朵不肯落的云', '篝火的余温'],
  food: ['甜甜的浆果', '烤红薯', '清晨的花蜜', '冰镇西瓜皮', '烤棉花糖'],
  personality: ['慢吞吞的', '精力过剩的', '爱面子但胆小的', '好奇心旺盛的', '表面高冷实则粘人的'],
  collect: ['亮晶晶的小石子', '各种形状的落叶', '别人掉的羽毛', '废弃的瓶盖', '好吃果核'],
  part: ['肚皮', '耳朵尖', '尾巴', '背壳', '头顶的呆毛'],
  luck: ['找回丢失的袜子', '钓到一整桶鱼', '一觉睡到自然醒', '在雨里不淋湿', '考试超常发挥'],
};

export function fillTemplate(template, rng) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const pool = LORE_WORDS[key];
    return pool ? pool[Math.floor(rng() * pool.length)] : '';
  });
}

// 性格（影响战斗小加成，纯娱乐）
export const NATURES = [
  { name: '悠闲', hp: 1.05, atk: 1.0, def: 1.0, spd: 1.0 },
  { name: '好斗', hp: 1.0, atk: 1.08, def: 0.98, spd: 1.0 },
  { name: '结实', hp: 1.0, atk: 0.98, def: 1.08, spd: 1.0 },
  { name: '轻快', hp: 1.0, atk: 1.0, def: 1.0, spd: 1.08 },
  { name: '沉着', hp: 1.03, atk: 0.98, def: 1.03, spd: 1.0 },
];

// 稀有度
export const RARITIES = [
  { key: 'common', name: '常见', color: '#8a90a0', weight: 60 },
  { key: 'uncommon', name: '少见', color: '#4caf50', weight: 25 },
  { key: 'rare', name: '稀有', color: '#2f80d6', weight: 11 },
  { key: 'epic', name: '史诗', color: '#9c4ab8', weight: 3.5 },
  { key: 'legend', name: '传说', color: '#e8a13c', weight: 0.5 },
];
