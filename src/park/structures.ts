import * as THREE from 'three';
import { RAPIER, type PhysicsWorld } from '../physics/world';
import { PAVILION, PLAZA } from './layout';
import { signTexture } from '../render/textures';
import { MATS } from '../render/materials';

// Gameplay-relevant set pieces from the clip's upper plaza: the pavilion (landable, grindable roof),
// the rusty public sculpture (grindable), a roof kicker, signage and graffiti.

const BASE = import.meta.env.BASE_URL;
const texLoader = new THREE.TextureLoader();
function tex(path: string) {
  const t = texLoader.load(BASE + path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildStructures(scene: THREE.Scene, phys: PhysicsWorld) {
  const g = new THREE.Group();
  g.name = 'structures';
  scene.add(g);
  buildPavilion(g, phys);
  buildSculpture(g, phys);
  buildRoofKicker(g, phys);
  buildSigns(g, phys);
  buildGraffiti(g);
  return g;
}

function buildPavilion(g: THREE.Group, phys: PhysicsWorld) {
  const { x, z, hw, hd, eave, ridge, y } = PAVILION;
  const steel = new THREE.MeshStandardMaterial({ color: '#2b3a33', metalness: 0.6, roughness: 0.45 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#5b6f63', metalness: 0.45, roughness: 0.5, flatShading: true, side: THREE.DoubleSide });
  // Posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = x + sx * (hw - 0.6);
      const pz = z + sz * (hd - 0.6);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, eave, 12), steel);
      post.position.set(px, y + eave / 2, pz);
      post.castShadow = true;
      g.add(post);
      phys.addStatic(RAPIER.ColliderDesc.cylinder(eave / 2, 0.14).setTranslation(px, y + eave / 2, pz), 'post');
    }
  }
  // Hip roof (pyramid) with a slight overhang + fascia band + ridge cap.
  const e = y + eave;
  const r = y + ridge;
  const pts = [
    [x - hw, e, z - hd],
    [x + hw, e, z - hd],
    [x + hw, e, z + hd],
    [x - hw, e, z + hd],
  ];
  const top = [x, r, z];
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    pos.push(...a, ...top, ...b);
  }
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);
  // Standing seams (visual ribs)
  const seamMat = new THREE.MeshStandardMaterial({ color: '#6f8577', metalness: 0.5, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Vector3(...(pts[i] as [number, number, number]));
    const b = new THREE.Vector3(...(pts[(i + 1) % 4] as [number, number, number]));
    for (let k = 1; k < 10; k++) {
      const p = a.clone().lerp(b, k / 10);
      const t = new THREE.Vector3(...(top as [number, number, number]));
      const len = p.distanceTo(t);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), seamMat);
      seam.position.copy(p).lerp(t, 0.5).y += 0.03;
      seam.lookAt(t.x, t.y + 0.03, t.z);
      g.add(seam);
    }
  }
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.1, 0.28, hd * 2 + 0.1), steel);
  fascia.position.set(x, e - 0.14, z);
  g.add(fascia);
  // Roof collider (landable)
  const hull = RAPIER.ColliderDesc.convexHull(new Float32Array([...pts.flat(), ...top, ...pts.map((p) => [p[0], p[1] - 0.3, p[2]]).flat()]));
  if (hull) phys.addStatic(hull, 'roof');
  // Picnic tables under it
  const wood = MATS.wood();
  for (const dz of [-2, 2]) {
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9), wood);
    table.position.set(x, y + 0.76, z + dz);
    table.castShadow = true;
    g.add(table);
    for (const bz of [-0.75, 0.75]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.3), wood);
      bench.position.set(x, y + 0.46, z + dz + bz);
      g.add(bench);
    }
    phys.addStatic(RAPIER.ColliderDesc.cuboid(1.2, 0.4, 0.75).setTranslation(x, y + 0.4, z + dz), 'table');
  }
}

