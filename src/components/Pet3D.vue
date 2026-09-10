<template>
  <div ref="mount" class="pet3d" :class="{ grabbing, panY: dragMode === 'panY' }" :style="{ width: size + 'px', height: size + 'px' }"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerUp"></div>
</template>

<script setup>
// Pet3D v7：关节动作系统。
// - pivot 外层控制转身（水平拖拽 yaw）/ 俯仰（垂直拖拽 pitch，限 ±0.5rad 防翻底）
// - buildPet3D.parts 提供关节引用：head/tail/legs[]/eyes/bodyRoot
//   Pet3D 在其上叠加随机关节动作：眨眼/摇头/环顾/抬腿踏步/摇尾/扭腰/跳舞
// - 内层 group 仍由 buildPet3D.update() 驱动呼吸/翅膀等基础摆动
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildPet3D } from '../core/sprite3d.js';

const props = defineProps({
  pet: { type: Object, required: true },
  size: { type: Number, default: 160 },
  idleSpin: { type: Boolean, default: true },
  // 'free'（默认，弹窗内）：双向拖拽全归模型，touch-action:none；
  // 'panY'（页面内嵌）：垂直滑动让给页面滚动，仅水平拖旋转
  dragMode: { type: String, default: 'free' },
});

const mount = ref(null);
const grabbing = ref(false);
let scene, camera, renderer, effect, pet3d, pivot;
let raf = 0;
const startT = performance.now();

// 拖拽/自转状态
let dragging = false;
let lastX = 0, lastY = 0;
let spinVel = 0;
let resumeAt = 0;

// 关节动作状态
let nextActAt = 0;
let act = null; // { kind, start, dur }
let blinkAt = 0, blinking = false; // 眨眼独立节律
const baseY = 0;

const ACTS = ['blinkWave', 'headShake', 'lookAround', 'tailWag', 'wiggle', 'dance', 'step'];

function startAct(now) {
  const kind = ACTS[Math.floor(Math.random() * ACTS.length)];
  act = { kind, start: now, dur: kind === 'dance' ? 2400 : kind === 'blinkWave' ? 900 : 1300 };
  nextActAt = now + act.dur + 2200 + Math.random() * 3800;
}

function applyAct(now) {
  const P = pet3d?.parts;
  if (!P) return;
  // 头部基础朝向（骨架歪头/前倾）：动作增量叠加在它之上，结束复位回它——
  // 直接写绝对值会把骨架设定的脑袋朝向抹掉（"落枕"观感根因）
  const headBase = P.head?.userData?.baseRot;
  const hx = () => (headBase?.x ?? 0);
  const hy = () => (headBase?.y ?? 0);
  if (now >= blinkAt && !blinking) { blinking = true; blinkAt = now + 180; }
  // 眨眼（独立节律，2.2~5s 一次；sleepy 眯眯眼不眨）
  if (P.eyes && P.eyes.userData.blink) {
    if (blinking) {
      if (now >= blinkAt) { blinking = false; P.eyes.scale.y = 1; blinkAt = now + 2200 + Math.random() * 2800; }
      else P.eyes.scale.y = 0.12;
    }
  }
  if (!act) return;
  const p = (now - act.start) / act.dur;
  if (p >= 1) {
    // 动作结束复位（头部回到骨架基础朝向，其余关节归零）
    if (P.head) { P.head.rotation.x = hx(); P.head.rotation.y = hy(); }
    if (P.tail) P.tail.rotation.z = 0;
    if (P.bodyRoot) P.bodyRoot.rotation.z = 0;
    P.legs?.forEach(l => { l.rotation.x = 0; });
    act = null;
    return;
  }
  const s = Math.sin(p * Math.PI); // 0→1→0 包络
  switch (act.kind) {
    case 'blinkWave': // 眨眼+点头卖萌
      if (P.head) P.head.rotation.x = hx() + s * 0.28;
      break;
    case 'headShake': // 摇头（左右）
      if (P.head) P.head.rotation.y = hy() + Math.sin(p * Math.PI * 4) * 0.5;
      break;
    case 'lookAround': // 环顾
      if (P.head) P.head.rotation.y = hy() + Math.sin(p * Math.PI * 2) * 0.6;
      break;
    case 'tailWag': // 快速摇尾（叠加在基础摆动上）
      if (P.tail) P.tail.rotation.z = Math.sin(p * Math.PI * 10) * 0.3;
      break;
    case 'wiggle': // 扭腰
      if (P.bodyRoot) P.bodyRoot.rotation.z = Math.sin(p * Math.PI * 5) * 0.12;
      break;
    case 'dance': { // 跳舞：扭腰+交替抬腿+小跳
      if (P.bodyRoot) P.bodyRoot.rotation.z = Math.sin(p * Math.PI * 8) * 0.16;
      P.legs?.forEach((l, i) => { l.rotation.x = Math.sin(p * Math.PI * 8 + i * Math.PI / 2) * 0.5; });
      break;
    }
    case 'step': { // 原地踏步
      P.legs?.forEach((l, i) => { l.rotation.x = Math.sin(p * Math.PI * 6 + (i % 2) * Math.PI) * 0.35; });
      break;
    }
  }
}

