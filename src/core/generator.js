// 本地精灵生成器：全原创，纯随机组合。
// LLM 路径（llm.js）产出的字段与本模块同构，二者可互换。
// i18n：名池与图鉴模板按当前语言选择（en/ja 有专属池；其他语言用 en 池）。
// 已捕捉精灵的名字保留生成时的语言（名字=精灵身份，不随界面语言重写）。

import { TYPES, TYPE_COLORS } from '../data/types.js';
import { MAPS, BASE_RARITY_WEIGHT } from '../data/maps.js';
import { MOVES } from '../data/moves.js';
import { NAME_PREFIX, NAME_ROOT, NAME_SUFFIX, LORE_TEMPLATES, fillTemplate, NATURES, RARITIES } from '../data/names.js';
import { BODY_SHAPES, EARS, TAILS, PATTERNS, PALETTES, ACCESSORIES, EYE_STYLES } from '../data/traits.js';
import { mulberry32, pick, pickWeighted, randInt } from './rng.js';
import { locale } from './i18n.js';

export const RARITY_MULT = { common: 1, uncommon: 1.06, rare: 1.13, epic: 1.2, legend: 1.3 };

// ---- 英文名池（原创组合音节，风格：可爱兽名）----
const EN_PREFIX = ['Bo', 'Mo', 'Flu', 'Pip', 'Wig', 'Sni', 'Clo', 'Dra', 'Puf', 'Ta', 'Ni', 'Ru', 'Bri', 'Ju', 'Ki', 'Lu', 'Fu', 'Gra', 'Me', 'Po'];
const EN_ROOT = ['bble', 'zzle', 'mp', 'per', 'ggles', 'ffin', 'nder', 'bbit', 'cky', 'lla', 'ppet', 'zzy', 'nker', 'mble', 'choo', 'dget'];
const EN_SUFFIX = ['', '', '', '', '', 'y', 'ie', 'o', 'a', 's'];

// ---- 日文名池（假名组合，原创拟声词风格）----
const JA_PREFIX = ['ポ', 'モ', 'フ', 'ピ', 'ワ', 'ニ', 'コ', 'タ', 'ル', 'ム', 'ブ', 'キ', 'チ', 'サ', 'ユ', 'ハ'];
const JA_ROOT = ['コミ', 'ラリ', 'ンチ', 'ポポ', 'ムク', 'ルル', 'ブブ', 'キキ', 'ツネ', 'メリ', 'ナノ', 'ソラ'];
const JA_SUFFIX = ['', '', '', '', 'ん', 'ちゃん', 'たん', '丸', '助'];

// ---- 英文图鉴模板（占位符与 zh 模板同构）----
const EN_LORE = [
  'Loves napping in the {place}. It {habit} with a tiny purring sound.',
  'Said to have been born from {origin}. Its favorite treat is {food}.',
  '{personality} by nature — when startled, it curls up and rolls away.',
  'Often wanders near the {place}, hoarding {collect} in its nest.',
  'Legend says a pat on its {part} will {luck}. Very popular because of it.',
];
const EN_WORDS = {
  place: ['streamside grass', 'a hollow tree', 'moonlit thickets', 'warm springs', 'under the windmill', 'a mushroom ring', 'shaded rocks', 'old rooftops'],
  habit: ['when happy', 'when shy', 'while foraging', 'before rain', 'when chin-scratched'],
  origin: ['a glowing dewdrop', 'the smell of an old blanket', "summer's first cicada song", 'a cloud that refused to fall', 'embers of a campfire'],
  food: ['sweet berries', 'roasted chestnuts', 'morning nectar', 'chilled melon rind', 'toasted marshmallow'],
  personality: ['Slow and dreamy', 'Bursting with energy', 'Proud but timid', 'Endlessly curious', 'Cold outside, clingy inside'],
  collect: ['shiny pebbles', 'oddly-shaped leaves', 'dropped feathers', 'bottle caps', 'tasty fruit pits'],
  part: ['belly', 'ear-tips', 'tail', 'shell', 'head tuft'],
  luck: ['find lost socks', 'catch a full bucket of fish', 'sleep in naturally', 'stay dry in rain', 'ace an exam'],
};

// ---- 日文图鉴模板 ----
const JA_LORE = [
  '{place}で昼寝するのが大好き。{habit}とき、小さないびきをかく。',
  '{origin}から生まれたと言われる。大好物は{food}。',
  '性格は{personality}。危なくなると丸まって転がって逃げる。',
  '{place}の近くをうろつき、{collect}を巣に集めている。',
  '{part}をなでると{luck}という言い伝えがあり、人気者。',
];
const JA_WORDS = {
  place: ['小川のほとり', '木のうろ', '月光の草むら', '温泉のそば', '風車の下', 'キノコの輪', '岩かげ', '屋根の上'],
  habit: ['嬉しい', 'はずかしい', 'えさを探す', '雨が来る前', 'あごをかかれると'],
  origin: ['光る露の一粒', '古い毛布のにおい', '夏の初セミの声', '落ちなかった雲', 'たき火のぬくもり'],
  food: ['あまいベリー', '焼きいも', '朝の花蜜', '冷えたスイカの皮', '焼きマシュマロ'],
  personality: ['のんびり屋', '元気すぎる', '見栄っ張りで臆病', '好奇心のかたまり', 'クールな顔の甘えん坊'],
  collect: ['ぴかぴかの小石', '形の変わった落ち葉', 'だれかの羽根', 'ふたのないびん', 'おいしい種'],
  part: ['おなか', 'みみのさき', 'しっぽ', 'こうら', 'あたまのぼうし'],
  luck: ['なくした靴下が見つかる', '魚がいっぱい釣れる', '朝までぐっすり', '雨にぬれない', '試験でいい点'],
};

