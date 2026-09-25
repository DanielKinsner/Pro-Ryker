import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// The owner-purchased biker (60-joint skeleton). Bones point along local +Y toward their child.
// Rider space == vehicle model space (fit-ryker.json basis): +X right, +Y up, -Z forward.

export interface RiderFit {
  restPose: Record<string, { t: number[]; r: number[] }>;
  arms: Record<'left' | 'right', { wrist: number[]; contact: number[]; elbow: number[]; poleHint: number[]; shoulder: number[] }>;
  feet: Record<'left' | 'right', { anchor: number[] }>;
  legs: Record<'left' | 'right', { pole: number[] }>;
  eye: number[];
}

export type Side = 'left' | 'right';

export const BONES = {
  pelvis: 'driver_pelvis',
  spine: 'driver_spine',
  spine2: 'driver_spine_02',
  chest: 'driver_chest',
  neck: 'driver_neck',
  head: 'driver_head',
  clavicle: (s: Side) => `driver_clavicle_${s}`,
  upperArm: (s: Side) => `driver_upper_arm_${s}`,
  forearm: (s: Side) => `driver_forearm_${s}`,
  hand: (s: Side) => `driver_hand_${s}`,
  thigh: (s: Side) => `driver_thigh_${s}`,
  shin: (s: Side) => `driver_shin_${s}`,
  foot: (s: Side) => `driver_foot_${s}`,
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export class RiderRig {
  root: THREE.Object3D; // driver_root
  bones = new Map<string, THREE.Bone>();
  rest = new Map<string, { t: THREE.Vector3; r: THREE.Quaternion }>();
  helmet: THREE.SkinnedMesh | null = null;
  meshes: THREE.SkinnedMesh[] = [];
  headScale = 1;

  constructor(gltf: GLTF, public fit: RiderFit) {
    this.root = cloneSkinned(gltf.scene);
    this.root.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) this.bones.set(b.name, b);
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.clone());
        m.material = Array.isArray(m.material) ? mats : mats[0];
        this.meshes.push(m);
        const name = (mats[0] as THREE.Material).name;
        if (name === 'Biker_Helmet') this.helmet = m;
      }
    });
    // Seated rest pose from the measured Ryker fit.
    for (const [name, p] of Object.entries(fit.restPose)) {
      const b = this.bones.get(name);
      if (!b) continue;
      b.position.fromArray(p.t);
      b.quaternion.fromArray(p.r);
    }
    for (const [name, b] of this.bones) this.rest.set(name, { t: b.position.clone(), r: b.quaternion.clone() });
    this.root.updateMatrixWorld(true);
  }

  bone(name: string) {
    const b = this.bones.get(name);
    if (!b) throw new Error(`rider bone missing: ${name}`);
    return b;
  }

  /** Reset every bone to the seated rest pose. */
  resetPose() {
    for (const [name, r] of this.rest) {
      const b = this.bones.get(name)!;
      b.position.copy(r.t);
      b.quaternion.copy(r.r);
    }
    this.applyHeadScale();
  }

  applyHeadScale() {
    const h = this.bones.get(BONES.head);
    if (h) h.scale.setScalar(this.headScale);
  }

  /** World-space rotation of a bone's parent. */
  private parentWorldQuat(b: THREE.Object3D, out: THREE.Quaternion) {
    if (b.parent) b.parent.getWorldQuaternion(out);
    else out.identity();
    return out;
  }

  /** Set a bone's world rotation (keeps local translation). */
  setWorldQuat(b: THREE.Object3D, q: THREE.Quaternion) {
    this.parentWorldQuat(b, _q2).invert();
    b.quaternion.copy(_q2.multiply(q));
    b.updateMatrixWorld(true);
  }

  /** Rotate a bone (world space) so its +Y axis points along dir, with minimal twist change. */
  aimBone(b: THREE.Object3D, dirWorld: THREE.Vector3) {
    b.getWorldQuaternion(_q);
    const cur = _a.copy(Y).applyQuaternion(_q).normalize();
    const want = _b.copy(dirWorld).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
    _q.premultiply(delta);
    this.setWorldQuat(b, _q);
  }

  /**
   * Analytic two-bone IK in world space. upper → lower → end (end = child joint of lower).
   * pole = world point the middle joint should bend toward.
   */
  twoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
    const S = upper.getWorldPosition(new THREE.Vector3());
    const L1 = lower.position.length() * worldScale(upper);
    const L2 = end.position.length() * worldScale(lower);
    const toT = _c.copy(target).sub(S);
    let d = toT.length();
    const dMax = (L1 + L2) * 0.999;
    const dMin = Math.abs(L1 - L2) + 1e-3;
    d = Math.max(dMin, Math.min(dMax, d));
    const dir = toT.normalize();
    // Bend plane from the pole.
    const toP = _d.copy(pole).sub(S);
    const bendN = toP.sub(dir.clone().multiplyScalar(toP.dot(dir)));
    if (bendN.lengthSq() < 1e-8) bendN.set(0, 0, 1).cross(dir);
    bendN.normalize();
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const elbow = S.clone().addScaledVector(dir, Math.cos(a) * L1).addScaledVector(bendN, Math.sin(a) * L1);
    this.aimBone(upper, elbow.clone().sub(S));
    const E = lower.getWorldPosition(new THREE.Vector3());
    const T = S.clone().addScaledVector(dir, d);
    this.aimBone(lower, T.sub(E));
  }

  /** World position of a point given in rider (vehicle model) space. */
  toWorld(v: THREE.Vector3 | number[], out = new THREE.Vector3()) {
    if (Array.isArray(v)) out.fromArray(v);
    else out.copy(v);
    return this.root.localToWorld(out);
  }
}

function worldScale(o: THREE.Object3D) {
  o.getWorldScale(_a);
  return _a.y;
}

void _m;
