import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const depthOf = new Map();
function walk(n, d) {
  const t = n.getTranslation().map((v) => +v.toFixed(3));
  const r = n.getRotation().map((v) => +v.toFixed(3));
  const s = n.getScale().map((v) => +v.toFixed(3));
  const m = n.getMesh();
  let extra = '';
  if (m) {
    let tris = 0; const mats = new Set();
    let min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
      if (p.getMaterial()) mats.add(p.getMaterial().getName());
      const a = p.getAttribute('POSITION'); const mn=a.getMinNormalized([]), mx=a.getMaxNormalized([]);
      for (let i=0;i<3;i++){min[i]=Math.min(min[i],mn[i]);max[i]=Math.max(max[i],mx[i]);}
    }
    extra = ` MESH tris=${tris} mats=[${[...mats].join(',')}] bb=${min.map(v=>v.toFixed(2))}..${max.map(v=>v.toFixed(2))}`;
  }
  if (n.getSkin()) extra += ' SKIN';
  const isJoint = process.argv[3] !== 'all' && /driver_(index|middle|ring|pinky|thumb)/.test(n.getName());
  if (!isJoint) console.log('  '.repeat(d) + n.getName() + ` t=${t} r=${r}${s.join()!=='1,1,1'?' s='+s:''}` + extra);
  for (const c of n.listChildren()) walk(c, d + 1);
}
for (const sc of root.listScenes()) for (const n of sc.listChildren()) walk(n, 0);
console.log('materials:', root.listMaterials().map((m) => m.getName()).join(', '));
console.log('textures:', root.listTextures().length, 'anims:', root.listAnimations().map(a=>a.getName()));