// 按当前语言选名池（其他语言用英文池）
function namePools() {
  const loc = locale.value;
  if (loc === 'ja') return { pre: JA_PREFIX, root: JA_ROOT, suf: JA_SUFFIX };
  if (loc === 'zh' || loc === 'zh-TW') return { pre: NAME_PREFIX, root: NAME_ROOT, suf: NAME_SUFFIX };
  return { pre: EN_PREFIX, root: EN_ROOT, suf: EN_SUFFIX };
}
function lorePools() {
  const loc = locale.value;
  if (loc === 'ja') return { tpl: JA_LORE, words: JA_WORDS };
  if (loc === 'zh' || loc === 'zh-TW') return { tpl: LORE_TEMPLATES, words: null }; // zh 用 data/names.js 的 LORE_WORDS
  return { tpl: EN_LORE, words: EN_WORDS };
}

function fillLore(template, rng) {
  const { words } = lorePools();
  if (!words) return fillTemplate(template, rng); // zh 走原 data 表
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const pool = words[key];
    return pool ? pool[Math.floor(rng() * pool.length)] : '';
  });
}

export function rollRarity(rng, rarityBonus) {
  const entries = RARITIES.map(r => ({
    value: r.key,
    weight: BASE_RARITY_WEIGHT[r.key] * (rarityBonus?.[r.key] ?? 1),
  }));
  return pickWeighted(rng, entries);
}

export function generatePet(seed, mapId) {
  const map = MAPS.find(m => m.id === mapId) ?? MAPS[0];
  const rng = mulberry32(seed);

  // 属性：40% 概率从地图偏好池取主属性，否则全池随机；30% 概率带副属性
  const primaryType = rng() < 0.4 ? pick(rng, map.favorTypes) : pick(rng, TYPES);
  const secondaryType = rng() < 0.3 ? pick(rng, TYPES.filter(t => t !== primaryType)) : null;
  const types = secondaryType ? [primaryType, secondaryType] : [primaryType];

  const rarity = rollRarity(rng, map.rarityBonus);
  const rarityIdx = RARITIES.findIndex(r => r.key === rarity);

  // 名字：按当前语言的名池组合（前缀 + 词根 + 偶尔带后缀）
  const np = namePools();
  const name = pick(rng, np.pre) + pick(rng, np.root) + pick(rng, np.suf);

  // 个体值（0-15）与基础种族值（受稀有度加成）
  const iv = { hp: randInt(rng, 0, 15), atk: randInt(rng, 0, 15), def: randInt(rng, 0, 15), spd: randInt(rng, 0, 15) };
  const rm = RARITY_MULT[rarity];
  const base = {
    hp: Math.round(randInt(rng, 45, 75) * rm),
    atk: Math.round(randInt(rng, 40, 70) * rm),
    def: Math.round(randInt(rng, 40, 70) * rm),
    spd: Math.round(randInt(rng, 40, 70) * rm),
  };
  const nature = pick(rng, NATURES);

  // 技能：从主/副属性池各抽，保证至少一个攻击技能
  const pool = [...MOVES[primaryType], ...(secondaryType ? MOVES[secondaryType] : []), ...MOVES['一般']];
  const moves = [];
  while (moves.length < 3) {
    const m = pick(rng, pool);
    if (!moves.find(x => x.name === m.name)) moves.push(m);
  }
  if (!moves.some(m => m.power)) moves[0] = pick(rng, pool.filter(m => m.power));

  // 造型
  const look = {
    body: pick(rng, BODY_SHAPES).key,
    ears: pick(rng, EARS).key,
    tail: pick(rng, TAILS).key,
    pattern: pick(rng, PATTERNS).key,
    palette: randInt(rng, 0, PALETTES.length - 1),
    accessory: pick(rng, ACCESSORIES).key,
    eyes: pick(rng, EYE_STYLES).key,
  };

  // 图鉴描述（本地模板按语言；LLM 成功时会覆盖）
  const lp = lorePools();
  const lore = fillLore(pick(rng, lp.tpl), rng);

  const caughtAt = mapId;
  return {
    seed, name, types, rarity, iv, base, nature, moves, look, lore,
    caughtAt, caughtMap: mapId,
  };
}

export function petTypeColor(pet) {
  return TYPE_COLORS[pet.types[0]] ?? '#9fa19f';
}
