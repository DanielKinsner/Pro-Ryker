import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VEHICLE } from '../config/tuning';
import type { Vehicle } from '../physics/vehicle';

// Dan's Ryker 900 (from the Three-Wheel Tour source via SEND IT's runtime import).
// Model space == physics body space: +X right, +Y up, -Z forward, origin on the ground mid-wheelbase.

export interface RykerVisual {
  root: THREE.Group; // follows the physics body
  model: THREE.Object3D;
  steer: THREE.Object3D; // handlebar assembly
  steerRest: THREE.Quaternion;
  front: { steer: THREE.Object3D; spin: THREE.Object3D; restY: number; rest: THREE.Quaternion }[];
  rearArm: THREE.Group;
  rearSpin: THREE.Object3D;
  armLength: number;
  paint: THREE.MeshStandardMaterial[];
  setMods(on: boolean): void;
  update(v: Vehicle, alpha: number): void;
}

const STEER_AXIS = new THREE.Vector3(0, 1, 0.28).normalize(); // steering column rake

export function buildRyker(gltf: GLTF): RykerVisual {
  const root = new THREE.Group();
  root.name = 'ryker';
  const model = gltf.scene.clone(true);
  root.add(model);
  const paint: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
      const c = (mat as THREE.MeshStandardMaterial).clone();
      if (c.name === 'Ryker_Paint') paint.push(c);
      c.envMapIntensity = 1.1;
      return c;
    });
    m.material = Array.isArray(m.material) ? mats : mats[0];
  });
  const find = (n: string) => {
    const o = model.getObjectByName(n);
    if (!o) throw new Error(`Ryker model missing node ${n}`);
    return o;
  };
  const modNodes = ['ryker_mod_shocks', 'ryker_mod_exhaust', 'ryker_mod_body'].map((n) => model.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  const stockNodes = ['stock_ryker_shocks', 'stock_ryker_exhaust', 'stock_ryker_shocks_rear', 'stock_ryker_body']
    .map((n) => model.getObjectByName(n))
    .filter(Boolean) as THREE.Object3D[];
  const setMods = (on: boolean) => {
    for (const n of modNodes) n.visible = on;
    for (const n of stockNodes) n.visible = !on;
    // The mod body replaces only the front fascia; keep the stock body visible either way.
    const sb = model.getObjectByName('stock_ryker_body');
    if (sb) sb.visible = !on;
  };
  setMods(false);

  const front = ['front_left_steer', 'front_right_steer'].map((n, i) => {
    const steer = find(n);
    const spin = find(i === 0 ? 'front_left_spin' : 'front_right_spin');
    return { steer, spin, restY: steer.position.y, rest: steer.quaternion.clone() };
  });
  // Rear swing arm pivot
  const pivotY = 0.3;
  const pivotZ = 0.12;
  const rearArm = new THREE.Group();
  rearArm.position.set(0, pivotY, pivotZ);
  model.add(rearArm);
  model.updateMatrixWorld(true);
  const carrier = find('rear_carrier');
  rearArm.attach(carrier);
  const rearSpin = find('rear_spin');
  const armLength = Math.hypot(0.285 - pivotY, 0.854 - pivotZ);
  const steer = find('steering_control');

  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();

  return {
    root,
    model,
    steer,
    steerRest: steer.quaternion.clone(),
    front,
    rearArm,
    rearSpin,
    armLength,
    paint,
    setMods,
    update(v: Vehicle, alpha: number) {
      _p.lerpVectors(v.prevPos, v.pos, alpha);
      _q.slerpQuaternions(v.prevQuat, v.quat, alpha);
      root.position.copy(_p);
      root.quaternion.copy(_q);
      // Front wheels: steer + suspension travel (wheel centre sits on the ground contact).
      const steerA = v.steerAngle;
      for (let i = 0; i < 2; i++) {
        const w = v.wheels[i];
        const f = front[i];
        const drop = w.contact ? VEHICLE.suspensionRest - w.compression : VEHICLE.suspensionRest;
        f.steer.position.y = f.restY - THREE.MathUtils.clamp(drop, -0.14, 0.16);
        f.steer.quaternion.copy(f.rest).premultiply(_q.setFromAxisAngle(STEER_AXIS, -steerA * 0.9));
        f.spin.rotation.x = w.spin;
      }
      const r = v.wheels[2];
      const dropR = r.contact ? VEHICLE.suspensionRest - r.compression : VEHICLE.suspensionRest;
      rearArm.rotation.x = -Math.asin(THREE.MathUtils.clamp(-dropR / armLength, -0.6, 0.6));
      rearSpin.rotation.x = r.spin;
      steer.quaternion.copy(this.steerRest).premultiply(_q.setFromAxisAngle(STEER_AXIS, -steerA * 0.55));
    },
  };
}
