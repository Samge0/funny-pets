<template>
  <div ref="mount" class="pet3d" :style="{ width: size + 'px', height: size + 'px' }"></div>
</template>

<script setup>
// 复用 3D 精灵构建器：Toon 材质 + OutlineEffect 轮廓描边（v3）。
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
let scene, camera, renderer, effect, animId, pet3d;
let raf = 0;
const startT = performance.now();

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

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = (performance.now() - startT) / 1000;
    pet3d.update(t);
    if (props.idleSpin) pet3d.group.rotation.y += 0.004;
    effect.render(scene, camera);
  };
  loop();
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
.pet3d { display: inline-flex; align-items: center; justify-content: center; touch-action: manipulation; }
.pet3d canvas { display: block; }
</style>
