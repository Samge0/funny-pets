<template>
  <div ref="mount" class="pet3d" :class="{ grabbing }" :style="{ width: size + 'px', height: size + 'px' }"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerUp"></div>
</template>

<script setup>
// 复用 3D 精灵构建器：Toon 材质 + OutlineEffect 轮廓描边（v6 交互版）。
// 转身控制：外层 pivot group 承载用户旋转/自动转身；内层 group 由 buildPet3D.update
// 驱动原有小幅摆动。v5 的 bug：update 每帧覆写内层 rotation.y，把自转和拖拽全部吞掉。
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildPet3D } from '../core/sprite3d.js';

const props = defineProps({
  pet: { type: Object, required: true },
  size: { type: Number, default: 160 },
  idleSpin: { type: Boolean, default: true },
});

const mount = ref(null);
const grabbing = ref(false);
let scene, camera, renderer, effect, pet3d, pivot;
let raf = 0;
const startT = performance.now();

// 交互状态
let dragging = false;
let lastX = 0;
let spinVel = 0;            // 拖拽释放后的惯性角速度（rad/帧）
let resumeAt = 0;           // 此时间戳后恢复自动转身
let nextActAt = 0;          // 下次随机动作时间
let act = null;             // 当前动作 {kind, start}
const baseY = 0;

function init() {
  if (!mount.value) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.05, 5.4);
  camera.lookAt(0, 0.05, 0);

  // Toon 二分色需要较强方向光
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const built = buildPet3D(props.pet);
  pet3d = built;
  // 外层 pivot：转身/拖拽只动 pivot；内层 group 留给 update() 做摆动（互不覆盖）
  pivot = new THREE.Group();
  pivot.add(built.group);
  scene.add(pivot);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(props.size, props.size);

  effect = new OutlineEffect(renderer, {
    defaultThickness: 0.0035,
    defaultColor: [0.16, 0.16, 0.23],
    defaultAlpha: 0.9,
  });

  mount.value.appendChild(renderer.domElement);

  nextActAt = performance.now() + 1600 + Math.random() * 2200;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const t = (now - startT) / 1000;

    // ---- 转身控制（pivot.rotation.y）：拖拽中由 onPointerMove 直接设置 ----
    if (!dragging) {
      if (Math.abs(spinVel) > 0.0015) {
        pivot.rotation.y += spinVel;         // 惯性
        spinVel *= 0.94;                     // 衰减
        resumeAt = now + 1400;
      } else if (props.idleSpin && now >= resumeAt) {
        pivot.rotation.y += 0.011;           // 自动转身（~9°/100ms，2 秒内转完半圈——真"转身"）
      }
    }

    // ---- 随机小动作（空闲触发，叠加在转身之上）----
    if (!dragging && now >= nextActAt && !act) {
      act = { kind: ['hop', 'wiggle', 'spinOnce'][Math.floor(Math.random() * 3)], start: now };
      nextActAt = now + 3000 + Math.random() * 4000;
    }
    let hopY = 0, wiggleZ = 0;
    if (act) {
      const p = (now - act.start) / 800; // 0.8s 动作
      if (p >= 1) act = null;
      else if (act.kind === 'hop') hopY = Math.sin(p * Math.PI) * 0.24;
      else if (act.kind === 'wiggle') wiggleZ = Math.sin(p * Math.PI * 3) * 0.15;
      else if (act.kind === 'spinOnce') pivot.rotation.y += 0.055 * Math.sin(p * Math.PI); // 卖萌回旋
    }

    pet3d.update(t);
    pet3d.group.position.y = baseY + hopY + Math.sin(t * 1.8) * 0.06;
    pet3d.group.rotation.z = wiggleZ;
    effect.render(scene, camera);
  };
  loop();
}

// ---- 指针交互：按住水平拖动 → 跟随旋转（鼠标 + 触摸统一 pointer events）----
function onPointerDown(e) {
  dragging = true;
  grabbing.value = true;
  lastX = e.clientX;
  spinVel = 0;
  try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  e.preventDefault();
}
function onPointerMove(e) {
  if (!dragging || !pivot) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  pivot.rotation.y += dx * 0.012;            // 拖 80px ≈ 转 55°，跟手
  spinVel = dx * 0.004;                      // 释放惯性
}
function onPointerUp() {
  dragging = false;
  grabbing.value = false;
  resumeAt = performance.now() + 1400;       // 松手 1.4s 后恢复自动转身
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
.pet3d { display: inline-flex; align-items: center; justify-content: center; touch-action: pan-y; }
.pet3d canvas { display: block; }
.pet3d.grabbing { cursor: grabbing; }
.pet3d:not(.grabbing) { cursor: grab; }
</style>
