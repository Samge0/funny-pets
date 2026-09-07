// 图鉴快照：独立 worker 页面内联渲染（Toon + OutlineEffect）。
// 与 Pet3D.vue 相同的光照与描边参数，保证图鉴小图与游戏内视觉一致。

import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildPet3D } from './sprite3d.js';

export function renderSnapshotOutlined(pet, size = 160) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.05, 5.4);
  cam.lookAt(0, 0.05, 0);

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

  const effect = new OutlineEffect(renderer, {
    defaultThickness: 0.0035,
    defaultColor: [0.16, 0.16, 0.23],
    defaultAlpha: 0.9,
  });
  effect.render(scene, cam);

  const url = renderer.domElement.toDataURL('image/png');
  effect.dispose?.();
  renderer.dispose();
  scene.traverse(obj => {
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => m?.dispose?.());
  });
  return url;
}
