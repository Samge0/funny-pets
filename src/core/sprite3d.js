// 3D 精灵构建器 v3：骨架化体态 + 卡通着色 + 轮廓描边。
// 核心改进：从"球堆"改为 6 种真正不同剪影的体态骨架（四足/双足/鸟禽/蛇形/水族/团子），
// 每种骨架有独立的关节结构与比例；MeshToonMaterial 三阶色阶 + OutlineEffect 描边。

import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { PALETTES } from '../data/traits.js';

const BODY_TYPES = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];

// 由 seed 决定体态（同类内再由其余维度变化）
export function bodyTypeOf(pet) {
  // LLM 生成的精灵显式指定体态时优先采纳（否则字段被静默丢弃）
  if (BODY_TYPES.includes(pet.bodyType)) return pet.bodyType;
  const rng = mulberry32((pet.seed ^ 0x9e3779b9) >>> 0);
  const idx = Math.floor(rng() * BODY_TYPES.length);
  return BODY_TYPES[idx];
}

// 属性 → 体态偏置：让水族多出现在水系、鸟禽多出现在飞行系等（40% 概率采纳）
export function bodyTypeBiased(pet) {
  // LLM 生成的精灵显式指定体态时优先采纳（否则字段被静默丢弃）
  if (BODY_TYPES.includes(pet.bodyType)) return pet.bodyType;
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
  // palette 兜底：分享链接数据缺 palette（截断/手改）时 PALETTES[NaN]=undefined
  // → pal.body 读取抛错 → 整页白屏（errorHandler 替换 #app）
  // 负数取模仍为负索引（PALETTES[-5]=undefined），统一 ((i % len) + len) % len 归一
  const idx = Number.isInteger(pet.look?.palette) ? ((pet.look.palette % PALETTES.length) + PALETTES.length) % PALETTES.length : 0;
  const pal = PALETTES[idx] ?? PALETTES[0];
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
    body: makeBodyMaterial(pal),
    belly: toonMat(pal.belly),
    accent: toonMat(pal.accent),
    type: toonMat(pal.type),
    dark: toonMat(new THREE.Color(0x2a2a3a)),
    white: toonMat(new THREE.Color(0xffffff)),
    glow: new THREE.MeshBasicMaterial({ color: pal.type, transparent: true, opacity: 0.65 }),
  };
}

// ---- v10 建模质感增强：体型渐变贴图 / 接触阴影 / 眼部高光 ----
// 共享灰度渐变贴图（白色→浅灰 + 细噪点）：作为 .map 与材质 color 相乘，
// 一张贴图给所有配色实现「头侧略亮、腹侧略暗」的体积感，避免纯色塑料感。
// Node 环境（引擎测试直接 import）无 document → 退回纯色材质。
let _bodyTex = null;
function bodyGradientTexture() {
  if (_bodyTex) return _bodyTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgb(255,255,255)');   // 头侧（UV v=1）不衰减
  grad.addColorStop(0.55, 'rgb(244,244,244)');
  grad.addColorStop(1, 'rgb(206,206,206)');   // 腹侧约 -19% 亮度
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 64);
  // 细碎噪点：打破大面积同色的「塑料壳」观感（±3% 内，不影响 toon 色阶）
  for (let i = 0; i < 160; i++) {
    const v = 236 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 64), 1, 1);
  }
  _bodyTex = new THREE.CanvasTexture(c);
  _bodyTex.colorSpace = THREE.SRGBColorSpace;
  return _bodyTex;
}

function makeBodyMaterial(pal) {
  const tex = bodyGradientTexture();
  const mat = new THREE.MeshToonMaterial({
    color: pal.body,
    gradientMap: createGradientMap(),
    ...(tex ? { map: tex } : {}),
  });
  return mat;
}

let _shadowTex = null;
function contactShadowTexture() {
  if (_shadowTex) return _shadowTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(18,22,38,0.40)');
  grad.addColorStop(0.55, 'rgba(18,22,38,0.20)');
  grad.addColorStop(1, 'rgba(18,22,38,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

// 接触软阴影：径向渐变贴地方片，无描边（OutlineEffect visible=false）。
// 挂在 group 底部；Pet3D 每帧按跳跃高度调透明度/尺寸（呼吸/跳跃时阴影联动）。
function makeContactShadow() {
  const tex = contactShadowTexture();
  if (!tex) return null;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
  mat.userData.outlineParameters = { visible: false, keepAlive: true };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  m.rotation.x = -Math.PI / 2;
  m.name = 'contactShadow';
  m.renderOrder = -1;
  return m;
}

// 高光点材质：白色 + 无描边（outlineParameters.visible=false）+ 不受光（MeshBasic 保持纯白）。
// 全局共享（跨构建/跨宠物），标记 userData.shared：Pet3D/snapshot 的 dispose 跳过销毁
let _glintMat = null;
function glintMaterial() {
  if (_glintMat) return _glintMat;
  _glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  _glintMat.userData.outlineParameters = { visible: false, keepAlive: true };
  _glintMat.userData.shared = true;
  return _glintMat;
}

// 内耳廓（v10）：耳内一片 belly 色小面片，给耳朵体积感/结构感。
// 用 belly 色的独立克隆材质并关描边（OutlineEffect 只读 material.userData；
// 若直接共享 M.belly 会把肚皮等所有 belly 件的描边一起关掉）
function innerEarMesh(M, kind, size, delta = {}) {
  const dz = delta.dz ?? -size * 0.45;   // 向耳根方向内嵌，避免悬空
  const s = delta.scale ?? 0.55;
  let geo;
  if (kind === 'pointy') geo = new THREE.ConeGeometry(size * 0.5 * s, size * 1.15 * s, 6);
  else geo = new THREE.SphereGeometry(size * s, 8, 6);
  const mat = M.belly.clone();
  mat.userData.outlineParameters = { visible: false, keepAlive: true };
  const inner = new THREE.Mesh(geo, mat);
  inner.position.set(0, delta.dy ?? size * 0.12, dz);
  return inner;
}

// 眼睛（所有体态共用；可选眉毛）。返回组带 userData.blink = true：Pet3D 眨眼动画按 scaleY 压扁
function makeEyes(M, L, x0, y, z, scale = 1, withBrow = false) {
  const g = new THREE.Group();
  g.userData.blink = true;
  const r = 0.1 * L.eyeSize * scale;
  for (const s of [-1, 1]) {
    if (L.eyes === 'sleepy') {
      const lid = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, 0.02 * scale, 6, 14, Math.PI), M.dark);
      lid.rotation.z = Math.PI;
      lid.rotation.y = Math.PI / 2;
      lid.position.set(s * x0, y, z);
      g.add(lid);
    } else if (L.eyes === 'dot') {
      // 豆豆眼：纯黑小圆点，无白眼球（与圆眼明确区分）
      const dot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), M.dark);
      dot.position.set(s * x0, y, z);
      g.add(dot);
    } else if (L.eyes === 'big') {
      // 葡萄大眼（v11 婴儿图式核心）：1.85× 超比例大眼球 + 大瞳 + 双高光
      const white = new THREE.Mesh(new THREE.SphereGeometry(r * 1.85, 16, 12), M.white);
      white.scale.z = 0.5;
      white.position.set(s * x0, y, z);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10), M.dark);
      pupil.scale.z = 0.45;
      pupil.position.set(s * x0 * 1.02, y, z + 0.1 * scale);
      g.add(white, pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 8, 6), M.white);
      glint.material = glintMaterial();
      glint.position.set(s * x0 - r * 0.5, y + r * 0.55, z + 0.22 * scale);
      g.add(glint);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 8, 6), M.white);
      glint2.material = glintMaterial();
      glint2.position.set(s * x0 + r * 0.42, y - r * 0.5, z + 0.22 * scale);
      g.add(glint2);
    } else if (L.eyes === 'shy') {
      // 弯弯笑眼（v11）：∪∪ 微笑弧（rotation.z=π 把上半弧翻成下半弧）+眼尾小点。
      // 弧面必须在 XY 平面正对相机——加 rotation.y=π/2 会侧对相机变成竖条（已踩坑）；
      // 弧半径封顶 x0*0.5：∪ 弧内端点在弧顶高度，超过眼距一半时两弧内端
      // 在脸中央几乎相碰成「m 形眼镜」（已两次踩坑，0.8 仍不够）
      const ar = Math.min(r * 1.15, x0 * 0.5);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(ar, 0.03 * scale, 6, 16, Math.PI), M.dark);
      arc.rotation.z = Math.PI;
      arc.position.set(s * x0, y, z + 0.04 * scale);
      g.add(arc);
      const lash = new THREE.Mesh(new THREE.SphereGeometry(0.018 * scale, 6, 6), M.dark);
      lash.position.set(s * x0 + s * ar, y - ar * 0.15, z);
      g.add(lash);
    } else {
      const white = new THREE.Mesh(new THREE.SphereGeometry(r * 1.45, 14, 12), M.white);
      white.scale.z = 0.55;
      white.position.set(s * x0, y, z);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 12, 10), M.dark);
      pupil.scale.z = 0.5;
      pupil.position.set(s * x0 * 1.03, y, z + 0.08 * scale);
      g.add(white, pupil);
      // 眼神光点（v10）：大眼球左上一颗白高光——「死鱼眼→有神」的关键一刀；
      // 无描边（否则高光点外圈描边比点本身还粗，远看像长了白爪）
      const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.24, 8, 6), M.white);
      glint.material = glintMaterial();
      glint.position.set(s * x0 - r * 0.42, y + r * 0.45, z + 0.17 * scale);
      g.add(glint);
      if (L.eyes === 'sparkle') {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.42), M.white);
        star.position.set(s * x0 + r * 0.4, y + r * 0.4, z + 0.12 * scale);
        g.add(star);
      }
      // 眉毛（斜挑=气势）
      if (withBrow) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, 0.022 * scale, 0.02 * scale), M.dark);
        brow.position.set(s * x0, y + r * 1.9, z + 0.02);
        brow.rotation.z = s * -0.35;
        g.add(brow);
      }
    }
  }
  return g;
}

