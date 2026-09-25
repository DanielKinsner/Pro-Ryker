import * as THREE from 'three';
import { RAPIER, type PhysicsWorld } from '../physics/world';
import { sampleHeights, contours, resample, gridHeight, dirVec, qpTopDistance, type HeightGrid } from './heightfield';
import { BOUNDS, FEATURES, BOXES, RAILS, STAIRS, type BoxDef, type StairDef } from './layout';
import { GrindRail } from './rails';
import { triplanar, MATS } from '../render/materials';
import { concreteTexture } from '../render/textures';

export interface Park {
  grid: HeightGrid;
  rails: GrindRail[];
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  concrete: THREE.MeshStandardMaterial;
  ledgeMat: THREE.MeshStandardMaterial;
}

const PINK = new THREE.Color('#ffffff'); // the texture itself carries the salmon-pink (the clip)
const LEDGE = new THREE.Color('#d9ccc6');

export function buildPark(phys: PhysicsWorld, scene: THREE.Scene): Park {
  const group = new THREE.Group();
  group.name = 'park';
  scene.add(group);
  const grid = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, BOUNDS.cell);

  // Codex-generated tileable pink concrete (photo-like) for the flowing concrete; procedural detail
  // breaks up tiling. Ledges/plaza use a paler grey concrete.
  const loader = new THREE.TextureLoader();
  const pinkTex = loader.load(`${import.meta.env.BASE_URL}assets/art/concrete-pink.jpg`);
  pinkTex.colorSpace = THREE.SRGBColorSpace;
  pinkTex.wrapS = pinkTex.wrapT = THREE.RepeatWrapping;
  pinkTex.anisotropy = 8;
  const tex = concreteTexture(7);
  const detail = concreteTexture(19, 512);
  const concrete = triplanar(
    new THREE.MeshStandardMaterial({ color: PINK, map: pinkTex, roughness: 0.84, metalness: 0, vertexColors: true }),
    0.16,
    { detail, detailScale: 0.027 },
  );
  const ledgeMat = triplanar(new THREE.MeshStandardMaterial({ color: LEDGE, map: tex, roughness: 0.8 }), 0.35);

  // --- Heightfield render mesh + collider
  group.add(heightfieldMesh(grid, concrete));
  addParkColliders(phys, grid);

  const rails: GrindRail[] = [];

  // --- Coping around the bowl lips (auto-traced) + grind rails
  const copingMat = MATS.coping();
  for (const line of contours(grid, -0.04)) {
    const pts2 = resample(line, 0.6);
    if (pts2.length < 6) continue;
    const closed = Math.hypot(pts2[0][0] - pts2[pts2.length - 1][0], pts2[0][1] - pts2[pts2.length - 1][1]) < 1;
    const pts = pts2.map(([x, z]) => new THREE.Vector3(x, 0.035, z));
    const rail = new GrindRail(`coping-${rails.length}`, 'COPING', 'coping', pts, closed);
    rails.push(rail);
    group.add(tube(rail.pts, 0.045, copingMat, closed));
  }
  // Quarterpipe coping
  for (const f of FEATURES) {
    if (f.type !== 'qp') continue;
    const [dx, dz] = dirVec(f.dirDeg);
    const uTop = qpTopDistance(f.height, f.radius);
    const cx = f.x + dx * uTop;
    const cz = f.z + dz * uTop;
    const px = -dz;
    const pz = dx;
    const hw = f.width / 2;
    const a = new THREE.Vector3(cx - px * hw, f.height + 0.035, cz - pz * hw);
    const b = new THREE.Vector3(cx + px * hw, f.height + 0.035, cz + pz * hw);
    const rail = new GrindRail(`coping-${f.id}`, 'COPING', 'coping', [a, b]);
    rails.push(rail);
    group.add(tube([a, b], 0.05, copingMat, false));
  }

  // --- Boxes
  for (const b of BOXES) buildBox(b, phys, group, b.kind === 'ledge' || b.kind === 'pad' || b.kind === 'plaza' ? ledgeMat : concrete, rails);
  for (const s of STAIRS) buildStairs(s, phys, group, ledgeMat, rails);

  // --- Rails with visuals (steel pipe on posts) + thin colliders so you bump them if you don't grind.
  const steel = MATS.steel();
  for (const r of RAILS) {
    const pts = r.points.map((p) => new THREE.Vector3(...p));
    rails.push(new GrindRail(r.id, r.name, r.kind, pts));
    if (!r.visual) continue;
    group.add(tube(pts, 0.035, steel, false));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      const n = Math.max(2, Math.round(len / 3) + 1);
      for (let k = 0; k < n; k++) {
        const p = new THREE.Vector3().lerpVectors(a, b, k / (n - 1));
        const g = gridHeight(grid, p.x, p.z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, p.y - g, 8), steel);
        post.position.set(p.x, g + (p.y - g) / 2, p.z);
        post.castShadow = true;
        group.add(post);
      }
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      phys.addStatic(RAPIER.ColliderDesc.cuboid(0.04, 0.04, len / 2).setTranslation(mid.x, mid.y - 0.02, mid.z).setRotation(q), 'rail');
    }
  }

  return {
    grid,
    rails,
    group,
    concrete,
    ledgeMat,
    heightAt: (x, z) => {
      const inside = x > BOUNDS.minX && x < BOUNDS.minX + BOUNDS.sizeX && z > BOUNDS.minZ && z < BOUNDS.minZ + BOUNDS.sizeZ;
      return inside ? gridHeight(grid, x, z) : 0;
    },
  };
}