function init() {
  if (!mount.value) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.05, 5.4);
  camera.lookAt(0, 0.05, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const built = buildPet3D(props.pet);
  pet3d = built;
  pivot = new THREE.Group();
  pivot.add(built.group);
  scene.add(pivot);

  // ---- 自适应取景：按模型真实包围盒调相机，高个宠物（bipedal/进化 phase）不被裁 ----
  // 此前固定 position(0,1.05,5.4)+lookAt(0,0.05,0)，z=0 平面可见 y∈[-1.42,1.52]；
  // bipedal phase2 包围盒到 y≈2.53，头顶/王冠整体被视锥裁掉（吞噬预览遮挡根因）。
  // 策略：量 bbox → 目标中心对准视轴 → 距离=装下 (高/2+边距)/tan(fov/2)，但设上下限
  // 防极端值：太近会失去微距感、太远模型过小，且不低于原 5.4 观感。
  {
    built.group.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(built.group);
    const cy = (bb.min.y + bb.max.y) / 2;
    const halfH = Math.max((bb.max.y - bb.min.y) / 2, 0.9); // 太扁的按 0.9 半高取景（留呼吸感）
    const fovRad = (camera.fov * Math.PI) / 180;
    // 上下留白 0.30：静态 bbox 之外还有动态余量——orbitDots 公转（y 0.15~0.65 扫掠 +
    // 透视放大）、呼吸浮动 ±0.06、跳舞小跳 0.12、轻点跳跃 0.32（跳跃瞬时贴边可接受）
    const margin = 0.30;
    const dist = Math.min(8.5, Math.max(4.6, (halfH + margin) / Math.tan(fovRad / 2)));
    camera.position.set(0, cy, dist);
    camera.lookAt(0, cy, 0);
  }

  // preserveDrawingBuffer：让 canvas 像素可被 getImageData/截图读取（E2E 视觉断言依赖；
  // 每帧成本可忽略——这是 168px 级别的小画布）
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(props.size, props.size);

  effect = new OutlineEffect(renderer, {
    defaultThickness: 0.0035,
    defaultColor: [0.16, 0.16, 0.23],
    defaultAlpha: 0.9,
  });

  mount.value.appendChild(renderer.domElement);

  nextActAt = performance.now() + 1200 + Math.random() * 1800;
  blinkAt = performance.now() + 1500 + Math.random() * 2000;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const t = (now - startT) / 1000;

    // ---- 转身/俯仰（pivot）：拖拽中由 onPointerMove 设置 ----
    if (!dragging) {
      if (Math.abs(spinVel) > 0.0015) {
        pivot.rotation.y += spinVel;
        spinVel *= 0.94;
        resumeAt = now + 1400;
      } else if (props.idleSpin && now >= resumeAt) {
        pivot.rotation.y += 0.011;
        // 俯仰缓慢回正
        pivot.rotation.x *= 0.97;
      } else {
        pivot.rotation.x *= 0.97;
      }
    }

    // ---- 随机关节动作 ----
    if (!dragging && now >= nextActAt && !act) startAct(now);
    applyAct(now);

    pet3d.update(t);
    // 轻点跳跃：0.5s 内 sin 包络弹起（幅 0.32，比 idle 浮动高 5 倍，肉眼明显）
    const hopAge = now - hopAt;
    const tapHop = hopAge < 500 ? Math.sin(hopAge / 500 * Math.PI) * 0.32 : 0;
    const hop = act?.kind === 'dance' ? Math.abs(Math.sin((now - act.start) / act.dur * Math.PI * 8)) * 0.12 : 0;
    pet3d.group.position.y = baseY + hop + tapHop + Math.sin(t * 1.8) * 0.06;
    effect.render(scene, camera);
  };
  loop();
}

