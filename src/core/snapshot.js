// 图鉴快照：离屏渲染（Toon + OutlineEffect）。
// 与 Pet3D.vue 相同的光照与描边参数，保证图鉴小图与游戏内视觉一致。
//
// v2：串行队列 + WebGL context 复用——浏览器限制活跃 context 数（Chromium ~16），
// 30 只图鉴并发渲染会触发 "Too many active WebGL contexts" 强杀最老 context，
// 可能连带杀掉游戏内实时渲染。改为全局单 renderer 顺序渲染，用完立即释放。

import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildPet3D } from './sprite3d.js';

const QUEUE = [];
let working = false;

function renderOnce(pet, size, resolve) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  // 自适应取景（与 Pet3D.vue 同一策略）：按包围盒调相机，高个宠物（bipedal/
  // phase2 王冠）在图鉴缩略图里不再被裁头。此前固定 (0,1.05,5.4) 只装得下
  // y∈[-1.42,1.52]，bipedal phase2 到 y≈2.53。
  cam.position.set(0, 1.05, 5.4);
  cam.lookAt(0, 0.05, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
  scene.add(key, rim);

  const { group, update } = buildPet3D(pet);
  scene.add(group);
  update(1.2);

  group.updateMatrixWorld(true);
  {
    const bb = new THREE.Box3().setFromObject(group);
    const cy = (bb.min.y + bb.max.y) / 2;
    const halfH = Math.max((bb.max.y - bb.min.y) / 2, 0.9);
    const fovRad = (cam.fov * Math.PI) / 180;
    const margin = 0.30; // 与 Pet3D 相同的动态余量（呼吸/光点扫掠）
    const dist = Math.min(8.5, Math.max(4.6, (halfH + margin) / Math.tan(fovRad / 2)));
    cam.position.set(0, cy, dist);
    cam.lookAt(0, cy, 0);
  }

  let url = '';
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    const effect = new OutlineEffect(renderer, {
      defaultThickness: 0.0035,
      defaultColor: [0.16, 0.16, 0.23],
      defaultAlpha: 0.9,
    });
    effect.render(scene, cam);
    url = renderer.domElement.toDataURL('image/png');
    effect.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.(); // 立即归还 WebGL context，避免堆积
  } catch {
    url = '';
  }
  scene.traverse(obj => {
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => m?.dispose?.());
  });
  resolve(url);
}

function drain() {
  if (working) return;
  working = true;
  (async () => {
    while (QUEUE.length) {
      const { pet, size, resolve } = QUEUE.shift();
      // 让出主线程一帧：30 张连渲时保持 UI 可响应
      await new Promise(r => requestAnimationFrame(() => r()));
      try { renderOnce(pet, size, resolve); }
      catch (e) { console.warn('快照渲染失败', e); resolve(''); }
    }
    working = false;
  })();
}

export function renderSnapshotOutlined(pet, size = 160) {
  return new Promise(resolve => {
    QUEUE.push({ pet, size, resolve });
    drain();
  });
}