/** DOM-free: the park heightfield collider plus the flat ground around it (also used by tests). */
export function addParkColliders(phys: PhysicsWorld, grid: HeightGrid) {
  const nr = grid.nz - 1;
  const nc = grid.nx - 1;
  const heights = new Float32Array(grid.nx * grid.nz);
  for (let ix = 0; ix < grid.nx; ix++) for (let iz = 0; iz < grid.nz; iz++) heights[iz + ix * grid.nz] = grid.h[iz * grid.nx + ix];
  phys.addStatic(
    RAPIER.ColliderDesc.heightfield(nr, nc, heights, { x: BOUNDS.sizeX, y: 1, z: BOUNDS.sizeZ }).setTranslation(
      BOUNDS.minX + BOUNDS.sizeX / 2,
      0,
      BOUNDS.minZ + BOUNDS.sizeZ / 2,
    ),
    'concrete',
  );
  // Flat ground around the park (outside the heightfield), past the edge of the visible grass
  // (1100 m) — it used to stop at 400 m and you drove off the world.
  const E = 1200;
  const x0 = BOUNDS.minX;
  const x1 = BOUNDS.minX + BOUNDS.sizeX;
  const z0 = BOUNDS.minZ;
  const z1 = BOUNDS.minZ + BOUNDS.sizeZ;
  const slab = (cx: number, cz: number, hx: number, hz: number) => phys.addStatic(RAPIER.ColliderDesc.cuboid(hx, 1, hz).setTranslation(cx, -1, cz), 'ground');
  slab((x0 - E) / 2, 0, (E + x0) / 2 + 0.01, E);
  slab((x1 + E) / 2, 0, (E - x1) / 2 + 0.01, E);
  slab((x0 + x1) / 2, (z0 - E) / 2, (x1 - x0) / 2, (E + z0) / 2 + 0.01);
  slab((x0 + x1) / 2, (z1 + E) / 2, (x1 - x0) / 2, (E - z1) / 2 + 0.01);
}

function tube(pts: THREE.Vector3[], r: number, mat: THREE.Material, closed: boolean) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal', 0.1);
  const segs = Math.max(8, Math.round(curve.getLength() / 0.25));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 8, closed), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function heightfieldMesh(g: HeightGrid, mat: THREE.Material) {
  const { nx, nz, h, cell, minX, minZ } = g;
  const pos = new Float32Array(nx * nz * 3);
  const nrm = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const H = (ix: number, iz: number) => h[Math.max(0, Math.min(nz - 1, iz)) * nx + Math.max(0, Math.min(nx - 1, ix))];
  // Blurred height for cavity (AO) and convexity (wear) estimation.
  const blur = boxBlur(h, nx, nz, 5);
  const blur2 = boxBlur(h, nx, nz, 2);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const y = h[i];
      pos[i * 3] = minX + ix * cell;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = minZ + iz * cell;
      const dx = (H(ix + 1, iz) - H(ix - 1, iz)) / (2 * cell);
      const dz = (H(ix, iz + 1) - H(ix, iz - 1)) / (2 * cell);
      const n = new THREE.Vector3(-dx, 1, -dz).normalize();
      nrm[i * 3] = n.x;
      nrm[i * 3 + 1] = n.y;
      nrm[i * 3 + 2] = n.z;
      const cavity = blur[i] - y; // >0 in hollows
      const convex = y - blur2[i]; // >0 on lips
      let c = 1 - Math.max(0, Math.min(0.28, cavity * 0.55));
      c += Math.max(0, Math.min(0.12, convex * 0.9));
      c -= Math.max(0, Math.min(0.1, -y * 0.03));
      // Big soft patches (pours of slightly different concrete)
      const px = pos[i * 3];
      const pz = pos[i * 3 + 2];
      c *= 0.94 + 0.06 * Math.sin(px * 0.13 + Math.sin(pz * 0.09) * 2) * Math.sin(pz * 0.11 + px * 0.03);
      col[i * 3] = c;
      col[i * 3 + 1] = c * 0.99;
      col[i * 3 + 2] = c * 0.98;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.castShadow = true;
  m.name = 'park-concrete';
  return m;
}

