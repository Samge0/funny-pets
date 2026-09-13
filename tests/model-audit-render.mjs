// 建模优化 A/B 留样：渲染 6 骨架各一只（phase0）+ 1 只 bipedal phase2，
// 输出 test-results/model-audit-{before,after}/ 下同名 PNG，供像素对比。
// 用法：node tests/model-audit-render.mjs before|after
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tag = process.argv[2] || 'before';
const root = join(fileURLToPath(new URL('../', import.meta.url)));
const outDir = join(root, 'test-results', `model-audit-${tag}`);
mkdirSync(outDir, { recursive: true });

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<script type="importmap">
{ "imports": { "three": "../../node_modules/three/build/three.module.js", "vue": "../../node_modules/vue/dist/vue.runtime.esm-browser.prod.js" } }
</script>
</head><body>
<script type="module">
  const THREE = await import('three');
  const { generatePet } = await import('../../src/core/generator.js');
  const { buildPet3D, bodyTypeBiased } = await import('../../src/core/sprite3d.js');
  const { OutlineEffect } = await import('../../node_modules/three/examples/jsm/effects/OutlineEffect.js');

  // 6 骨架各挑一只普通精灵 + 1 只 bipedal 进化二阶（光环/王冠/描边检查）
  const wants = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];
  const picked = [];
  for (let seed = 1; picked.length < wants.length && seed < 400000; seed++) {
    const pet = generatePet(seed * 7919 + 13, 'meadow');
    if (pet.rarity === 'legend') continue;
    const bt = bodyTypeBiased(pet);
    if (wants[picked.length] === bt) {
      picked.push({ pet: { ...pet, phase: 0 }, name: bt });
      picked.length === wants.length && picked.push({ pet: { ...picked[1].pet, phase: 2 }, name: 'bipedal-phase2' });
    }
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(360, 360);
  renderer.setClearColor(0x000000, 0);
  const effect = new OutlineEffect(renderer, {
    defaultThickness: 0.0035, defaultColor: [0.16, 0.16, 0.23], defaultAlpha: 0.9,
  });

  window.__results = [];
  for (const { pet, name } of picked) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.05, 5.4); cam.lookAt(0, 0.05, 0);
    // 与 Pet3D.vue / snapshot.js 一致的光照（留样必须走真实渲染路径）
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
    scene.add(key, rim);
    const { group, update } = buildPet3D(pet);
    scene.add(group); update(1.2);
    // 自适应取景（与 snapshot.js 同策略）
    group.updateMatrixWorld(true);
    {
      const bb = new THREE.Box3().setFromObject(group);
      const cy = (bb.min.y + bb.max.y) / 2;
      const halfH = Math.max((bb.max.y - bb.min.y) / 2, 0.9);
      const fovRad = (cam.fov * Math.PI) / 180;
      const dist = Math.min(8.5, Math.max(4.6, (halfH + 0.30) / Math.tan(fovRad / 2)));
      cam.position.set(0, cy, dist); cam.lookAt(0, cy, 0);
    }
    effect.render(scene, cam);
    window.__results.push({ name, dataUrl: renderer.domElement.toDataURL('image/png') });
  }
  window.__done = true;
</script></body></html>`;

const htmlPath = join(outDir, '_runner.html');
writeFileSync(htmlPath, html);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 300)));
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.waitForFunction('window.__done === true', { timeout: 30000 });
const results = await page.evaluate(() => window.__results);
for (const r of results) {
  const b64 = r.dataUrl.replace(/^data:image\/png;base64,/, '');
  const out = join(outDir, `${r.name}.png`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`${r.name} -> ${out}`);
}
await browser.close();
console.log('done:', tag);
