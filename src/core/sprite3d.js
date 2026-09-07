// 3D 精灵构建器 v3：骨架化体态 + 卡通着色 + 轮廓描边。
// 核心改进：从"球堆"改为 6 种真正不同剪影的体态骨架（四足/双足/鸟禽/蛇形/水族/团子），
// 每种骨架有独立的关节结构与比例；MeshToonMaterial 三阶色阶 + OutlineEffect 描边。

import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { PALETTES } from '../data/traits.js';

const BODY_TYPES = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];

// 由 seed 决定体态（同类内再由其余维度变化）
export function bodyTypeOf(pet) {
  const rng = mulberry32((pet.seed ^ 0x9e3779b9) >>> 0);
  const idx = Math.floor(rng() * BODY_TYPES.length);
  return BODY_TYPES[idx];
}

// 属性 → 体态偏置：让水族多出现在水系、鸟禽多出现在飞行系等（40% 概率采纳）
export function bodyTypeBiased(pet) {
  const rng = mulberry32((pet.seed ^ 0x9e3779b9) >>> 0);
  const primary = pet.types[0];
  const bias = {
    '水': 'aquatic', '冰': 'aquatic',
    '飞行': 'avian',
    '草': 'quadruped', '一般': 'quadruped', '格斗': 'bipedal',
    '超能力': 'mochi', '妖精': 'mochi',
    '龙': 'serpent', '毒': 'serpent', '虫': 'serpent',
    '地面': 'quadruped', '岩石': 'quadruped', '火': 'bipedal',
    '电': 'avian', '钢': 'bipedal', '幽灵': 'mochi', '恶': 'bipedal',
  };
  const preferred = bias[primary];
  if (preferred && rng() < 0.45) return preferred;
  return BODY_TYPES[Math.floor(rng() * BODY_TYPES.length)];
}

const TYPE_ACCENT = {
  '火': 0xe8622c, '水': 0x2f80d6, '电': 0xf4c531, '草': 0x4caf50,
  '冰': 0x7fd4e8, '格斗': 0xb34a2e, '毒': 0x9c4ab8, '地面': 0xc9a227,
  '飞行': 0x8fa8dd, '超能力': 0xe8497c, '虫': 0x8fa60a, '岩石': 0xa38c5d,
  '幽灵': 0x6a4a9c, '龙': 0x4a3ec8, '恶': 0x5a4a42, '钢': 0x8f9fa8,
  '妖精': 0xe89ec8, '一般': 0x9fa19f,
};

export function paletteOf(pet) {
  const pal = PALETTES[pet.look.palette % PALETTES.length];
  return {
    body: new THREE.Color(pal.body),
    belly: new THREE.Color(pal.belly),
    accent: new THREE.Color(pal.accent),
    type: new THREE.Color(TYPE_ACCENT[pet.types[0]] ?? 0x9fa19f),
  };
}

// Toon 三阶渐变材质
function toonMat(color) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: createGradientMap(),
  });
}

let _gradientMap = null;
function createGradientMap() {
  if (_gradientMap) return _gradientMap;
  // 3 阶色阶：暗/中/亮
  const data = new Uint8Array([80, 160, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  _gradientMap = tex;
  return _gradientMap;
}

function materials(pet) {
  const pal = paletteOf(pet);
  return {
    body: toonMat(pal.body),
    belly: toonMat(pal.belly),
    accent: toonMat(pal.accent),
    type: toonMat(pal.type),
    dark: toonMat(new THREE.Color(0x2a2a3a)),
    white: toonMat(new THREE.Color(0xffffff)),
    glow: new THREE.MeshBasicMaterial({ color: pal.type, transparent: true, opacity: 0.65 }),
  };
}

// 眼睛（所有体态共用）
function makeEyes(M, L, x0, y, z, scale = 1) {
  const g = new THREE.Group();
  const r = 0.1 * L.eyeSize * scale;
  for (const s of [-1, 1]) {
    if (L.eyes === 'sleepy') {
      const lid = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, 0.02 * scale, 6, 14, Math.PI), M.dark);
      lid.rotation.z = Math.PI;
      lid.rotation.y = Math.PI / 2;
      lid.position.set(s * x0, y, z);
      g.add(lid);
    } else {
      const white = new THREE.Mesh(new THREE.SphereGeometry(r * 1.45, 14, 12), M.white);
      white.scale.z = 0.55;
      white.position.set(s * x0, y, z);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 12, 10), M.dark);
      pupil.scale.z = 0.5;
      pupil.position.set(s * x0 * 1.03, y, z + 0.08 * scale);
      g.add(white, pupil);
      if (L.eyes === 'sparkle') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.42), M.white);
        star.position.set(s * x0 + r * 0.4, y + r * 0.4, z + 0.12 * scale);
        g.add(star);
      }
    }
  }
  return g;
}

