<template>
  <div ref="mount" class="pet3d" :style="{ width: size + 'px', height: size + 'px' }"></div>
</template>

<script setup>
// 复用单例 renderer 的 3D 精灵挂载组件：页面多处同时显示也不爆 WebGL context。
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { buildPet3D } from '../core/sprite3d.js';

const props = defineProps({
  pet: { type: Object, required: true },
  size: { type: Number, default: 160 },
  idleSpin: { type: Boolean, default: true },
});

const mount = ref(null);
let scene, camera, renderer, animId, pet3d;
let raf = 0;
const startT = performance.now();

// 单例 renderer：所有实例共享一个 canvas? 不可行（不同位置），
// 改为每实例 renderer 但上限受 图鉴虚拟化 控制；快照走离屏一次性。
function init() {
  if (!mount.value) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.1, 5.2);
  camera.lookAt(0, 0.1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.8); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const built = buildPet3D(props.pet);
  pet3d = built;
  scene.add(built.group);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(props.size, props.size);
  mount.value.appendChild(renderer.domElement);

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = (performance.now() - startT) / 1000;
    pet3d.update(t);
    if (props.idleSpin) pet3d.group.rotation.y += 0.004;
    renderer.render(scene, camera);
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