function buildSculpture(g: THREE.Group, phys: PhysicsWorld) {
  // Rusty weathering-steel slabs leaning into each other (the clip's big rusty sculpture).
  const rust = new THREE.MeshStandardMaterial({ color: '#6e3417', roughness: 0.92, metalness: 0.3 });
  const rustDark = new THREE.MeshStandardMaterial({ color: '#4d2410', roughness: 0.95, metalness: 0.25 });
  const y = PLAZA.h;
  const slabs: [number, number, number, number, number, number, number, THREE.Material][] = [
    // x, z, w, h, d, yawDeg, tiltDeg
    [-40.5, -47.5, 1.2, 4.2, 0.35, 40, -12, rust],
    [-37, -45.5, 1.1, 3.4, 0.35, 40, 14, rustDark],
    [-38.6, -46.2, 0.9, 5.2, 0.3, 50, 3, rust],
  ];
  for (const [sx, sz, w, h, d, yaw, tilt, m] of slabs) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    slab.position.set(sx, y + h / 2 - 0.1, sz);
    slab.rotation.set(0, THREE.MathUtils.degToRad(-yaw), THREE.MathUtils.degToRad(tilt), 'YXZ');
    slab.castShadow = true;
    g.add(slab);
    const q = slab.quaternion;
    phys.addStatic(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(sx, y + h / 2 - 0.1, sz).setRotation(q), 'sculpture');
  }
  // The grindable top beam (matches the 'sculpture' rail in layout.ts).
  const a = new THREE.Vector3(-40, 2.9, -48.5);
  const b = new THREE.Vector3(-36.5, 2.9, -44);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, a.distanceTo(b) + 0.6), rust);
  beam.position.lerpVectors(a, b, 0.5).y -= 0.16;
  beam.lookAt(b.x, beam.position.y, b.z);
  beam.castShadow = true;
  g.add(beam);
  phys.addStatic(
    RAPIER.ColliderDesc.cuboid(0.15, 0.15, a.distanceTo(b) / 2 + 0.3).setTranslation(beam.position.x, beam.position.y, beam.position.z).setRotation(beam.quaternion),
    'sculpture',
  );
  // Plaque
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({ map: signTexture(['"MOMENTUM"', 'Weathering steel, 2009', 'Please do not ride'], { bg: '#2a2a2a', fg: '#d8c9a3', font: 'Georgia, serif' }) }),
  );
  plaque.position.set(-39.4, y + 0.9, -44.2);
  plaque.rotation.y = THREE.MathUtils.degToRad(-35);
  g.add(plaque);
}

function buildRoofKicker(g: THREE.Group, phys: PhysicsWorld) {
  // A steel launch ramp someone "left" on the plaza, aimed at the pavilion roof.
  const y = PLAZA.h;
  const x = -50;
  const z0 = -30.6; // back (low end, south)
  const len = 2.6;
  const h = 1.25;
  const w = 3.2;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(len, 0);
  shape.lineTo(len, h);
  shape.quadraticCurveTo(len * 0.45, h * 0.2, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2); // local +x (up the ramp) → world -z (north)
  const mat = new THREE.MeshStandardMaterial({ color: '#8d949b', metalness: 0.7, roughness: 0.35 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z0);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  // Collider: sampled ramp surface as a convex hull.
  const pts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const u = len * t;
    const hh = h * t * t * 0.9 + h * 0.1 * t; // close to the curve
    for (const s of [-w / 2, w / 2]) {
      pts.push(x + s, y + hh, z0 - u);
      pts.push(x + s, y, z0 - u);
    }
  }
  const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
  if (hull) phys.addStatic(hull, 'kicker');
}