// 嘴
function makeMouth(M, L, y, z, scale = 1) {
  const g = new THREE.Group();
  if (L.mouthType === 'smile') {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.09 * scale, 0.02 * scale, 6, 14, Math.PI * 0.9), M.dark);
    mouth.rotation.x = Math.PI / 2;
    mouth.rotation.z = Math.PI + 0.35;
    mouth.position.set(0, y, z);
    g.add(mouth);
  } else if (L.mouthType === 'fang') {
    for (const x of [-0.09, 0.09]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.032 * scale, 0.11 * scale, 8), M.white);
      fang.position.set(x, y - 0.02, z);
      fang.rotation.x = Math.PI;
      g.add(fang);
    }
  } else {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, 0.2 * scale, 4), M.accent);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, y, z + 0.05);
    g.add(beak);
  }
  return g;
}

// 耳朵（长在头上，参数化位置）
function makeEars(M, L, headR, s) {
  const g = new THREE.Group();
  const ex = headR * 0.6 * s;
  if (L.ears === 'round') {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.3, 14, 12), M.body);
    ear.position.set(ex, headR * 0.85, 0);
    g.add(ear);
  } else if (L.ears === 'pointy') {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.24, headR * 0.75, 10), M.body);
    ear.position.set(headR * 0.5 * s, headR * 0.95, 0);
    ear.rotation.z = -0.35 * s;
    g.add(ear);
  } else if (L.ears === 'long') {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.16, headR * 0.8, 4, 10), M.body);
    ear.position.set(headR * 0.45 * s, headR * 1.1, 0);
    ear.rotation.z = -0.18 * s;
    g.add(ear);
  } else if (L.ears === 'fin') {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.36, 12, 10), M.type);
    fin.scale.set(0.25, 1, 0.8);
    fin.position.set(headR * 0.75 * s, headR * 0.75, 0);
    fin.rotation.z = 0.5 * s;
    g.add(fin);
  }
  return g;
}

// 尾巴（挂在骨盆后）
function makeTail(M, L, x, y, z, scale = 1) {
  const g = new THREE.Group();
  if (L.tail === 'stub') {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 12, 10), M.accent);
    t.position.set(x, y, z);
    g.add(t);
  } else if (L.tail === 'curl') {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.2 * scale, 0.06 * scale, 8, 18, Math.PI * 1.6), M.accent);
    t.position.set(x, y + 0.08, z);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  } else if (L.tail === 'fluff') {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 14, 12), M.belly);
    t.position.set(x, y + 0.1, z - 0.06);
    g.add(t);
  } else if (L.tail === 'spark') {
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 * scale), M.glow);
    t.scale.set(0.5, 1.4, 0.5);
    t.position.set(x, y + 0.15, z);
    t.name = 'sparkTail';
    g.add(t);
  }
  return g;
}

// 背刺排
function makeSpikes(M, L, count, along, y0) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1) - 0.5;
    const [px, pz] = along(t);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8), M.accent);
    spike.position.set(0, y0, pz);
    spike.position.x = px;
    spike.rotation.x = -0.6;
    g.add(spike);
  }
  return g;
}

/**
 * 构建 3D 精灵（v3 骨架化）。
 * @returns {group, update(t)} group 加入场景后每帧调用 update(t)
 */
