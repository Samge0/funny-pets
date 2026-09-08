<template>
  <div ref="mount" class="pet3d" :class="{ grabbing }" :style="{ width: size + 'px', height: size + 'px' }"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @pointerleave="onPointerUp"></div>
</template>

<script setup>
// 复用 3D 精灵构建器：Toon 材质 + OutlineEffect 轮廓描边（v5 交互版）。
// 展示层：自动慢速自转 + 周期性随机小动作（小跳/扭摆）；
// 用户按住拖动（鼠标/触摸）可自由控制旋转方向，松手后 1.2s 恢复自转。
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
let scene, camera, renderer, effect, pet3d;
let raf = 0;
const startT = performance.now();

// 交互状态
let dragging = false;
let lastX = 0, lastY = 0;
let spinVel = 0;            // 拖拽释放后的惯性角速度
let resumeAt = 0;           // 该时间戳后恢复自动自转
let userYaw = null;         // 用户手动设置的朝向（null=未干预）
let nextActAt = 0;          // 下次随机动作时间
let act = null;             // 当前动作 {kind, start}
let baseY = 0;

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
  scene.add(built.group);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(props.size, props.size);

  // 轮廓描边：卡通渲染的灵魂
  effect = new OutlineEffect(renderer, {
    defaultThickness: 0.0035,
    defaultColor: [0.16, 0.16, 0.23],
    defaultAlpha: 0.9,
  });

  mount.value.appendChild(renderer.domElement);

  nextActAt = performance.now() + 1800 + Math.random() * 2500;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const t = (now - startT) / 1000;

    // ---- 朝向控制：拖拽中直接由 onPointerMove 设置；松手后惯性 → 1.2s → 恢复自动自转 ----
    if (!dragging) {
      if (Math.abs(spinVel) > 0.02) {
        userYaw = (userYaw ?? pet3d.group.rotation.y) + spinVel;
        spinVel *= 0.93;                       // 惯性衰减
        pet3d.group.rotation.y = userYaw;
        resumeAt = now + 1200;
      } else if (props.idleSpin && now >= resumeAt) {
        // 自动自转：手动干预过则从当前角度继续慢转（无跳变）；否则保持原小幅摆动
        const base = userYaw ?? pet3d.group.rotation.y;
        userYaw = base + 0.004;
        pet3d.group.rotation.y = userYaw;
      } else if (userYaw != null) {
        pet3d.group.rotation.y = userYaw;      // 干预后的静止窗口
      }
    }

    // ---- 随机小动作（空闲触发，动作期间叠加 hop/wiggle）----
    if (!dragging && now >= nextActAt && !act) {
      act = { kind: ['hop', 'wiggle'][Math.floor(Math.random() * 2)], start: now };
      nextActAt = now + 3200 + Math.random() * 4200;
    }
    let hopY = 0, wiggleZ = 0;
    if (act) {
      const p = (now - act.start) / 700; // 0.7s 动作
      if (p >= 1) act = null;
      else if (act.kind === 'hop') hopY = Math.sin(p * Math.PI) * 0.22;
      else wiggleZ = Math.sin(p * Math.PI * 3) * 0.16;
    }

    pet3d.update(t);
    pet3d.group.position.y = baseY + hopY + Math.sin(t * 1.8) * 0.06;
    pet3d.group.rotation.z = wiggleZ;
    effect.render(scene, camera);
  };
  loop();
}

// ---- 指针交互：按住拖动旋转（鼠标 + 触摸统一 pointer events）----
function onPointerDown(e) {
  dragging = true;
  grabbing.value = true;
  lastX = e.clientX;
  lastY = e.clientY;
  spinVel = 0;
  userYaw = pet3d?.group.rotation.y ?? 0;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  e.preventDefault();
}
function onPointerMove(e) {
  if (!dragging || !pet3d) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  lastY = e.clientY;
  userYaw += dx * 0.012; // 水平拖拽 → Y 轴旋转（跟随用户方向）
  pet3d.group.rotation.y = userYaw;
  spinVel = dx * 0.0035; // 记录惯性
}
function onPointerUp() {
  dragging = false;
  grabbing.value = false;
  resumeAt = performance.now() + 1200; // 松手 1.2s 后回到自动自转
}

function dispose() {
  cancelAnimationFrame(raf);
  if (renderer) {
    renderer.dispose();
    renderer.domElement?.remove();
    renderer = null;
  }
  effect = null;
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
