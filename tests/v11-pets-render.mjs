// v11 萌宠包验收留样：新耳×新眼×新配饰×新色盘全组合 + 马卡龙色新宠网格。
// 用法：node tests/v11-pets-render.mjs   输出 test-results/v11-pets/*.png
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(new URL('../', import.meta.url)));
const outDir = join(root, 'test-results', 'v11-pets');
mkdirSync(outDir, { recursive: true });

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<script type="importmap">
{ "imports": { "three": "../../node_modules/three/build/three.module.js", "vue": "../../node_modules/vue/dist/vue.runtime.esm-browser.prod.js" } }
</script>
</head><body>
<script type="module">
  const THREE = await import('three');
  const { buildPet3D } = await import('../../src/core/sprite3d.js');
  const { OutlineEffect } = await import('../../node_modules/three/examples/jsm/effects/OutlineEffect.js');

  // A 组：新特征矩阵（新耳/新眼/新配饰 逐件单拍，quadruped+mochi 两骨架）
  const A = [
    ['ear-fluffy-q',   { look: { palette: 10, ears: 'fluffy', eyes: 'big',  tail: 'fluff', pattern: 'belly', accessory: 'none' } }],
    ['ear-droopy-q',   { look: { palette: 11, ears: 'droopy', eyes: 'round', tail: 'stub', pattern: 'none', accessory: 'none' } }],
    ['ear-stub-m',     { bodyType: 'mochi', look: { palette: 13, ears: 'stub', eyes: 'shy', tail: 'none', pattern: 'belly', accessory: 'none' } }],
    ['eye-big-q',      { bodyType: 'quadruped', look: { palette: 14, ears: 'round', eyes: 'big', tail: 'curl', pattern: 'none', accessory: 'none' } }],
    ['eye-shy-q',      { bodyType: 'mochi', look: { palette: 12, ears: 'pointy', eyes: 'shy', tail: 'none', pattern: 'none', accessory: 'none' } }],
    ['acc-bow-m',      { bodyType: 'mochi', look: { palette: 10, ears: 'fluffy', eyes: 'big', tail: 'none', pattern: 'none', accessory: 'bow' } }],
    ['acc-bell-q',     { bodyType: 'quadruped', look: { palette: 5, ears: 'fluffy', eyes: 'big', tail: 'fluff', pattern: 'belly', accessory: 'bell' } }],
    ['acc-bow-avian',  { bodyType: 'avian', look: { palette: 11, ears: 'none', eyes: 'big', tail: 'none', pattern: 'none', accessory: 'bow' } }],
    ['acc-bell-aqua',  { bodyType: 'aquatic', look: { palette: 11, ears: 'none', eyes: 'big', tail: 'fluff', pattern: 'none', accessory: 'bell' } }],
    ['acc-bell-m',     { bodyType: 'mochi', look: { palette: 15, ears: 'stub', eyes: 'big', tail: 'none', pattern: 'belly', accessory: 'bell' } }],
    ['combo-dream',    { bodyType: 'quadruped', look: { palette: 10, ears: 'droopy', eyes: 'big', tail: 'fluff', pattern: 'belly', accessory: 'bow' } }],
  ];

  // B 组：马卡龙色盘 6 色各一只萌宠（随机 seed 走真实生成器，锁定 phase0）
  const B = [];
  for (let pal = 10; pal <= 15; pal++) {
    B.push(['macaron-' + pal, { look: { palette: pal, ears: 'fluffy', eyes: 'big', tail: 'fluff', pattern: 'belly', accessory: 'bow' } }]);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(320, 320);
  renderer.setClearColor(0x000000, 0);
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.16, 0.16, 0.23], defaultAlpha: 0.9 });

  window.__results = [];
  for (const [name, pet] of [...A, ...B]) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.05, 5.4); cam.lookAt(0, 0.05, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x8a7c66, 0.5); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4e0, 2.0); key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0xbfd0ff, 0.9); rim.position.set(-3, 1.5, -2);
    scene.add(key, rim);
    const full = { seed: 777, name: 't', types: ['妖精'], rarity: 'common', phase: 0, ...pet };
    const { group, update } = buildPet3D(full);
    scene.add(group); update(1.2);
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
  console.log(r.name);
}
await browser.close();
console.log('done');