function boxBlur(src: Float32Array, nx: number, nz: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let z = 0; z < nz; z++) {
    let acc = 0;
    let cnt = 0;
    for (let x = -r; x <= r; x++) {
      if (x >= 0 && x < nx) {
        acc += src[z * nx + x];
        cnt++;
      }
    }
    for (let x = 0; x < nx; x++) {
      tmp[z * nx + x] = acc / cnt;
      const xo = x - r;
      const xi = x + r + 1;
      if (xo >= 0) {
        acc -= src[z * nx + xo];
        cnt--;
      }
      if (xi < nx) {
        acc += src[z * nx + xi];
        cnt++;
      }
    }
  }
  for (let x = 0; x < nx; x++) {
    let acc = 0;
    let cnt = 0;
    for (let z = -r; z <= r; z++) {
      if (z >= 0 && z < nz) {
        acc += tmp[z * nx + x];
        cnt++;
      }
    }
    for (let z = 0; z < nz; z++) {
      out[z * nx + x] = acc / cnt;
      const zo = z - r;
      const zi = z + r + 1;
      if (zo >= 0) {
        acc -= tmp[zo * nx + x];
        cnt--;
      }
      if (zi < nz) {
        acc += tmp[zi * nx + x];
        cnt++;
      }
    }
  }
  return out;
}

function buildBox(b: BoxDef, phys: PhysicsWorld, group: THREE.Group, mat: THREE.Material, rails: GrindRail[]) {
  const y0 = b.y ?? 0;
  const yaw = THREE.MathUtils.degToRad(b.yawDeg ?? 0);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const geo = new THREE.BoxGeometry(b.sx, b.h + 0.4, b.sz); // extends 0.4 below ground (hides seams)
  const m = new THREE.Mesh(geo, mat);
  m.position.set(b.x, y0 + b.h / 2 - 0.2, b.z);
  m.quaternion.copy(q);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = b.id;
  group.add(m);
  phys.addStatic(
    RAPIER.ColliderDesc.cuboid(b.sx / 2, b.h / 2, b.sz / 2).setTranslation(b.x, y0 + b.h / 2, b.z).setRotation(q),
    b.kind === 'plaza' ? 'concrete' : b.kind,
  );
  // Grind edges with a steel angle trim.
  if (b.grind && b.grind !== 'none') {
    const top = y0 + b.h + 0.01;
    const hx = b.sx / 2;
    const hz = b.sz / 2;
    const corners = [
      new THREE.Vector3(-hx, top, -hz),
      new THREE.Vector3(hx, top, -hz),
      new THREE.Vector3(hx, top, hz),
      new THREE.Vector3(-hx, top, hz),
    ].map((p) => p.applyQuaternion(q).add(new THREE.Vector3(b.x, 0, b.z)));
    const edges: [number, number][] = [];
    const longX = b.sx >= b.sz;
    if (b.grind === 'all') edges.push([0, 1], [1, 2], [2, 3], [3, 0]);
    else if (longX) edges.push([0, 1], [3, 2]);
    else edges.push([1, 2], [0, 3]);
    const trim = MATS.steel();
    for (const [i, j] of edges) {
      const a = corners[i];
      const c = corners[j];
      rails.push(new GrindRail(`${b.id}-${i}${j}`, b.name ?? 'LEDGE', b.kind === 'bench' ? 'bench' : 'ledge', [a.clone(), c.clone()]));
      const len = a.distanceTo(c);
      const angle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), trim);
      angle.position.lerpVectors(a, c, 0.5).setY(top - 0.02);
      angle.lookAt(c.x, top - 0.02, c.z);
      group.add(angle);
    }
  }
}

function buildStairs(s: StairDef, phys: PhysicsWorld, group: THREE.Group, mat: THREE.Material, rails: GrindRail[]) {
  const [dx, dz] = dirVec(s.dirDeg);
  const yaw = Math.atan2(dx, -dz);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const stepRise = s.rise / s.steps;
  const stepRun = s.run / s.steps;
  // Step i (0 = top step below the plaza) spans from the plaza edge outward.
  for (let i = 0; i < s.steps; i++) {
    const h = s.rise - stepRise * (i + 1);
    if (h <= 0.001) continue;
    const u = stepRun * (i + 0.5);
    const cx = s.x + dx * u;
    const cz = s.z + dz * u;
    const geo = new THREE.BoxGeometry(s.width, h + 0.3, stepRun);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, h / 2 - 0.15, cz);
    m.quaternion.copy(q);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    phys.addStatic(RAPIER.ColliderDesc.cuboid(s.width / 2, h / 2, stepRun / 2).setTranslation(cx, h / 2, cz).setRotation(q), 'stair');
  }
  if (s.rail) {
    const railH = 0.85;
    const a = new THREE.Vector3(s.x - dx * 1.2, s.rise + railH, s.z - dz * 1.2);
    const b = new THREE.Vector3(s.x + dx * s.run, railH, s.z + dz * s.run);
    const c = new THREE.Vector3(s.x + dx * (s.run + 1.2), railH, s.z + dz * (s.run + 1.2));
    rails.push(new GrindRail(`${s.id}-rail`, 'HANDRAIL', 'rail', [a, b, c]));
    const steel = MATS.steel();
    group.add(tube([a, b, c], 0.035, steel, false));
    for (const p of [a, b, c, new THREE.Vector3().lerpVectors(a, b, 0.5)]) {
      const g = p === a ? s.rise : p.y === railH ? 0 : (s.rise + 0) / 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, p.y - g, 8), steel);
      post.position.set(p.x, g + (p.y - g) / 2, p.z);
      group.add(post);
    }
  }
}
