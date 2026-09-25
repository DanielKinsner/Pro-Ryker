import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const nr = 4, nc = 8; // try (nr+1)*(nc+1) samples
for (const n of [(nr + 1) * (nc + 1), nr * nc]) {
  try {
    const h = new Float32Array(n);
    // mark height = column-major index to learn layout
    const rows = n === (nr + 1) * (nc + 1) ? nr + 1 : nr;
    const cols = n === (nr + 1) * (nc + 1) ? nc + 1 : nc;
    for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) h[i + j * rows] = i * 10 + j; // row i, col j
    const d = RAPIER.ColliderDesc.heightfield(nr, nc, h, { x: 8, y: 1, z: 4 });
    const c = world.createCollider(d);
    world.step();
    const probe = (x, z) => {
      const hit = world.castRay(new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }), 200, true);
      return hit ? +(100 - hit.timeOfImpact).toFixed(2) : null;
    };
    console.log('len', n, 'rows', rows, 'cols', cols);
    for (const [x, z] of [[-4, -2], [4, -2], [-4, 2], [4, 2], [-3, -2], [-4, -1]]) console.log(`  (${x},${z}) ->`, probe(x, z));
    world.removeCollider(c, false);
  } catch (e) {
    console.log('len', n, 'ERR', e.message);
  }
}
