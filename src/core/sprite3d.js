// 3D 精灵构建器：纯 three.js 图元组合（球体/胶囊/圆锥/环面等），
// 由 look + types + seed 驱动，不同参数差异巨大；内置待机呼吸/摇摆动画。
// 与 SVG 版并存：3D 用于遭遇/战斗/图鉴详情，图鉴小图用快照缓存。

import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { PALETTES } from '../data/traits.js';

function findKey(list, key, dflt) { return list.find(x => x.key === key)?.key ?? dflt; }

// 造型差异维度扩展（在 SVG traits 基础上新增 3D 专属维度）
export function expandedLook(pet) {
  const rng = mulberry32((pet.seed ^ 0x5f3759df) >>> 0);
  return {
    body: findKey(['round', 'pear', 'tall', 'blob', 'drop'], pet.look.body, 'round'),
    ears: pet.look.ears,
    tail: pet.look.tail,
    pattern: pet.look.pattern,
    eyes: pet.look.eyes,
    accessory: pet.look.accessory,
    // 3D 专属差异化维度
    headSize: 0.85 + rng() * 0.55,          // 头身比
    eyeSize: 0.75 + rng() * 0.7,            // 眼睛大小
    limbStyle: ['stub', 'long', 'none'][Math.floor(rng() * 3)],
    spikes: rng() < 0.4,                    // 背刺
    hornCount: Math.floor(rng() * 3),       // 头角数量 0-2
    wingStyle: pet.types.includes('飞行') || rng() < 0.25 ? ['small', 'big', 'none'][Math.floor(rng() * 3)] : 'none',
    mouthType: ['smile', 'fang', 'beak'][Math.floor(rng() * 3)],
  };
}

// 由属性推导辅色（描边/细节），主色仍用 palette
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

const MAT = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.55, metalness: 0.08, ...opts,
});

/**
 * 构建 3D 精灵模型。
 * @param pet 存档精灵数据
 * @returns {group, update(t)} group 加入场景后每帧调用 update(t)
 */