// 小獠牙（嘴角两侧微露）
// 身体花纹（正面可见版）：斑点画在身体前侧面、条纹用胸前横带——
// 保证从正面相机（z+ 方向）看吞来的 spots/stripe 一眼可辨
function makeBodyPattern(M, L, radius, opts = {}) {
  const g = new THREE.Group();
  const y0 = opts.y0 ?? 0;
  if (L.pattern === 'spots') {
    const n = opts.spots ?? 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 1.1 - Math.PI * 0.55; // 仅前侧扇区
      const spot = new THREE.Mesh(new THREE.SphereGeometry(radius * (0.16 + (i % 2) * 0.05), 10, 8), M.accent);
      // 贴在体表外：沿球面方向放到 1.02×radius 处（不同骨架身体半径不同，由调用方传准）
      spot.position.set(Math.sin(a) * radius * 0.95, y0 + (i % 2 - 0.5) * radius * 0.85, Math.abs(Math.cos(a)) * radius * 0.55 + radius * 0.42);
      spot.scale.z = 0.5;
      g.add(spot);
    }
  } else if (L.pattern === 'stripe') {
    const n = opts.stripes ?? 3;
    for (let i = 0; i < n; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(radius * (0.85 - i * 0.1), radius * 0.07, 8, 20, Math.PI), M.accent);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, y0 + (i - (n - 1) / 2) * radius * 0.5, 0);
      g.add(band);
    }
  } else if (L.pattern === 'belly') {
    // 肚皮纹：胸前大片浅色圆（此前 avian/aquatic/mochi 身体自带固定 belly——吞 belly 无效果；
    // 现统一由此分支渲染，accent 色与体色形成对比）
    const belly = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.92, 18, 14), M.belly);
    belly.scale.set(0.82, 1.0, 0.45);
    belly.position.set(0, y0, radius * 0.55);
    g.add(belly);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, radius * 0.05, 8, 20), M.accent);
    rim.position.set(0, y0, radius * 0.72);
    g.add(rim);
  }
  return g;
}

// 独立配饰件（吞噬叠加用）：按 accessory 值生成小配饰组，可挂到任意位置
function makeAccessoryOnly(M, L, scale = 1) {
  const g = new THREE.Group();
  if (L.accessory === 'gem') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 * scale * 4), toonMat(new THREE.Color(0x7fd4e8)));
    g.add(gem);
  } else if (L.accessory === 'flower') {
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06 * scale * 4, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
      const a = (p / 5) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
      g.add(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale * 4, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
    g.add(core);
  } else if (L.accessory === 'leaf') {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13 * scale * 4, 10, 8), toonMat(new THREE.Color(0x7ec850)));
    leaf.scale.set(0.32, 0.85, 1);
    leaf.rotation.z = 0.5;
    g.add(leaf);
  } else if (L.accessory === 'horn') {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale * 4, 0.34 * scale * 4, 8), M.type);
    g.add(horn);
  } else if (L.accessory === 'bow') {
    // 蝴蝶结（v11 萌宠包）：双环+中心结，头侧佩戴
    const bowMat = toonMat(new THREE.Color(0xe86a8a));
    for (const dir of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.SphereGeometry(0.09 * scale * 4, 10, 8), bowMat);
      loop.scale.set(1.25, 0.75, 0.45);
      loop.position.set(dir * 0.09 * scale * 4, 0.02 * scale * 4, 0);
      loop.rotation.z = dir * 0.35;
      g.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale * 4, 8, 8), toonMat(new THREE.Color(0xc04868)));
    g.add(knot);
  }
  return g;
}

// 铃铛颈圈（v11 萌宠包）：色圈 + 金铃铛。各骨架按颈位/半径挂（mochi 挂身高 2/3 处）。
function makeBellCollar(M, radius, y) {
  const g = new THREE.Group();
  const strap = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 8, 22), M.type);
  strap.rotation.x = Math.PI / 2;
  strap.scale.z = 0.8;
  g.add(strap);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), toonMat(new THREE.Color(0xf4c531)));
  bell.scale.y = 0.9;
  // 固定小垂距（不随 radius 缩放）：mochi 大圈(radius 0.7)时 -radius*0.92 会把铃铛
  // 垂到身体底下悬空（已踩坑）；z=radius 让铃铛贴圈前缘正面可见
  bell.position.set(0, -0.06, radius);
  g.add(bell);
  const bellDot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), toonMat(new THREE.Color(0x8a6a10)));
  bellDot.position.set(0, -0.115, radius + 0.01);
  g.add(bellDot);
  g.position.y = y;
  return g;
}