// ---- 指针交互：水平拖=转身，垂直拖=俯仰（±0.5rad）；轻点=跳一下 ----
// tap 判定：位移 <6px 且按下到松开 <400ms（拖拽/滑动不算点击）
let downX = 0, downY = 0, downT = 0;
let hopAt = -1e9;
function onPointerDown(e) {
  dragging = true;
  grabbing.value = true;
  lastX = e.clientX; lastY = e.clientY;
  downX = e.clientX; downY = e.clientY; downT = performance.now();
  spinVel = 0;
  try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  e.preventDefault();
}
function onPointerMove(e) {
  if (!dragging || !pivot) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  pivot.rotation.y += dx * 0.012;
  if (props.dragMode !== 'panY') {
    // free 模式：垂直拖=俯仰（±0.5rad）
    pivot.rotation.x = THREE.MathUtils.clamp(pivot.rotation.x + dy * 0.008, -0.5, 0.5);
    // 观测点（E2E 用）：垂直拖拽生效的 DOM 证据
    if (mount.value) mount.value.dataset.pitch = pivot.rotation.x.toFixed(3);
  }
  spinVel = dx * 0.004;
}
function onPointerUp(e) {
  if (!dragging) return; // pointerup 后 pointerleave 会再触发一次，防重复
  dragging = false;
  grabbing.value = false;
  resumeAt = performance.now() + 1400;
  // 轻点 → 跳一下（松手时几乎没位移且够快）
  const dist = Math.hypot((e.clientX ?? downX) - downX, (e.clientY ?? downY) - downY);
  if (dist < 6 && performance.now() - downT < 400) {
    hopAt = performance.now();
    // 观测点（E2E 用）：hop 触发计数
    if (mount.value) mount.value.dataset.hops = String(1 + Number(mount.value.dataset.hops ?? 0));
  }
}

function dispose() {
  cancelAnimationFrame(raf);
  if (renderer) {
    renderer.dispose();
    renderer.domElement?.remove();
    renderer = null;
  }
  effect = null;
  pivot = null;
  scene?.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => m.dispose?.());
    }
  });
  scene = null; pet3d = null;
}

onMounted(init);
onBeforeUnmount(dispose);
watch(() => props.pet, () => { dispose(); init(); });
watch(() => props.size, () => {
  if (!renderer) return;
  camera.aspect = 1;
  renderer.setSize(props.size, props.size);
});
</script>

<style scoped>
.pet3d { display: inline-flex; align-items: center; justify-content: center; touch-action: none; }
.pet3d.panY { touch-action: pan-y; } /* 页面内嵌：垂直滑动让给滚动，仅水平拖旋转 */
.pet3d canvas { display: block; }
.pet3d.grabbing { cursor: grabbing; }
.pet3d:not(.grabbing) { cursor: grab; }
</style>