function buildSigns(g: THREE.Group, phys: PhysicsWorld) {
  const pole = MATS.darkSteel();
  const sign = (lines: string[], x: number, z: number, yawDeg: number, opts: Parameters<typeof signTexture>[1] & { y?: number; sw?: number; sh?: number } = {}) => {
    const sw = opts.sw ?? 2.2;
    const sh = opts.sh ?? 1.1;
    const y = opts.y ?? 0;
    const grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ map: signTexture(lines, opts), roughness: 0.6, side: THREE.DoubleSide }));
    board.position.y = y + 2.1;
    board.castShadow = true;
    grp.add(board);
    for (const px of [-sw / 2 + 0.1, sw / 2 - 0.1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2 + sh / 2, 8), pole);
      p.position.set(px, y + (2.2 + sh / 2) / 2 - 0.02, -0.03);
      grp.add(p);
    }
    grp.position.set(x, 0, z);
    grp.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    g.add(grp);
    phys.addStatic(RAPIER.ColliderDesc.cuboid(sw / 2, 0.8, 0.06).setTranslation(x, y + 0.8, z).setRotation(grp.quaternion), 'sign');
  };
  // At the spawn: the joke is facing you before you've touched the throttle.
  sign(['NO MOTORIZED', 'VEHICLES'], -61.5, -8.5, 90, { bg: '#f4f1e8', fg: '#b3201a', border: '#b3201a' });
  sign(
    ['SKATE AT YOUR OWN RISK', '1. HELMETS REQUIRED   2. NO BIKES', '3. NO SCOOTERS   4. NO THREE-WHEELERS', '5. WE MEAN IT. SPECIFICALLY YOU.'],
    -61.5,
    1.5,
    90,
    { bg: '#1f4a36', fg: '#f1ead7', w: 768, h: 384, sw: 2.8, sh: 1.4, font: 'Archivo Black, sans-serif' },
  );
  sign(['MUNICIPAL LIABILITY', 'SKATE PARK'], -46, -31.2, 180, { bg: '#e8e1cf', fg: '#222', border: '#222', y: PLAZA.h, sw: 3.2, sh: 1.3 });
  sign(['SLOW', 'CHILDREN AT PLAY'], 55, 30, -90, { bg: '#ffd23f', fg: '#111' });
  sign(['PLEASE REMAIN', 'SEATED'], 44.5, -20, -30, { bg: '#f4f1e8', fg: '#1b1b1b', border: '#e3242b' });
}

function buildGraffiti(g: THREE.Group) {
  // Codex-generated tags on vertical faces (plaza retaining walls, quarterpipe decks), stickers on posts.
  const tags = Array.from({ length: 8 }, (_, i) => tex(`assets/art/tags/tag-0${i + 1}.webp`));
  const decal = (t: THREE.Texture, w: number, h: number, pos: [number, number, number], yawDeg: number, opacity = 0.92) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.position.set(...pos);
    m.rotation.y = THREE.MathUtils.degToRad(yawDeg);
    m.receiveShadow = true;
    m.renderOrder = 2;
    g.add(m);
  };
  // Plaza south retaining wall (faces +z), z = -32
  decal(tags[6], 2.6, 1.5, [-56, 0.8, -31.96], 0);
  decal(tags[0], 2.2, 1.4, [-40, 0.78, -31.96], 0);
  decal(tags[3], 2.0, 1.3, [-36.2, 0.72, -31.96], 0);
  // Plaza east wall (faces +x), x = -34
  decal(tags[7], 2.2, 1.3, [-33.96, 0.8, -35], 90);
  decal(tags[1], 2.0, 1.2, [-33.96, 0.78, -48], 90);
  // Ledge / pad faces
  decal(tags[2], 1.4, 0.4, [30, 0.24, 10.61], 0);
  decal(tags[5], 1.4, 0.4, [40, 0.24, 9.39], 180);
  decal(tags[4], 1.0, 0.28, [51.61, 0.16, -2], 90);
  // Planter in the gap
  decal(tags[6], 2.0, 0.6, [29, 0.36, 32.01], 0);
  decal(tags[1], 2.0, 0.6, [29, 0.36, 27.99], 180);
}