// 腿关节：把腿网格包进 pivot 组（pivot 在髋部，腿网格相对下移），
// 之后 Pet3D 旋转 pivot.x 即抬腿/踢腿。返回 pivot（调用方 add 到 root 并收集到 parts.legs）
function makeLegJoint(buildMesh, hipX, hipY, hipZ) {
  const pivot = new THREE.Group();
  pivot.position.set(hipX, hipY, hipZ);
  const mesh = buildMesh();
  mesh.position.set(0, mesh.position.y - hipY, mesh.position.z - hipZ);
  mesh.position.x = 0;
  pivot.add(mesh);
  return pivot;
}

function makeFangs(M, y, z, scale = 1) {
  const g = new THREE.Group();
  for (const x of [-0.14 * scale, 0.14 * scale]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025 * scale, 0.07 * scale, 6), M.white);
    fang.position.set(x, y, z);
    g.add(fang);
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
    // 内耳廓：belly 色小圆片贴耳前侧（体积感/结构感）
    const inner = innerEarMesh(M, 'round', headR * 0.3, { dz: headR * 0.16, dy: -headR * 0.01 });
    inner.scale.z = 0.32;
    ear.add(inner);
    g.add(ear);
  } else if (L.ears === 'pointy') {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.24, headR * 0.75, 10), M.body);
    ear.position.set(headR * 0.5 * s, headR * 0.95, 0);
    ear.rotation.z = -0.35 * s;
    // 内耳：小锥贴耳前缘（旋转绕 z 轴，局部 +z 仍朝相机）
    const inner = innerEarMesh(M, 'pointy', headR * 0.24, { dy: headR * 0.13, dz: headR * 0.06 });
    ear.add(inner);
    g.add(ear);
  } else if (L.ears === 'long') {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.16, headR * 0.8, 4, 10), M.body);
    ear.position.set(headR * 0.45 * s, headR * 1.1, 0);
    ear.rotation.z = -0.18 * s;
    // 内耳：长耳垂内片（兔耳感）
    const inner = innerEarMesh(M, 'round', headR * 0.16, { dz: headR * 0.07, dy: headR * 0.12 });
    inner.scale.set(0.55, 1.5, 0.32);
    ear.add(inner);
    g.add(ear);
  } else if (L.ears === 'fin') {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.36, 12, 10), M.type);
    fin.scale.set(0.25, 1, 0.8);
    fin.position.set(headR * 0.75 * s, headR * 0.75, 0);
    fin.rotation.z = 0.5 * s;
    g.add(fin);
  } else if (L.ears === 'fluffy') {
    // 绒绒耳（v11 萌宠包）：圆胖三角 + 耳尖一撮 belly 色奶毛
    const ear = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.3, headR * 0.7, 9), M.body);
    ear.position.set(headR * 0.55 * s, headR * 0.9, 0);
    ear.rotation.z = -0.2 * s;
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.13, 8, 8), M.belly);
    tuft.position.set(0, headR * 0.3, 0);
    ear.add(tuft);
    g.add(ear);
  } else if (L.ears === 'droopy') {
    // 折垂耳（v11）：软塌下垂小狗耳——附着点在耳根上方，耳片向下外侧垂
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.15, headR * 0.7, 4, 10), M.body);
    ear.position.set(headR * 0.78 * s, headR * 0.5, 0);
    ear.rotation.z = -s * 0.5;
    g.add(ear);
  } else if (L.ears === 'stub') {
    // 小豆耳（v11）：幼态感迷你圆耳
    const ear = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.17, 10, 8), M.body);
    ear.position.set(headR * 0.55 * s, headR * 0.92, 0);
    g.add(ear);
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
    // 小短绒尖
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07 * scale, 0.16 * scale, 8), M.accent);
    tip.position.set(x, y + 0.14 * scale, z);
    g.add(tip);
  } else if (L.tail === 'curl') {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.2 * scale, 0.06 * scale, 8, 18, Math.PI * 1.6), M.accent);
    t.position.set(x, y + 0.08, z);
    t.rotation.y = Math.PI / 2;
    g.add(t);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 10, 8), M.accent);
    tip.position.set(x, y + 0.3 * scale, z);
    g.add(tip);
  } else if (L.tail === 'fluff') {
    // 三球绒毛扇形
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 14, 12), M.belly);
    t.position.set(x, y + 0.1, z - 0.06);
    g.add(t);
    const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 12, 10), M.belly);
    f2.position.set(x, y + 0.3 * scale, z - 0.02);
    g.add(f2);
    const f3 = new THREE.Mesh(new THREE.SphereGeometry(0.13 * scale, 10, 8), M.belly);
    f3.position.set(x, y + 0.42 * scale, z + 0.02);
    g.add(f3);
  } else if (L.tail === 'spark') {
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 * scale), M.glow);
    t.scale.set(0.5, 1.4, 0.5);
    t.position.set(x, y + 0.15, z);
    t.name = 'sparkTail';
    g.add(t);
    const z2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * scale), M.glow);
    z2.scale.set(0.5, 1.4, 0.5);
    z2.position.set(x, y + 0.38 * scale, z);
    g.add(z2);
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
    // v11 婴儿图式：眼下限从 0.85 抬到 1.05（平均眼距/眼径双升=萌感核心）；
    // 只改概率不改 rng() 调用次数——既有 seed 的外观映射保持稳定
    eyeSize: 1.05 + rng() * 0.5,
    // 分享数据可能缺字段：一律兜底（缺 ears/tail 等于 'none'，缺 palette 已在 paletteOf 兜）
    eyes: pet.look?.eyes ?? 'round',
    ears: pet.look?.ears ?? 'none',
    tail: pet.look?.tail ?? 'none',
    pattern: pet.look?.pattern ?? 'none',
    accessory: pet.look?.accessory ?? 'none',
    mouthType: ['smile', 'fang', 'beak'][Math.floor(rng() * 3)],
    // v4 骨架内体型随机：高矮胖瘦 + 特征强度（每次构建同 seed 稳定）
    bodyW: 0.88 + rng() * 0.3,        // 躯干宽度
    bodyH: 0.9 + rng() * 0.28,        // 躯干高度
    legLen: 0.85 + rng() * 0.4,       // 腿长
    headTilt: (rng() - 0.5) * 0.3,    // 歪头
    cheek: rng() < 0.65,              // 腮红（v11：0.45→0.65 萌感标配）
    brow: rng() < 0.18,               // 眉毛（v11：0.35→0.18 凶相减半）
    fangPair: rng() < 0.25,           // 外露小獠牙（v11：0.4→0.25 少兽相多萌相）
    collar: rng() < 0.15,             // 颈圈/围巾（v11：0.25→0.15 让位铃铛配饰）
  };
  const bodyType = bodyTypeBiased(pet);

  const group = new THREE.Group();
  const sway = { amp: 0.05 + rng() * 0.04, speed: 0.7 + rng() * 0.5 };
  const parts = { wings: [], tail: null, head: null, bodyRoot: null, halo: null, legs: [], eyes: null, shadow: null };

  // ---- 共通：接触软阴影（v10 接地感）----
  // y=-1.14 在脚底(-0.9~-1.0)与地面光环(-0.95)之下；Pet3D 每帧按跳跃高度联动透明度
  const shadow = makeContactShadow();
  if (shadow) {
    shadow.position.y = -1.14;
    group.add(shadow);
    parts.shadow = shadow;
  }

  // ---- 各体态骨架 ----
  if (bodyType === 'quadruped') buildQuadruped();
  else if (bodyType === 'bipedal') buildBipedal();
  else if (bodyType === 'avian') buildAvian();
  else if (bodyType === 'serpent') buildSerpent();
  else if (bodyType === 'aquatic') buildAquatic();
  else buildMochi();

  // ---- 共通：吞噬叠加件（extraParts：同维度多件挂件，贴身小错位——紧挨原生部件，不悬浮）----
  const extras = Array.isArray(pet.extraParts) ? pet.extraParts : [];
  if (extras.length) {
    // 脸中心世界坐标（六骨架统一锚点=parts.eyes 所在父级的原点；用于头侧叠件定位）
    const headAnchor = parts.eyes?.parent ?? parts.head ?? group;
    let headTop = { x: 0, y: 0 };
    if (parts.eyes) {
      const wp = new THREE.Vector3();
      parts.eyes.getWorldPosition(wp);
      headAnchor.worldToLocal(wp);
      headTop = { x: wp.x, y: wp.y }; // 修正：这里会重赋值，必须 let（const 会抛 Assignment to constant variable）
    }
    extras.forEach((ex, i) => {
      const layer = i * 0.06; // 极小逐件错位（贴身设计）
      if (ex.part === 'ears') {
        // 叠耳：挂在脸正上方头顶线（parts.eyes 正上方向外一耳位），随骨架走——不再世界坐标硬编码
        const e = makeEars({ ...M }, { ...L, ears: ex.value }, 0.55, -1);
        const e2 = makeEars({ ...M }, { ...L, ears: ex.value }, 0.55, 1);
        const innerY = 0.55 * 1.1; // makeEars 内部 mesh 局部 y 偏移（long 款 ≈ headR*1.1）
        const yTop = headTop.y + 0.42 - innerY; // 目标世界 y≈脸上方一耳位
        const sideShift = 0.42 + layer * 0.8;
        e.position.set(headTop.x - sideShift, yTop, headTop.z ?? -0.05);
        e2.position.set(headTop.x + sideShift, yTop, headTop.z ?? -0.05);
        e.rotation.y = -0.35; e2.rotation.y = 0.35;
        e.scale.setScalar(0.8); e2.scale.setScalar(0.8);
        headAnchor.add(e, e2);
      } else if (ex.part === 'tail') {
        // 叠尾：紧贴原生尾根旁（挂 parts.tail 的父级，同挂点微错位，尺寸略小）
        const tailAnchor = parts.tail?.parent ?? group;
        const tp = parts.tail?.position ?? { x: 0.2, y: 0.1, z: -0.4 };
        const t = makeTail(M, { ...L, tail: ex.value }, tp.x + 0.18 + layer * 1.5, tp.y + 0.06, tp.z - 0.18 - layer, 0.7);
        tailAnchor.add(t);
      } else if (ex.part === 'accessory') {
        // 叠配饰：挂脸侧发际线（parts.eyes 同高偏侧），多件左右交替
        const acc = { ...L, accessory: ex.value };
        const holder = new THREE.Group();
        const side = i % 2 === 0 ? -1 : 1;
        holder.position.set(headTop.x + side * (0.34 + layer * 1.5), headTop.y + 0.4 + layer, headTop.z ?? 0.05);
        const only = makeAccessoryOnly(M, acc, 0.16);
        only.scale.setScalar(0.7);
        holder.add(only);
        headAnchor.add(holder);
      }
      // pattern/eyes 为表面纹理/器官——不参与叠加（同维度视觉互斥），跳过
    });
  }

  // ---- 共通：进化相位（越来越炫酷）----
  group.scale.setScalar((1 + phase * 0.16) * (0.95 + rng() * 0.08));
  if (phase > 0) {
    // 地面光环（phase2 双环更炫）
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.3 + phase * 0.15, 0.045, 8, 42),
      M.glow
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.95;
    halo.name = 'halo';
    group.add(halo);
    parts.halo = halo;
    if (phase >= 2) {
      const halo2 = new THREE.Mesh(
        new THREE.TorusGeometry(1.62, 0.028, 8, 48),
        M.glow
      );
      halo2.rotation.x = Math.PI / 2;
      halo2.position.y = -1.0;
      halo2.name = 'halo2';
      group.add(halo2);
    }
    // 环绕光点（orbitDots：update 中公转）
    const dotCount = 3 + phase * 2;
    const dots = new THREE.Group();
    dots.name = 'orbitDots';
    for (let i = 0; i < dotCount; i++) {
      const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.055 + phase * 0.015), M.glow);
      const a = (i / dotCount) * Math.PI * 2;
      dot.position.set(Math.cos(a) * (1.05 + phase * 0.12), 0.15 + (i % 2) * 0.5, Math.sin(a) * (1.05 + phase * 0.12));
      dots.add(dot);
    }
    group.add(dots);
    parts.orbitDots = dots;
    // 二阶「皇」：头顶金冠（三点冠）
    if (phase >= 2) {
      const crown = new THREE.Group();
      crown.name = 'crown';
      for (let i = -1; i <= 1; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2 + Math.abs(i) === 0 ? 0.26 : 0.2, 6), toonMat(new THREE.Color(0xf4c531)));
        spike.position.set(i * 0.12, 0.1 + (i === 0 ? 0.05 : 0), 0);
        crown.add(spike);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 18), toonMat(new THREE.Color(0xf4c531)));
      band.rotation.x = Math.PI / 2;
      crown.add(band);
      // 挂在头顶最高处（各骨架头位不同，挂在 group 顶部 y≈1.55 位置由缩放承担）
      crown.position.set(0, 1.72, 0.1);
      group.add(crown);
      parts.crown = crown;
    }
  }

  // ---- 动画 ----
  const update = (t) => {
    group.position.y = Math.sin(t * 1.8) * 0.06;
    // 阴影钉地（v10）：抵消身体浮动，阴影始终贴在 y=-1.14 平面——
    // 否则阴影随身体一起浮动，接地感为零（影子必须定住，身体浮沉才有参照）
    if (parts.shadow) parts.shadow.position.y = -1.14 - group.position.y;
    group.rotation.y = Math.sin(t * sway.speed) * sway.amp;
    for (const w of parts.wings) w.rotation.z = (w.userData.side ?? 1) * (0.35 + Math.sin(t * 4.5) * 0.45);
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * 2.2) * 0.35;
    if (parts.head) {
    // 基础朝向（骨架歪头/前倾）+ 呼吸微摆增量——不得整体覆盖（落枕感根因）
    const bz = parts.head.userData.baseRot?.z ?? 0;
    parts.head.rotation.z = bz + Math.sin(t * 1.1) * 0.06;
  }
    if (parts.halo) { parts.halo.rotation.z = t * 1.2; }
    // 进化环绕光点公转 + 上下浮动
    if (parts.orbitDots) {
      parts.orbitDots.rotation.y = t * 0.8;
      parts.orbitDots.children.forEach((d, i) => { d.position.y = 0.15 + (i % 2) * 0.5 + Math.sin(t * 2.2 + i) * 0.08; });
    }
  };
  // =============== 骨架实现 ===============

  // 四足兽：横放椭球躯干 + 前伸颈 + 圆头 + 4 条两段腿
  function buildQuadruped() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 26, 20), M.body);
    body.scale.set(1.5 * L.bodyW, L.bodyH, L.bodyW);
    root.add(body);
    // 形体分瓣（v10）：臀大肌/胸两团次级体积——从「一坨椭球」到有起伏的动物躯干剪影，
    // 每瓣自己的明暗交界线让 toon 色阶读出结构
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 16), M.body);
    haunch.scale.set(0.75 * L.bodyW, 0.85 * L.bodyH, 1.0 * L.bodyW);
    haunch.position.set(-0.55, -0.26, 0);
    root.add(haunch);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), M.body);
    chest.scale.set(0.7 * L.bodyW, 0.8 * L.bodyH, 0.95 * L.bodyW);
    chest.position.set(0.52, -0.24, 0);
    root.add(chest);

    // 肚皮
    if (L.pattern === 'belly') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), M.belly);
      belly.scale.set(1.35 * L.bodyW, 0.85, 0.5);
      belly.position.y = -0.18;
      root.add(belly);
    }

    // 颈 + 头（前上方）
    const headGroup = new THREE.Group();
    const headR = 0.42;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0.72, 0.5, 0);
    headGroup.rotation.z = -0.25 + L.headTilt;
    // 吻部
    const snout = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.45, 14, 12), M.belly);
    snout.scale.set(1.3, 0.7, 0.8);
    snout.position.set(headR * 0.85, -headR * 0.15, 0);
    headGroup.add(snout);
    // 鼻头（v10）：深色小椭球收住吻部末端，口鼻区一眼读完
    const nose = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.14, 10, 8), M.dark);
    nose.position.set(headR * 1.38, -headR * 0.06, 0);
    headGroup.add(nose);
    headGroup.add(parts.eyes = makeEyes(M, L, headR * 0.45, headR * 0.2, headR * 0.75, 0.9, L.brow));
    headGroup.add(makeMouth(M, L, -headR * 0.35, headR * 0.9, 0.8));
    if (L.fangPair) headGroup.add(makeFangs(M, -headR * 0.42, headR * 0.85, 0.8));
    if (L.cheek) {
      for (const s of [-1, 1]) {
        const blush = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toonMat(new THREE.Color(0xf0a0a8)));
        blush.scale.z = 0.4;
        blush.position.set(headR * 0.7 * s, -headR * 0.1, headR * 0.6);
        headGroup.add(blush);
      }
    }
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    // 配饰（quadruped 此前完全不渲染——吞了配饰无效果；头角改为由 accessory=horn 驱动）
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 0.95, headR * 0.45);
      headGroup.add(gem);
    } else if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.08, headR * 1.0, Math.sin(a) * 0.08 + headR * 0.3);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 1.0, headR * 0.3);
      headGroup.add(core);
    } else if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.75, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.06, headR * 1.05, headR * 0.25);
      headGroup.add(leaf);
    } else if (L.accessory === 'horn') {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26 + phase * 0.1, 8), M.type);
        horn.position.set(headR * 0.35 * s, headR * 0.95, 0);
        horn.rotation.z = 0.3 * s;
        headGroup.add(horn);
      }
    }
    // v11 萌宠包：蝴蝶结（头侧）+ 铃铛颈圈（独立于头部配饰链）
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.28);
      bow.position.set(-headR * 0.72, headR * 0.6, headR * 0.3);
      bow.rotation.set(0, -0.5, 0.35);
      headGroup.add(bow);
    }
    if (L.accessory === 'bell') {
      const bc = makeBellCollar(M, 0.29, 0.26);
      bc.position.x = 0.52;
      bc.rotation.y = Math.PI / 2; // 铃铛朝头向（+x）
      root.add(bc);
    }
    // 头角
    if (rng() < 0.35 && L.accessory === 'none') {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26 + phase * 0.1, 8), M.type);
        horn.position.set(headR * 0.35 * s, headR * 0.95, 0);
        horn.rotation.z = 0.3 * s;
        headGroup.add(horn);
      }
    }
    root.add(headGroup);
    parts.head = headGroup;
    // 基础朝向存档：关节动画以它为基准增量旋转（直接归零会抹掉骨架歪头/前倾——落枕感根因）
    parts.head.userData.baseRot = headGroup.rotation.clone();

    // 颈
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.5, 12), M.body);
    neck.position.set(0.55, 0.32, 0);
    neck.rotation.z = 0.7;
    root.add(neck);

    // 4 条腿：上腿+下腿两段（腿长随机）——每条腿整体包关节组（髋部 pivot，可抬腿/踏步）
    const legY1 = -0.42, legY2 = -0.42 - 0.3 * L.legLen, footY = -0.86 * L.legLen - 0.14 * (1 - L.legLen);
    const legGeo1 = new THREE.CapsuleGeometry(0.1, 0.26 * L.legLen, 4, 10);
    const legGeo2 = new THREE.CapsuleGeometry(0.085, 0.22 * L.legLen, 4, 10);
    for (const [lx, lz] of [[0.42, 0.28], [0.42, -0.28], [-0.42, 0.28], [-0.42, -0.28]]) {
      const hip = new THREE.Group();
      hip.position.set(lx, legY1, lz);
      const upper = new THREE.Mesh(legGeo1, M.body);
      upper.position.set(0, 0, 0);
      const lower = new THREE.Mesh(legGeo2, M.accent);
      lower.position.set(0, legY2 - legY1, 0.03);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.accent);
      foot.scale.set(1.1, 0.6, 1.4);
      foot.position.set(0, footY - legY1, 0.08);
      hip.add(upper, lower, foot);
      root.add(hip);
      parts.legs.push(hip);
    }

    // 颈圈（随机装饰）
    if (L.collar) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), M.type);
      collar.rotation.y = Math.PI / 2;
      collar.position.set(0.5, 0.18, 0);
      collar.scale.z = 0.8;
      root.add(collar);
    }

    // 尾
    parts.tail = makeTail(M, L, -0.85, 0.18, 0, 1);
    root.add(parts.tail);

    // 背刺
    if (L.pattern === 'spots' || rng() < 0.3) {
      root.add(makeSpikes(M, L, 3 + phase, t => [0, -0.3 - t * 0.7], 0.68));
    }
    // 斑点（v10：正面扇区固定排布——此前 rng 散布一半落在背面/被体侧吞掉；
    // 双排 2×2 立在身体前侧面，吞噬 spots 一眼可辨）
    if (L.pattern === 'spots') {
      for (let i = 0; i < 4; i++) {
        const sx = (i % 2 === 0 ? -1 : 1) * 0.32;
        const sy = 0.08 + Math.floor(i / 2) * 0.34;
        const sz = Math.sqrt(Math.max(0, 1 - (sx / (0.93 * L.bodyW)) ** 2)) * 0.62 * L.bodyW;
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.accent);
        spot.position.set(sx, sy, sz);
        spot.scale.z = 0.42;
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
    body.scale.set(L.bodyW, 1.25 * L.bodyH, 0.9 * L.bodyW);
    body.position.y = 0;
    root.add(body);
    if (L.pattern === 'belly') {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), M.belly);
      belly.scale.set(0.85, 1.05, 0.5);
      belly.position.set(0, -0.05, 0.32);
      root.add(belly);
    }
    // 花纹（bipedal 此前只有 belly——spots/stripe 吞了完全看不出）
    root.add(makeBodyPattern(M, L, 0.5));

    // 大头（精灵感的关键比例）
    const headGroup = new THREE.Group();
    const headR = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0, 0.98, 0);
    headGroup.add(parts.eyes = makeEyes(M, L, headR * 0.42, headR * 0.1, headR * 0.8, 1.1, L.brow));
    headGroup.add(makeMouth(M, L, -headR * 0.32, headR * 0.85, 0.9));
    if (L.fangPair) headGroup.add(makeFangs(M, -headR * 0.38, headR * 0.8, 0.9));
    if (L.cheek) {
      for (const s of [-1, 1]) {
        const blush = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), toonMat(new THREE.Color(0xf0a0a8)));
        blush.scale.z = 0.4;
        blush.position.set(headR * 0.72 * s, -headR * 0.12, headR * 0.62);
        headGroup.add(blush);
      }
    }
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    // 配饰统一尺寸/前移挂点：正面相机下一眼可辨（吞噬反馈关键）
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 0.9, headR * 0.62);
      headGroup.add(gem);
    }
    if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.1, headR * 0.82, Math.sin(a) * 0.09 + headR * 0.55);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 0.82, headR * 0.55);
      headGroup.add(core);
    }
    if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), toonMat(new THREE.Color(0x7ec850)));
      leaf.scale.set(0.32, 0.85, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.1, headR * 1.02, headR * 0.35);
      headGroup.add(leaf);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), toonMat(new THREE.Color(0x4a7830)));
      stem.position.set(0.04, headR * 0.92, headR * 0.28);
      stem.rotation.z = 0.35;
      headGroup.add(stem);
    } else if (L.accessory === 'horn') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 8), M.type);
      horn.position.set(0, headR * 0.98, headR * 0.5);
      horn.rotation.x = 0.3;
      headGroup.add(horn);
    }
    // v11 萌宠包：蝴蝶结（头侧）+ 铃铛颈圈
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.3);
      bow.position.set(headR * 0.78, headR * 0.66, headR * 0.28);
      bow.rotation.set(0, -0.45, 0.3);
      headGroup.add(bow);
    }
    root.add(headGroup);
    parts.head = headGroup;
    // 基础朝向存档：关节动画以它为基准增量旋转（直接归零会抹掉骨架歪头/前倾——落枕感根因）
    parts.head.userData.baseRot = headGroup.rotation.clone();
    if (L.accessory === 'bell') root.add(makeBellCollar(M, 0.34, 0.5));

    // 短前肢
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 10), M.body);
      arm.position.set(0.52 * s, 0.25, 0.1);
      arm.rotation.z = s * 0.6;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.accent);
      hand.position.set(0.68 * s, 0.05, 0.14);
      root.add(arm, hand);
    }

    // 粗壮双腿 + 大脚（关节化：髋部 pivot，可抬腿/跳舞）
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.26 * s, -0.72, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.24, 4, 10), M.body);
      leg.position.set(0, 0, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.accent);
      foot.scale.set(1, 0.55, 1.5);
      foot.position.set(0, -0.2, 0.1);
      hip.add(leg, foot);
      root.add(hip);
      parts.legs.push(hip);
    }

    // 尾（侧向翘出——正面/侧面轮廓都可见，各款差异一目了然）
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0.34, 0.1, -0.3);
    tailPivot.rotation.z = -1.05; // 向右上侧甩出
    const tail = makeTail(M, L, 0, 0, 0, 1.6);
    tailPivot.add(tail);
    parts.tail = tailPivot;
    root.add(tailPivot);

    if (rng() < 0.3) root.add(makeSpikes(M, L, 2 + phase, t => [0, -t * 0.4], 0.55));

    group.add(root);
  }

  // 鸟禽：泪滴身 + 圆头 + 潒 + 大翅膀 + 细腿
  function buildAvian() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 26, 20), M.body);
    body.scale.set(0.9 * L.bodyW, 1.2 * L.bodyH, 0.9 * L.bodyW);
    root.add(body);
    // 肚皮/花纹统一由 makeBodyPattern 渲染（此前固定 belly 片导致吞 belly 无效果）
    // 花纹（avian 此前无 spots/stripe 渲染）
    root.add(makeBodyPattern(M, L, 0.45));

    // 头小圆 + 潒 + 头冠
    const headGroup = new THREE.Group();
    const headR = 0.36;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 18), M.body);
    headGroup.add(head);
    headGroup.position.set(0, 0.78, 0);
    headGroup.add(parts.eyes = makeEyes(M, L, headR * 0.5, headR * 0.15, headR * 0.72, 0.85));
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
    // 鳍耳 -> 鸟用翅形耳羽（全耳朵款式渲染：吞来的耳朵必须可见）
    if (L.ears !== 'none') {
      for (const s of [-1, 1]) {
        let tuft;
        if (L.ears === 'fin' || L.ears === 'long') {
          tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, L.ears === 'long' ? 0.32 : 0.2, 8), M.type);
          tuft.position.set(headR * 0.6 * s, headR * 0.8, 0);
          tuft.rotation.z = 0.6 * s;
        } else if (L.ears === 'pointy') {
          tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), M.body);
          tuft.position.set(headR * 0.7 * s, headR * 0.85, 0);
          tuft.rotation.z = -0.5 * s;
        } else { // round
          tuft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.body);
          tuft.position.set(headR * 0.75 * s, headR * 0.7, 0);
        }
        headGroup.add(tuft);
      }
    }
    // 配饰（avian 此前完全不渲染——吞了配饰无效果）
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 1.35, 0);
      headGroup.add(gem);
    } else if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.08, headR * 1.3, Math.sin(a) * 0.08);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 1.3, 0);
      headGroup.add(core);
    } else if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.75, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.07, headR * 1.4, 0);
      headGroup.add(leaf);
    } else if (L.accessory === 'horn') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), M.type);
      horn.position.set(0, headR * 1.45, 0);
      headGroup.add(horn);
    }
    // v11 萌宠包：蝴蝶结（头侧）
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.22);
      bow.position.set(headR * 0.85, headR * 0.85, headR * 0.2);
      bow.rotation.set(0, -0.45, 0.25);
      headGroup.add(bow);
    }
    root.add(headGroup);
    parts.head = headGroup;
    // 基础朝向存档：关节动画以它为基准增量旋转（直接归零会抹掉骨架歪头/前倾——落枕感根因）
    parts.head.userData.baseRot = headGroup.rotation.clone();

    // 尾羽（avian 此前不渲染 look.tail——吞来尾巴无效果）
    parts.tail = makeTail(M, L, 0, 0.35, -0.62, 1.5);
    root.add(parts.tail);

    // v11 萌宠包：铃铛挂身体前上段（鸟无颈，圈面朝 z 轴横放胸前）
    if (L.accessory === 'bell') root.add(makeBellCollar(M, 0.3, 0.42));

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

    // 细腿 + 爪（关节化）
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.16 * s, -0.78, 0.05);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.4, 8), M.accent);
      leg.position.set(0, 0, 0);
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.accent);
      claw.scale.set(1.1, 0.5, 1.5);
      claw.position.set(0, -0.2, 0.05);
      hip.add(leg, claw);
      root.add(hip);
      parts.legs.push(hip);
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
    // 斑点（serpent 的 spots 差异：背上高亮圆点，正侧可见）
    if (L.pattern === 'spots') {
      for (let i = 0; i < 4; i++) {
        const t = 0.15 + i * 0.22;
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 10, 8), M.belly);
        spot.scale.z = 0.4;
        spot.position.set(Math.sin(t * Math.PI * 1.6) * 0.22, -0.42 + t * 0.45, -t * 0.55 + 0.18);
        root.add(spot);
      }
    }
    // 条纹（stripe：亮色环带加强版）
    if (L.pattern === 'stripe') {
      for (let i = 0; i < segs; i += 1) {
        const t = i / (segs - 1);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.3 * (1 - t * 0.55) + 0.02, 0.05, 6, 18), M.type);
        band.rotation.x = Math.PI / 2;
        band.rotation.y = Math.sin(t * Math.PI * 1.6) * 0.35;
        band.position.set(Math.sin(t * Math.PI * 1.6) * 0.22, -0.5 + t * 0.45, -t * 0.55);
        root.add(band);
      }
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
    headGroup.add(parts.eyes = makeEyes(M, L, headR * 0.45, headR * 0.25, headR * 0.7, 0.9));
    headGroup.add(makeMouth(M, L, -headR * 0.25, headR * 0.95, 0.85));
    // 蛇信
    if (rng() < 0.5) {
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), toonMat(new THREE.Color(0xe8497c)));
      tongue.position.set(0, -headR * 0.3, headR * 1.3);
      headGroup.add(tongue);
    }
    // 吞噬/外观部件挂载：蛇形骨架补齐 ears/accessory
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 0.9, headR * 0.6);
      headGroup.add(gem);
    } else if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.07, headR * 0.95, Math.sin(a) * 0.07 + headR * 0.55);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 0.95, headR * 0.55);
      headGroup.add(core);
    } else if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.75, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.05, headR * 1.0, headR * 0.45);
      headGroup.add(leaf);
    } else if (L.accessory === 'horn') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), M.type);
      horn.position.set(0, headR * 1.05, headR * 0.3);
      headGroup.add(horn);
    }
    // v11 萌宠包：蝴蝶结（头侧）
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.24);
      bow.position.set(headR * 0.8, headR * 0.55, headR * 0.5);
      bow.rotation.set(0, -0.5, 0.3);
      headGroup.add(bow);
    }
    root.add(headGroup);
    parts.head = headGroup;
    // 基础朝向存档：关节动画以它为基准增量旋转（直接归零会抹掉骨架歪头/前倾——落枕感根因）
    parts.head.userData.baseRot = headGroup.rotation.clone();

    // v11 萌宠包：铃铛挂第一节身体（蛇无颈，圈立在第一节前段）
    if (L.accessory === 'bell') {
      const bc = makeBellCollar(M, 0.3, -0.5);
      bc.position.z = 0.12;
      root.add(bc);
    }

    // 尾巴：抬到尾梢上方并放大（此前被蛇身遮住看不见，吞噬尾巴无效果）
    parts.tail = makeTail(M, L, 0.5, 0.45, 0.15, 1.3);
    root.add(parts.tail);

    group.add(root);
  }

  // 水族：流线纺锤身 + 背鳍 + 鱼尾 + 侧鳍
  function buildAquatic() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 26, 20), M.body);
    body.scale.set(1.35 * L.bodyW, 0.95 * L.bodyH, 0.85 * L.bodyW);
    root.add(body);
    // 肚皮/花纹统一由 makeBodyPattern 渲染（此前固定 belly 片导致吞 belly 无效果）

    // 背鳍
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 4), M.type);
    dorsal.scale.set(0.4, 1, 1);
    dorsal.position.set(0, 0.62, 0);
    root.add(dorsal);
    // 花纹（aquatic 此前无 spots/stripe 渲染）
    root.add(makeBodyPattern(M, L, 0.48, { y0: -0.05 }));

    // 头（与身体融合的前段）
    const headGroup = new THREE.Group();
    const headR = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 22, 18), M.body);
    head.scale.set(0.9, 0.85, 1);
    headGroup.add(head);
    headGroup.position.set(0.62, 0.08, 0);
    headGroup.add(parts.eyes = makeEyes(M, L, headR * 0.35, headR * 0.25, headR * 0.68, 0.95));
    // 鱼嘴（弧线）
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.28, 0.02, 6, 14, Math.PI * 0.8), M.dark);
    mouth.rotation.x = Math.PI / 2;
    mouth.rotation.z = Math.PI + 0.4;
    mouth.position.set(headR * 0.75, -headR * 0.28, headR * 0.25);
    headGroup.add(mouth);
    root.add(headGroup);
    parts.head = headGroup;
    // 基础朝向存档：关节动画以它为基准增量旋转（直接归零会抹掉骨架歪头/前倾——落枕感根因）
    parts.head.userData.baseRot = headGroup.rotation.clone();

    // 鱼尾（两片三角）+ 吞噬尾巴款式差异（在鱼尾上叠加特征鳍/绒/电光，保证可见）
    const tailFin = new THREE.Group();
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), M.type);
      fin.scale.set(0.25, 1, 1);
      fin.position.set(0, s * 0.18, -0.85);
      fin.rotation.x = s * 0.5;
      fin.rotation.z = Math.PI / 2;
      tailFin.add(fin);
    }
    // 款式差异（吞来 stub/curl/fluff/spark 时鱼尾变形）
    if (L.tail === 'fluff') {
      for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.07 + (i % 2) * 0.03, 8, 6), M.accent);
        p.position.set(-0.15 - (i % 3) * 0.12, (i - 2) * 0.09, -0.82);
        tailFin.add(p);
      }
    } else if (L.tail === 'spark') {
      for (let i = 0; i < 3; i++) {
        const z = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), M.white);
        z.position.set(-0.1 - i * 0.1, (i % 2 ? 0.14 : -0.14), -0.85);
        z.rotation.z = Math.PI / 2 + (i % 2 ? 0.4 : -0.4);
        tailFin.add(z);
      }
    } else if (L.tail === 'curl') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 16), M.accent);
      ring.position.set(-0.16, 0, -0.85);
      tailFin.add(ring);
    } else if (L.tail === 'stub') {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.accent);
      knob.position.set(-0.12, 0, -0.85);
      tailFin.add(knob);
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

    // 吞噬/外观部件挂载：水族骨架补齐 ears/accessory（挂在头部两侧与头顶）
    headGroup.add(makeEars(M, L, headR, -1), makeEars(M, L, headR, 1));
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, headR * 0.9, headR * 0.5);
      headGroup.add(gem);
    } else if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.07, headR * 0.95, Math.sin(a) * 0.07 + headR * 0.4);
        headGroup.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, headR * 0.95, headR * 0.4);
      headGroup.add(core);
    } else if (L.accessory === 'leaf') {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.75, 1);
      leaf.rotation.z = 0.5;
      leaf.position.set(0.05, headR * 1.0, headR * 0.35);
      headGroup.add(leaf);
    } else if (L.accessory === 'horn') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), M.type);
      horn.position.set(0, headR * 1.1, headR * 0.2);
      headGroup.add(horn);
    }
    // v11 萌宠包：蝴蝶结（头侧）
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.24);
      bow.position.set(headR * 0.85, headR * 0.5, headR * 0.3);
      bow.rotation.set(0, -0.5, 0.3);
      headGroup.add(bow);
    }
    // v11 萌宠包：铃铛挂身体前段（头后一圈）
    if (L.accessory === 'bell') {
      const bc = makeBellCollar(M, 0.32, 0.08);
      bc.position.x = 0.18;
      bc.rotation.y = Math.PI / 2;
      root.add(bc);
    }

    group.add(root);
  }

  // 团子：坐姿糯米团 + 短手 + 顶部叶/呆毛
  function buildMochi() {
    const root = new THREE.Group();
    parts.bodyRoot = root;

    // 底大顶小的坐姿团
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 26, 20), M.body);
    body.scale.set(1.15 * L.bodyW, 0.95 * L.bodyH, L.bodyW);
    body.position.y = -0.1;
    root.add(body);
    // 肚皮/花纹统一由 makeBodyPattern 渲染（此前固定 belly 片导致吞 belly 无效果）
    // 花纹（mochi）：y0 压到 0.05——y0=0.22 时 rim 环(r0.42)上缘 y=0.64 超过头顶 0.55，
    // 金色 rim 从头顶戳出像发箍（存量 bug v11 修复）
    root.add(makeBodyPattern(M, L, 0.52, { y0: 0.05 }));

    // 脸直接长在身上（无独立头）
    const faceY = 0.18;
    root.add(parts.eyes = makeEyes(M, L, 0.2, faceY, 0.58, 1.15));
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
    // mochi 无独立头组：呆毛不是头（点头动画会让呆毛折断式摆动），头引用置空
    // （原 parts.head = ahoge 移除）

    // 耳朵（mochi 此前不渲染——吞来耳朵无效果；团子脸两侧挂小耳）
    // v10：与 makeEars 同步补内耳廓（belly 色小片，关描边）
    if (L.ears !== 'none') {
      for (const s of [-1, 1]) {
        let ear;
        if (L.ears === 'pointy') {
          ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), M.body);
          ear.position.set(0.5 * s, 0.42, 0);
          ear.rotation.z = -0.6 * s;
          const inner = innerEarMesh(M, 'pointy', 0.1, { dy: 0.07, dz: 0.03 });
          ear.add(inner);
        } else if (L.ears === 'fluffy') {
          // v11：绒绒耳（团子版小尺寸，带奶毛尖）
          ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 9), M.body);
          ear.position.set(0.52 * s, 0.42, 0);
          ear.rotation.z = -0.45 * s;
          const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), M.belly);
          tuft.position.set(0, 0.12, 0);
          ear.add(tuft);
        } else if (L.ears === 'droopy') {
          // v11：折垂耳（团子脸侧向下垂）
          ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 4, 10), M.body);
          ear.position.set(0.56 * s, 0.26, 0);
          ear.rotation.z = -s * 0.5;
        } else if (L.ears === 'stub') {
          // v11：小豆耳
          ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.body);
          ear.position.set(0.5 * s, 0.42, 0);
        } else if (L.ears === 'long') {
          ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 10), M.body);
          ear.position.set(0.42 * s, 0.6, 0);
          ear.rotation.z = -0.35 * s;
          const inner = innerEarMesh(M, 'round', 0.08, { dy: 0.05, dz: 0.045 });
          inner.scale.set(0.5, 1.4, 0.3);
          ear.add(inner);
        } else if (L.ears === 'fin') {
          ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.type);
          ear.scale.set(0.3, 1, 0.8);
          ear.position.set(0.55 * s, 0.35, 0);
          ear.rotation.z = 0.5 * s;
        } else { // round
          ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), M.body);
          ear.position.set(0.5 * s, 0.4, 0);
          const inner = innerEarMesh(M, 'round', 0.14, { dy: -0.01, dz: 0.08 });
          inner.scale.z = 0.3;
          ear.add(inner);
        }
        root.add(ear);
      }
    }
    // 尾巴（mochi 此前不渲染——身后小尾巴，放大上移保证可见）
    parts.tail = makeTail(M, L, 0, 0.15, -0.78, 1.5);
    root.add(parts.tail);

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

    // 顶部配饰（全款式：gem/flower/leaf/horn 此前只有 leaf——吞噬其他配饰无效果）
    if (L.accessory === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), toonMat(new THREE.Color(0x7fd4e8)));
      gem.position.set(0, 0.78, 0.05);
      root.add(gem);
    } else if (L.accessory === 'flower') {
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), toonMat(new THREE.Color(0xe87a9a)));
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.09, 0.76, Math.sin(a) * 0.09 + 0.04);
        root.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), toonMat(new THREE.Color(0xf4d03c)));
      core.position.set(0, 0.76, 0.04);
      root.add(core);
    } else if (L.accessory === 'leaf' || (L.accessory === 'none' && rng() < 0.3)) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toonMat(new THREE.Color(0x5a9830)));
      leaf.scale.set(0.3, 0.8, 1);
      leaf.rotation.z = 0.55;
      leaf.position.set(0.08, 0.78, 0);
      root.add(leaf);
    } else if (L.accessory === 'horn') {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), M.type);
      horn.position.set(0, 0.86, 0);
      root.add(horn);
    }
    // v11 萌宠包：蝴蝶结（头顶偏侧——mochi 的呆毛位被 bow 替换视觉不打架）
    if (L.accessory === 'bow') {
      const bow = makeAccessoryOnly(M, L, 0.3);
      bow.position.set(0.3, 0.72, 0.12);
      bow.rotation.set(0, -0.4, 0.4);
      root.add(bow);
    }
    // v11 萌宠包：铃铛围坐姿身体（腹部高度——脸在 y≈0.18，圈放 y=-0.22 不遮五官，
    // 此前 y=0.28 粉带横穿眼睛像「眼镜带」，已踩坑）
    if (L.accessory === 'bell') root.add(makeBellCollar(M, 0.7, -0.22));

    group.add(root);
  }

  return { group, update, bodyType, parts };
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