export function buildPet3D(pet) {
  const rng = mulberry32(pet.seed >>> 0);
  const M = materials(pet);
  const phase = pet.phase ?? 0;
  const L = {
    eyeSize: 0.85 + rng() * 0.55,
    eyes: pet.look.eyes,
    ears: pet.look.ears,
    tail: pet.look.tail,
    pattern: pet.look.pattern,
    accessory: pet.look.accessory,
    mouthType: ['smile', 'fang', 'beak'][Math.floor(rng() * 3)],
  };
  const bodyType = bodyTypeBiased(pet);

  const group = new THREE.Group();
  const sway = { amp: 0.05 + rng() * 0.04, speed: 0.7 + rng() * 0.5 };
  const parts = { wings: [], tail: null, head: null, bodyRoot: null, halo: null };

  // ---- 各体态骨架 ----
  if (bodyType === 'quadruped') buildQuadruped();
  else if (bodyType === 'bipedal') buildBipedal();
  else if (bodyType === 'avian') buildAvian();
  else if (bodyType === 'serpent') buildSerpent();
  else if (bodyType === 'aquatic') buildAquatic();
  else buildMochi();

  // ---- 共通：进化相位 ----
  group.scale.setScalar((1 + phase * 0.13) * (0.95 + rng() * 0.08));
  if (phase > 0) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.3 + phase * 0.15, 0.045, 8, 42),
      M.glow
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.95;
    halo.name = 'halo';
    group.add(halo);
    parts.halo = halo;
  }

  // ---- 动画 ----
  const update = (t) => {
    group.position.y = Math.sin(t * 1.8) * 0.06;
    group.rotation.y = Math.sin(t * sway.speed) * sway.amp;
    for (const w of parts.wings) w.rotation.z = (w.userData.side ?? 1) * (0.35 + Math.sin(t * 4.5) * 0.45);
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 2.2) * 0.35;
    if (parts.head) parts.head.rotation.z = Math.sin(t * 1.1) * 0.06;
    if (parts.halo) { parts.halo.rotation.z = t * 1.2; }
  };

  // =============== 骨架实现 ===============

  // 四足兽：横放椭球躯干 + 前伸颈 + 圆头 + 4 条两段腿
  function buildQuadruped() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 26, 20), M.body);
    body.scale.set(1.5, 1, 1);
    body.rotation.z = 0;
    root.add(body);

    // 肚皮
    if (L.pattern === 'belly') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), M.belly);
      belly.scale.set(1.35, 0.85, 0.5);
      belly.position.y = -0.18;
      root.add(belly);
    }

    // 颈 + 头（前上方）
    const headGroup = new THREE.Group();
    const headR = 0.42;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0.72, 0.5, 0);
    headGroup.rotation.z = -0.25;
    // 吻部
    const snout = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.45, 14, 12), M.belly);
    snout.scale.set(1.3, 0.7, 0.8);
    snout.position.set(headR * 0.85, -headR * 0.15, 0);
    headGroup.add(snout);
    headGroup.add(makeEyes(M, L, headR * 0.45, headR * 0.2, headR * 0.75, 0.9));
    headGroup.add(makeMouth(M, L, -headR * 0.35, headR * 0.9, 0.8));
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    // 头角
    if (rng() < 0.35) {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26 + phase * 0.1, 8), M.type);
        horn.position.set(headR * 0.35 * s, headR * 0.95, 0);
        horn.rotation.z = 0.3 * s;
        headGroup.add(horn);
      }
    }
    root.add(headGroup);
    parts.head = headGroup;

    // 颈
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.5, 12), M.body);
    neck.position.set(0.55, 0.32, 0);
    neck.rotation.z = 0.7;
    root.add(neck);

    // 4 条腿：上腿+下腿两段
    const legGeo1 = new THREE.CapsuleGeometry(0.1, 0.26, 4, 10);
    const legGeo2 = new THREE.CapsuleGeometry(0.085, 0.22, 4, 10);
    for (const [lx, lz] of [[0.42, 0.28], [0.42, -0.28], [-0.42, 0.28], [-0.42, -0.28]]) {
      const upper = new THREE.Mesh(legGeo1, M.body);
      upper.position.set(lx, -0.42, lz);
      const lower = new THREE.Mesh(legGeo2, M.accent);
      lower.position.set(lx, -0.72, lz + 0.03);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.accent);
      foot.scale.set(1.1, 0.6, 1.4);
      foot.position.set(lx, -0.86, lz + 0.08);
      root.add(upper, lower, foot);
    }

    // 尾
    parts.tail = makeTail(M, L, -0.85, 0.18, 0, 1);
    root.add(parts.tail);

    // 背刺
    if (L.pattern === 'spots' || rng() < 0.3) {
      root.add(makeSpikes(M, L, 3 + phase, t => [0, -0.3 - t * 0.7], 0.68));
    }
    // 斑点
    if (L.pattern === 'spots') {
      for (let i = 0; i < 4; i++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.07 + rng() * 0.04, 10, 8), M.accent);
        spot.position.set((rng() - 0.5) * 1.1, 0.2 + rng() * 0.3, (rng() - 0.5) * 0.9);
        spot.scale.z = 0.4;
        root.add(spot);
      }
    }
    // 条纹
    if (L.pattern === 'stripe') {
      for (let i = -1; i <= 1; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 22), M.accent);
        ring.rotation.y = Math.PI / 2;
        ring.position.x = i * 0.38;
        ring.scale.z = 0.75;
        root.add(ring);
      }
    }

    group.add(root);
  }

  // 双足兽：站立体格 + 大头 + 短前肢
  function buildBipedal() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    // 梨形躯干（上窄下宽）
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 26, 20), M.body);
    body.scale.set(1, 1.25, 0.9);
    body.position.y = 0;
    root.add(body);
    if (L.pattern === 'belly') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), M.belly);
      belly.scale.set(0.85, 1.05, 0.5);
      belly.position.set(0, -0.05, 0.32);
      root.add(belly);
    }

    // 大头（精灵感的关键比例）
    const headGroup = new THREE.Group();
    const headR = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0, 0.98, 0);
    headGroup.add(makeEyes(M, L, headR * 0.42, headR * 0.1, headR * 0.8, 1.1));
    headGroup.add(makeMouth(M, L, -headR * 0.32, headR * 0.85, 0.9));
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 0.85, headR * 0.4);
      headGroup.add(gem);
    }
    if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.08, headR * 0.95, Math.sin(a) * 0.08);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 0.95, 0);
      headGroup.add(core);
    }
    if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.75, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.06, headR * 1.02, 0);
      headGroup.add(leaf);
    }
    root.add(headGroup);
    parts.head = headGroup;

    // 短前肢
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 10), M.body);
      arm.position.set(0.52 * s, 0.25, 0.1);
      arm.rotation.z = s * 0.6;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.accent);
      hand.position.set(0.68 * s, 0.05, 0.14);
      root.add(arm, hand);
    }

    // 粗壮双腿 + 大脚
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.24, 4, 10), M.body);
      leg.position.set(0.26 * s, -0.72, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.accent);
      foot.scale.set(1, 0.55, 1.5);
      foot.position.set(0.26 * s, -0.92, 0.1);
      root.add(leg, foot);
    }

    parts.tail = makeTail(M, L, 0, -0.35, -0.5, 0.9);
    root.add(parts.tail);

    if (rng() < 0.3) root.add(makeSpikes(M, L, 2 + phase, t => [0, -t * 0.4], 0.55));

    group.add(root);
  }

  // 鸟禽：泪滴身 + 圆头 + 潒 + 大翅膀 + 细腿
  function buildAvian() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 26, 20), M.body);
    body.scale.set(0.9, 1.2, 0.9);
    root.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), M.belly);
    belly.scale.set(0.8, 1.05, 0.5);
    belly.position.set(0, -0.05, 0.3);
    root.add(belly);

    // 头小圆 + 潒 + 头冠
    const headGroup = new THREE.Group();
    const headR = 0.36;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0, 0.78, 0);
    headGroup.add(makeEyes(M, L, headR * 0.5, headR * 0.15, headR * 0.72, 0.85));
    // 潒（强制 beak）
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), M.accent);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -headR * 0.1, headR * 0.9);
    headGroup.add(beak);
    // 头冠羽
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), M.type);
    crest.position.set(0, headR * 1.05, 0);
    crest.rotation.z = -0.2;
    headGroup.add(crest);
    // 鳍耳 -> 鸟用翅形耳羽
    if (L.ears === 'fin' || L.ears === 'long') {
      for (const s of [-1, 1]) {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), M.type);
        tuft.position.set(headR * 0.6 * s, headR * 0.8, 0);
        tuft.rotation.z = 0.6 * s;
        headGroup.add(tuft);
      }
    }
    root.add(headGroup);
    parts.head = headGroup;

    // 大翅膀（有扇动动画）
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), M.type);
      wing.scale.set(0.12, 0.9, 0.5);
      wing.position.set(0.5 * s, 0.1, 0);
      wing.rotation.z = 0.35 * s;
      wing.userData.side = s;
      wing.name = 'wing';
      root.add(wing);
      parts.wings.push(wing);
    }

    // 尾羽（扇形三片）
    for (const a of [-0.4, 0, 0.4]) {
      const feather = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), M.accent);
      feather.scale.set(0.08, 0.28, 1);
      feather.position.set(Math.sin(a) * 0.24, -0.15, -0.5 - Math.cos(a) * 0.1);
      feather.rotation.y = a;
      root.add(feather);
    }

    // 细腿 + 爪
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.4, 8), M.accent);
      leg.position.set(0.16 * s, -0.78, 0.05);
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.accent);
      claw.scale.set(1.1, 0.5, 1.5);
      claw.position.set(0.16 * s, -0.98, 0.1);
      root.add(leg, claw);
    }

    group.add(root);
  }

  // 蛇形：S 形分节身体 + 小头 + 无肢
  function buildSerpent() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    // 分节身体：沿 S 曲线排布渐小球体
    const segs = 8;
    const segGeo = new THREE.SphereGeometry(1, 18, 14);
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const r = 0.34 * (1 - t * 0.55);
      const seg = new THREE.Mesh(segGeo, i % 2 === 0 ? M.body : M.accent);
      seg.scale.setScalar(r);
      seg.position.set(
        Math.sin(t * Math.PI * 1.6) * 0.22,
        -0.5 + t * 0.45,
        -t * 0.55
      );
      root.add(seg);
    }
    // 肚皮纹
    if (L.pattern !== 'none') {
      for (let i = 0; i < segs - 1; i += 2) {
        const t = i / (segs - 1);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.3 * (1 - t * 0.55), 0.04, 6, 18), M.belly);
        band.rotation.x = Math.PI / 2;
        band.rotation.y = Math.sin(t * Math.PI * 1.6) * 0.35;
        band.position.set(Math.sin(t * Math.PI * 1.6) * 0.22, -0.5 + t * 0.45, -t * 0.55);
        root.add(band);
      }
    }

    // 头（椭圆前伸）
    const headGroup = new THREE.Group();
    const headR = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 18), M.body);
    head.scale.set(1, 0.9, 1.25);
    headGroup.add(head);
    headGroup.position.set(0, 0.28, 0.28);
    headGroup.rotation.x = 0.25;
    headGroup.add(makeEyes(M, L, headR * 0.45, headR * 0.25, headR * 0.7, 0.9));
    headGroup.add(makeMouth(M, L, -headR * 0.25, headR * 0.95, 0.85));
    // 蛇信
    if (rng() < 0.5) {
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), toonMat(new THREE.Color(0xe8497c)));
      tongue.position.set(0, -headR * 0.3, headR * 1.3);
      headGroup.add(tongue);
    }
    root.add(headGroup);
    parts.head = headGroup;

    parts.tail = makeTail(M, L, Math.sin(Math.PI * 1.6) * 0.22 * -1, -0.55, -1.1, 0.7);
    root.add(parts.tail);

    group.add(root);
  }

  // 水族：流线纺锤身 + 背鳍 + 鱼尾 + 侧鳍
  function buildAquatic() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 26, 20), M.body);
    body.scale.set(1.35, 0.95, 0.85);
    root.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 16), M.belly);
    belly.scale.set(1.2, 0.8, 0.5);
    belly.position.y = -0.12;
    root.add(belly);

    // 背鳍
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 4), M.type);
    dorsal.scale.set(0.4, 1, 1);
    dorsal.position.set(0, 0.62, 0);
    root.add(dorsal);

    // 头（与身体融合的前段）
    const headGroup = new THREE.Group();
    const headR = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 18), M.body);
    head.scale.set(0.9, 0.85, 1);
    headGroup.add(head);
    headGroup.position.set(0.62, 0.08, 0);
    headGroup.add(makeEyes(M, L, headR * 0.35, headR * 0.25, headR * 0.68, 0.95));
    // 鱼嘴（弧线）
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.28, 0.02, 6, 14, Math.PI * 0.8), M.dark);
    mouth.rotation.x = Math.PI / 2;
    mouth.rotation.z = Math.PI + 0.4;
    mouth.position.set(headR * 0.75, -headR * 0.28, headR * 0.25);
    headGroup.add(mouth);
    root.add(headGroup);
    parts.head = headGroup;

    // 鱼尾（两片三角）
    const tailFin = new THREE.Group();
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), M.type);
      fin.scale.set(0.25, 1, 1);
      fin.position.set(0, s * 0.18, -0.85);
      fin.rotation.x = s * 0.5;
      fin.rotation.z = Math.PI / 2;
      tailFin.add(fin);
    }
    tailFin.position.set(-0.75, 0, 0);
    parts.tail = tailFin;
    root.add(tailFin);

    // 侧鳍（扇动）
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), M.type);
      fin.scale.set(0.1, 0.7, 0.45);
      fin.position.set(0.42 * s, -0.12, 0.15);
      fin.rotation.z = 0.5 * s;
      fin.userData.side = s;
      fin.name = 'wing';
      root.add(fin);
      parts.wings.push(fin);
    }

    // 气泡点缀
    if (rng() < 0.5) {
      for (let i = 0; i < 3; i++) {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.03 + rng() * 0.03, 8, 8), M.white);
        bubble.position.set(0.3 + rng() * 0.3, 0.5 + rng() * 0.3, -0.2 + rng() * 0.4);
        bubble.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
        root.add(bubble);
      }
    }

    group.add(root);
  }

  // 团子：坐姿糯米团 + 短手 + 顶部叶/呆毛
  function buildMochi() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    // 底大顶小的坐姿团
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 26, 20), M.body);
    body.scale.set(1.15, 0.95, 1);
    body.position.y = -0.1;
    root.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), M.belly);
    belly.scale.set(0.95, 0.8, 0.5);
    belly.position.set(0, -0.22, 0.42);
    root.add(belly);

    // 脸直接长在身上（无独立头）
    const faceY = 0.18;
    root.add(makeEyes(M, L, 0.2, faceY, 0.58, 1.15));
    root.add(makeMouth(M, L, faceY - 0.16, 0.56, 0.9));
    // 腮红
    for (const s of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toonMat(new THREE.Color(0xf0a0a8)));
      blush.scale.z = 0.4;
      blush.position.set(0.36 * s, faceY - 0.02, 0.52);
      root.add(blush);
    }
    // 呆毛
    const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 8), M.body);
    ahoge.position.set(0, 0.62, 0);
    ahoge.rotation.z = -0.25;
    ahoge.name = 'ahoge';
    root.add(ahoge);
    parts.head = ahoge;

    // 短手（贴身）
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.14, 4, 10), M.body);
      arm.position.set(0.62 * s, -0.02, 0.2);
      arm.rotation.z = s * 1.1;
      root.add(arm);
    }
    // 小脚
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.accent);
      foot.scale.set(1, 0.6, 1.4);
      foot.position.set(0.3 * s, -0.68, 0.18);
      root.add(foot);
    }

    // 叶子头饰概率
    if (L.accessory === 'leaf' || rng() < 0.3) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.8, 1);
      leaf.rotation.z = 0.55;
      leaf.position.set(0.08, 0.78, 0);
      root.add(leaf);
    }

    parts.tail = makeTail(M, L, 0, -0.3, -0.6, 0.8);
    root.add(parts.tail);

    group.add(root);
  }

  return { group, update, bodyType };
}

/**
 * 离屏渲染单只精灵快照（dataURL）。
 * v3: Toon + 描边由调用方（renderer 包装）处理；这里保持纯场景。
 */
export function renderSnapshot(pet, size = 192, outline = true) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.05, 5.4);
  cam.lookAt(0, 0.05, 0);

  // Toon 材质需要方向光才能出二分色
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const { group, update } = buildPet3D(pet);
  scene.add(group);
  update(1.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);

  if (outline) {
    import('three/examples/jsm/effects/OutlineEffect.js').then(({ OutlineEffect }) => {
      // 同步路径无法等待 import —— OutlineEffect 在调用方 Pet3D 处理；快照退化为无描边
    }).catch(() => {});
  }
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return url;
}
