// v10 建模引擎健全性：6 骨架×phase 构建无异常 + 同 seed 确定性 + parts.shadow 就位
import { buildPet3D } from '../src/core/sprite3d.js';

const bts = ['quadruped', 'bipedal', 'avian', 'serpent', 'aquatic', 'mochi'];
let n = 0;
for (let seed = 1; seed < 3000 && n < 120; seed++) {
  const pet = {
    seed, name: 't', types: ['水'], rarity: 'common',
    look: { palette: seed % 10, eyes: 'round', ears: 'round', tail: 'fluff', pattern: 'spots', accessory: 'gem' },
    phase: seed % 3,
    extraParts: [{ part: 'ears', value: 'long' }],
  };
  const { group, update, parts } = buildPet3D(pet);
  update(1.2);
  if (parts.shadow === undefined) throw new Error('parts.shadow missing');
  let meshes = 0;
  group.traverse(o => { if (o.isMesh) meshes++; });
  if (meshes < 5) throw new Error(`skeleton ${bts[n % 6]} seed=${seed} built ${meshes} meshes?`);
  n++;
}
const mk = s => ({
  seed: s, name: 't', types: ['火'], rarity: 'common',
  look: { palette: 2, eyes: 'round', ears: 'pointy', tail: 'curl', pattern: 'stripe', accessory: 'none' },
  phase: 0,
});
const a = buildPet3D(mk(42)), b = buildPet3D(mk(42));
let ca = 0, cb = 0;
a.group.traverse(o => { if (o.isMesh) ca++; });
b.group.traverse(o => { if (o.isMesh) cb++; });
console.log(`engine OK, builds=${n} meshA=${ca} meshB=${cb} ${ca === cb ? 'DETERMINISTIC' : 'NONDET!'}`);
if (ca !== cb) process.exit(1);