export function buildPet3D(pet) {
  const rng = mulberry32(pet.seed >>> 0);
  const L = expandedLook(pet);
  const pal = paletteOf(pet);
  const phase = pet.phase ?? 0;

  const group = new THREE.Group();
  const bodyMats = []; // 呼吸动画缩放目标

  const bodyMat = MAT(pal.body);
  const bellyMat = MAT(pal.belly);
  const accentMat = MAT(pal.accent);
  const typeMat = MAT(pal.type, { roughness: 0.4 });
  const darkMat = MAT(0x2a2a3a, { roughness: 0.35 });
  const whiteMat = MAT(0xffffff, { roughness: 0.25 });

  // ---- 身体（核心差异：形状）----
  let body;
  const bodyGroup = new THREE.Group();
  const phaseScale = 1 + phase * 0.14;

  if (L.body === 'round') {
    body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), bodyMat);
    body.scale.set(1.05, 0.95, 0.98);
  } else if (L.body === 'pear') {
    body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), bodyMat);
    body.scale.set(1.0, 1.25, 0.95);
    body.position.y = -0.05;
  } else if (L.body === 'tall') {
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.9, 6, 20), bodyMat);
  } else if (L.body === 'blob') {
    body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), bodyMat);
    body.scale.set(1.2, 0.85, 1.1);
  } else { // drop
    body = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.7, 26), bodyMat);
    body.rotation.x = Math.PI;
    body.position.y = -0.15;
  }
  bodyGroup.add(body);
  bodyMats.push(body);

  // 肚皮
  if (L.pattern === 'belly') {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), bellyMat);
    belly.scale.set(0.9, 1, 0.55);
    belly.position.set(0, L.body === 'tall' ? -0.1 : -0.28, 0.52);
    if (L.body === 'blob') belly.position.y = -0.2;
    bodyGroup.add(belly);
  }
  // 斑点
  if (L.pattern === 'spots') {
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, r = 0.45 + rng() * 0.35;
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.1 + rng() * 0.07, 10, 8), accentMat);
      const y = (rng() - 0.3) * 0.9;
      spot.position.set(Math.cos(a) * r, y, Math.sin(Math.abs(a)) * 0.85);
      spot.scale.z = 0.4;
      bodyGroup.add(spot);
    }
  }
  // 条纹
  if (L.pattern === 'stripe') {
    for (let i = -1; i <= 1; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72 - Math.abs(i) * 0.13, 0.05, 8, 24), accentMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = i * 0.4 - 0.1;
      ring.scale.z = 0.6;
      bodyGroup.add(ring);
    }
  }
  group.add(bodyGroup);

  // ---- 头部（大圆 + 脸部）----
  const headGroup = new THREE.Group();
  const headY = L.body === 'tall' ? 1.05 : 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62 * L.headSize, 26, 20), bodyMat);
  head.position.y = headY;
  headGroup.add(head);
  bodyMats.push(head);
  group.add(headGroup);

  const eyeZ = 0.5 * L.headSize;
  const eyeY = headY + 0.06;
  const eyeR = 0.11 * L.eyeSize;
  // 眼睛（4 种风格）
  const mkEye = (x) => {
    const g = new THREE.Group();
    if (L.eyes === 'sleepy') {
      const lid = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.3, 0.022, 6, 16, Math.PI), darkMat);
      lid.rotation.z = Math.PI; lid.rotation.y = Math.PI / 2;
      lid.position.set(x, eyeY, eyeZ);
      g.add(lid);
    } else {
      const white = new THREE.Mesh(new THREE.SphereGeometry(eyeR * (L.eyes === 'sparkle' ? 1.35 : 1.5), 14, 12), whiteMat);
      white.scale.z = 0.55;
      white.position.set(x, eyeY, eyeZ);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.72, 12, 10), darkMat);
      pupil.scale.z = 0.5;
      pupil.position.set(x * 1.02, eyeY, eyeZ + 0.075);
      g.add(white, pupil);
      if (L.eyes === 'sparkle') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(eyeR * 0.42), whiteMat);
        star.position.set(x + eyeR * 0.4, eyeY + eyeR * 0.4, eyeZ + 0.11);
        g.add(star);
      }
    }
    return g;
  };
  headGroup.add(mkEye(-0.24 * L.headSize), mkEye(0.24 * L.headSize));

  // 嘴
  const mouthY = headY - 0.22 * L.headSize;
  if (L.mouthType === 'smile') {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.09 * L.headSize, 0.02, 6, 14, Math.PI * 0.9), darkMat);
    mouth.rotation.x = Math.PI / 2;
    mouth.rotation.z = Math.PI + 0.35;
    mouth.position.set(0, mouthY, eyeZ * 0.98);
    headGroup.add(mouth);
  } else if (L.mouthType === 'fang') {
    for (const x of [-0.1, 0.1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), whiteMat);
      fang.position.set(x, mouthY - 0.02, eyeZ * 0.95);
      fang.rotation.x = Math.PI;
      headGroup.add(fang);
    }
  } else { // beak
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09 * L.headSize, 0.2 * L.headSize, 4), typeMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, mouthY, eyeZ * 1.05);
    headGroup.add(beak);
  }

  // ---- 耳朵 ----
  const earY = headY + 0.5 * L.headSize;
  const mkEar = (side) => {
    const g = new THREE.Group();
    const s = side; // -1 左 1 右
    if (L.ears === 'round') {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2 * L.headSize, 14, 12), bodyMat);
      ear.position.set(0.42 * s * L.headSize, earY, 0);
      g.add(ear);
    } else if (L.ears === 'pointy') {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16 * L.headSize, 0.5 * L.headSize, 10), bodyMat);
      ear.position.set(0.36 * s * L.headSize, earY + 0.12, 0);
      ear.rotation.z = -0.35 * s;
      g.add(ear);
    } else if (L.ears === 'long') {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * L.headSize, 0.5 * L.headSize, 4, 10), bodyMat);
      ear.position.set(0.3 * s * L.headSize, earY + 0.2, 0);
      ear.rotation.z = -0.18 * s;
      g.add(ear);
    } else if (L.ears === 'fin') {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.24 * L.headSize, 12, 10), typeMat);
      fin.scale.set(0.25, 1, 0.8);
      fin.position.set(0.5 * s * L.headSize, earY - 0.05, 0);
      fin.rotation.z = 0.5 * s;
      g.add(fin);
    } // none：无耳
    return g;
  };
  if (L.ears !== 'none') headGroup.add(mkEar(-1), mkEar(1));

  // 头角
  for (let i = 0; i < L.hornCount; i++) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3 + phase * 0.12, 8), typeMat);
    horn.position.set((i === 0 ? -0.16 : 0.16) * L.headSize, headY + 0.58 * L.headSize, 0);
    horn.rotation.z = (i === 0 ? 0.3 : -0.3);
    headGroup.add(horn);
  }

  // 额晶
  if (L.accessory === 'gem') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), MAT(0x7fd4e8, { roughness: 0.15, metalness: 0.4 }));
    gem.position.set(0, headY + 0.5 * L.headSize, eyeZ * 0.55);
    headGroup.add(gem);
  }
  // 小花
  if (L.accessory === 'flower') {
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), MAT(0xe87a9a));
      const a = (p / 5) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 0.09, headY + 0.6 * L.headSize, Math.sin(a) * 0.09);
      headGroup.add(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), MAT(0xf4d03c));
    core.position.set(0, headY + 0.6 * L.headSize, 0);
    headGroup.add(core);
  }
  // 叶芽
  if (L.accessory === 'leaf') {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), MAT(0x5a9830));
    leaf.scale.set(0.3, 0.7, 1);
    leaf.rotation.z = 0.5;
    leaf.position.set(0.05, headY + 0.68 * L.headSize, 0);
    headGroup.add(leaf);
  }

  // ---- 四肢 ----
  if (L.limbStyle !== 'none') {
    const limbY = L.body === 'tall' ? -0.55 : -0.62;
    const limbLen = L.limbStyle === 'long' ? 0.42 : 0.26;
    for (const [x, z] of [[-0.5, 0.32], [0.5, 0.32], [-0.5, -0.32], [0.5, -0.32]]) {
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, limbLen, 4, 10), bodyMat);
      limb.position.set(x, limbY, z);
      group.add(limb);
      bodyMats.push(limb);
    }
  }

  // ---- 尾巴 ----
  const tailX = 0; const tailY = -0.15; const tailZ = -0.85;
  if (L.tail === 'stub') {
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), accentMat);
    tail.position.set(tailX, tailY, tailZ);
    group.add(tail);
  } else if (L.tail === 'curl') {
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 18, Math.PI * 1.6), accentMat);
    tail.position.set(tailX, tailY + 0.1, tailZ);
    tail.rotation.y = Math.PI / 2;
    group.add(tail);
  } else if (L.tail === 'fluff') {
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), bellyMat);
    tail.position.set(tailX, tailY + 0.1, tailZ - 0.1);
    group.add(tail);
  } else if (L.tail === 'spark') {
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), MAT(0xf4c531, { emissive: 0x665200, roughness: 0.3 }));
    bolt.scale.set(0.5, 1.4, 0.5);
    bolt.position.set(tailX, tailY + 0.15, tailZ);
    group.add(bolt);
  }

  // ---- 背刺（进化强化特征）----
  if (L.spikes || phase > 0) {
    const n = 3 + phase;
    for (let i = 0; i < n; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3 + phase * 0.1, 8), accentMat);
      spike.position.set(0, 0.55 + i * 0.06 - phase * 0.05, -0.55 - (i - n / 2) * 0.16);
      spike.rotation.x = -0.5;
      group.add(spike);
    }
  }

  // ---- 翅膀 ----
  if (L.wingStyle !== 'none') {
    const wingR = L.wingStyle === 'big' ? 0.55 : 0.34;
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(wingR, 12, 10), MAT(pal.type, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
      wing.scale.set(0.12, 0.8, 0.55);
      wing.position.set(0.85 * s, 0.35, -0.15);
      wing.rotation.z = 0.4 * s;
      wing.name = 'wing';
      group.add(wing);
    }
  }

  // ---- 进化光环（半透明环）----
  if (phase > 0) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.35 + phase * 0.15, 0.045, 8, 40),
      MAT(pal.type, { emissive: pal.type, emissiveIntensity: 0.7, transparent: true, opacity: 0.6 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.9;
    halo.name = 'halo';
    group.add(halo);
  }

  // 整体缩放：进化体型
  group.scale.setScalar(phaseScale * (0.92 + (rng() % 5) * 0.04));

  // ---- 待机动画 ----
  const baseY = 0;
  const wiggleAmp = 0.06 + rng() * 0.04;
  const wings = group.children.filter(c => c.name === 'wing');
  const halo = group.getObjectByName('halo');
  const update = (t) => {
    group.position.y = baseY + Math.sin(t * 1.8) * 0.07;          // 上下漂浮
    group.rotation.y = Math.sin(t * 0.7) * wiggleAmp;              // 左右轻摆
    const breathe = 1 + Math.sin(t * 2.4) * 0.015;
    bodyGroup.scale.y = breathe;                                    // 呼吸
    for (const w of wings) w.rotation.y = Math.sin(t * 5) * 0.5;    // 扇翅
    if (halo) { halo.rotation.z = t * 1.2; halo.position.y = -0.9 + Math.sin(t * 1.8) * 0.07; }
  };

  return { group, update };
}

/**
 * 离屏渲染单只精灵快照（dataURL），用于图鉴小图与宣传页。
 */
export function renderSnapshot(pet, size = 192) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.1, 5.2);
  cam.lookAt(0, 0.1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.8); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const { group, update } = buildPet3D(pet);
  scene.add(group);
  update(1.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return url;
}
