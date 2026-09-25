import * as THREE from 'three';
import { RAPIER, COL, type PhysicsWorld } from './world';
import { BONES, type RiderRig, type Side } from '../rider/rig';

// 12-body ragdoll built from the biker's *current* skeleton pose. Every joint is a ball joint with
// a velocity-level "muscle" pulling toward a target relative rotation plus a hard cone limit
// (stable at any stiffness, unlike raw torque springs on 2 kg forearms).
// Body frames == bone frames at activation, so syncing back to the skinned mesh is exact.

interface BodyDef {
  key: string;
  bone: string;
  end: string | null; // child bone that ends the capsule
  endOffset?: [number, number, number]; // extra length past `end` in bone-local space
  radius: number;
  mass: number;
  parent: string | null;
  /** Muscle strength multiplier and cone limit (radians) for the joint to the parent. */
  k: number;
  cone: number;
  shape?: 'capsule' | 'ball' | 'hips';
}

const DEFS: BodyDef[] = [
  { key: 'pelvis', bone: BONES.pelvis, end: null, radius: 0.13, mass: 13, parent: null, k: 1, cone: 1, shape: 'hips' },
  { key: 'torso', bone: BONES.spine, end: BONES.chest, radius: 0.14, mass: 13, parent: 'pelvis', k: 1.4, cone: 0.7 },
  { key: 'chest', bone: BONES.chest, end: BONES.neck, radius: 0.17, mass: 16, parent: 'torso', k: 1.4, cone: 0.55 },
  { key: 'head', bone: BONES.neck, end: BONES.head, endOffset: [0, 0.2, 0], radius: 0.13, mass: 6, parent: 'chest', k: 0.6, cone: 0.9, shape: 'ball' },
  ...(['left', 'right'] as Side[]).flatMap<BodyDef>((s) => [
    { key: `upperArm_${s}`, bone: BONES.upperArm(s), end: BONES.forearm(s), radius: 0.055, mass: 2.4, parent: 'chest', k: 0.35, cone: 1.9 },
    { key: `forearm_${s}`, bone: BONES.forearm(s), end: BONES.hand(s), endOffset: [0, 0.09, 0], radius: 0.05, mass: 2, parent: `upperArm_${s}`, k: 0.3, cone: 1.25 },
    { key: `thigh_${s}`, bone: BONES.thigh(s), end: BONES.shin(s), radius: 0.085, mass: 9, parent: 'pelvis', k: 0.9, cone: 1.35 },
    { key: `shin_${s}`, bone: BONES.shin(s), end: BONES.foot(s), endOffset: [0, 0.12, 0], radius: 0.065, mass: 5, parent: `thigh_${s}`, k: 0.6, cone: 1.2 },
  ]),
];

interface Part {
  def: BodyDef;
  body: RAPIER.RigidBody;
  boneObj: THREE.Bone;
  /** Hand/foot tip in body-local space (for grips and scraping). */
  tip: THREE.Vector3;
  len: number;
}

interface Muscle {
  parent: Part;
  child: Part;
  target: THREE.Quaternion; // desired parent⁻¹·child
  rest: THREE.Quaternion; // relative rotation at activation
  k: number;
  cone: number;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Ragdoll {
  parts = new Map<string, Part>();
  muscles: Muscle[] = [];
  grips: Partial<Record<Side, RAPIER.ImpulseJoint>> = {};
  /** Global muscle tone: ~0.3 hanging on (trying), ~0.07 limp, ~0.02 knocked silly. */
  tone = 0.3;
  private order: Part[] = [];

  constructor(private phys: PhysicsWorld, private rig: RiderRig) {}

  get active() {
    return this.parts.size > 0;
  }

  /**
   * Build bodies from the rig's current world pose. `velAt(p)` gives the inherited velocity of a
   * world point (vehicle linear + angular motion), so release is momentum-consistent.
   */
  activate(velAt: (p: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3, extraVel?: (key: string) => THREE.Vector3 | null) {
    this.deactivate();
    const w = this.phys.world;
    this.rig.root.updateMatrixWorld(true);
    for (const d of DEFS) {
      const bone = this.rig.bone(d.bone);
      const P0 = bone.getWorldPosition(new THREE.Vector3());
      const Q0 = bone.getWorldQuaternion(new THREE.Quaternion());
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(P0.x, P0.y, P0.z)
        .setRotation(Q0)
        .setLinearDamping(0.05)
        .setAngularDamping(0.9)
        .setCcdEnabled(d.key === 'pelvis' || d.key === 'chest' || d.key === 'head')
        .setCanSleep(false);
      const body = w.createRigidBody(bd);
      const inv = Q0.clone().invert();
      let tipLocal = new THREE.Vector3(0, 0.2, 0);
      let len = 0.2;
      let cd: RAPIER.ColliderDesc;
      if (d.shape === 'hips') {
        const l = this.rig.bone(BONES.thigh('left')).getWorldPosition(new THREE.Vector3()).sub(P0).applyQuaternion(inv);
        const r = this.rig.bone(BONES.thigh('right')).getWorldPosition(new THREE.Vector3()).sub(P0).applyQuaternion(inv);
        const mid = l.clone().add(r).multiplyScalar(0.5);
        const dir = r.clone().sub(l);
        const hl = dir.length() / 2;
        cd = RAPIER.ColliderDesc.capsule(Math.max(0.02, hl), d.radius)
          .setTranslation(mid.x, mid.y + 0.04, mid.z)
          .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
        tipLocal = mid;
      } else {
        const endBone = d.end ? this.rig.bone(d.end) : null;
        const P1 = endBone ? endBone.getWorldPosition(new THREE.Vector3()) : P0.clone().add(new THREE.Vector3(0, 0.2, 0).applyQuaternion(Q0));
        const local = P1.sub(P0).applyQuaternion(inv);
        if (d.endOffset) local.add(new THREE.Vector3(...d.endOffset).applyQuaternion(endBone ? endBone.quaternion : new THREE.Quaternion()));
        len = Math.max(0.05, local.length());
        tipLocal = local.clone();
        if (d.shape === 'ball') {
          cd = RAPIER.ColliderDesc.ball(d.radius).setTranslation(local.x * 0.6, local.y * 0.6, local.z * 0.6);
        } else {
          const hh = Math.max(0.01, len / 2 - d.radius * 0.6);
          cd = RAPIER.ColliderDesc.capsule(hh, d.radius)
            .setTranslation(local.x / 2, local.y / 2, local.z / 2)
            .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), local.clone().normalize()));
        }
      }
      cd.setMass(d.mass).setFriction(0.7).setRestitution(0.1).setCollisionGroups(COL.rider);
      w.createCollider(cd, body);
      // Inherit the motion he actually had.
      const v = velAt(P0, new THREE.Vector3());
      const ex = extraVel?.(d.key);
      if (ex) v.add(ex);
      body.setLinvel(v, true);
      const part: Part = { def: d, body, boneObj: bone, tip: tipLocal, len };
      this.parts.set(d.key, part);
      this.order.push(part);
    }
    // Joints + muscles
    for (const part of this.order) {
      const d = part.def;
      if (!d.parent) continue;
      const parent = this.parts.get(d.parent)!;
      const pP = parent.body.translation();
      const pQ = parent.body.rotation();
      const cP = part.body.translation();
      const cQ = part.body.rotation();
      // Anchor at the child's origin, expressed in the parent's frame.
      const a1 = new THREE.Vector3(cP.x - pP.x, cP.y - pP.y, cP.z - pP.z).applyQuaternion(new THREE.Quaternion(pQ.x, pQ.y, pQ.z, pQ.w).invert());
      const jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 });
      const j = w.createImpulseJoint(jd, parent.body, part.body, true);
      j.setContactsEnabled(false);
      const rel = new THREE.Quaternion(pQ.x, pQ.y, pQ.z, pQ.w).invert().multiply(new THREE.Quaternion(cQ.x, cQ.y, cQ.z, cQ.w));
      this.muscles.push({ parent, child: part, target: rel.clone(), rest: rel.clone(), k: d.k, cone: d.cone });
    }
  }

  part(key: string) {
    return this.parts.get(key);
  }

  /** World position of a limb tip (hand/foot/head centre). */
  tipWorld(key: string, out = new THREE.Vector3()) {
    const p = this.parts.get(key)!;
    const t = p.body.translation();
    const r = p.body.rotation();
    return out.copy(p.tip).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_v.set(t.x, t.y, t.z));
  }

  /** Clamp a hand to a point on another body (the handlebar grip). */
  grip(side: Side, other: RAPIER.RigidBody, otherLocal: THREE.Vector3) {
    this.release(side);
    const fa = this.parts.get(`forearm_${side}`)!;
    const jd = RAPIER.JointData.spherical({ x: fa.tip.x, y: fa.tip.y, z: fa.tip.z }, { x: otherLocal.x, y: otherLocal.y, z: otherLocal.z });
    const j = this.phys.world.createImpulseJoint(jd, fa.body, other, true);
    j.setContactsEnabled(false);
    this.grips[side] = j;
  }

  release(side: Side) {
    const j = this.grips[side];
    if (j) {
      if (this.phys.world.getImpulseJoint(j.handle)) this.phys.world.removeImpulseJoint(j, true);
      delete this.grips[side];
    }
  }

  gripCount() {
    return (this.grips.left ? 1 : 0) + (this.grips.right ? 1 : 0);
  }

  /** Set a muscle target as an offset from the activation pose (e.g. straighten the elbows to reach). */
  setTarget(childKey: string, offset: THREE.Quaternion | null) {
    const m = this.muscles.find((x) => x.child.def.key === childKey);
    if (!m) return;
    if (!offset) m.target.copy(m.rest);
    else m.target.copy(m.rest).multiply(offset);
  }

  /** Apply muscle impulses. Call once per fixed step before world.step(). */
  step(dt: number) {
    if (!this.active) return;
    for (const m of this.muscles) {
      const A = m.parent.body;
      const B = m.child.body;
      const ra = A.rotation();
      const rb = B.rotation();
      _q.set(ra.x, ra.y, ra.z, ra.w);
      _q2.set(rb.x, rb.y, rb.z, rb.w);
      const rel = _q.clone().invert().multiply(_q2);
      const err = m.target.clone().multiply(rel.invert()); // rotation (parent frame) from current → target
      if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
      const angle = 2 * Math.acos(Math.min(1, err.w));
      const s = Math.sqrt(Math.max(1e-9, 1 - err.w * err.w));
      const axis = _v.set(err.x / s, err.y / s, err.z / s).applyQuaternion(_q); // world
      const wa = A.angvel();
      const wb = B.angvel();
      const wRel = _w.set(wb.x - wa.x, wb.y - wa.y, wb.z - wa.z);
      // Desired relative angular velocity: toward the target, much harder past the cone limit.
      const over = Math.max(0, angle - m.cone);
      const kp = 9 * this.tone * m.k + over * 40;
      const want = _v2.copy(axis).multiplyScalar(angle > 1e-4 ? angle * kp : 0);
      const gain = Math.min(0.9, 0.35 * this.tone * m.k + (over > 0 ? 0.6 : 0));
      const dw = want.sub(wRel).multiplyScalar(gain);
      // Effective inertia ~ the lighter body's
      const I = Math.min(inertiaOf(A), inertiaOf(B));
      const imp = dw.multiplyScalar(I);
      B.applyTorqueImpulse({ x: imp.x, y: imp.y, z: imp.z }, true);
      A.applyTorqueImpulse({ x: -imp.x, y: -imp.y, z: -imp.z }, true);
    }
    void dt;
  }

  /** Drive the skinned skeleton from the bodies. The rig root must sit at world identity. */
  sync() {
    if (!this.active) return;
    for (const part of this.order) {
      const t = part.body.translation();
      const r = part.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      const b = part.boneObj;
      if (part.def.key === 'pelvis') {
        // Pelvis parent (driver_rig) is identity in world when ragdolling.
        const parentInv = new THREE.Matrix4().copy(b.parent!.matrixWorld).invert();
        b.position.set(t.x, t.y, t.z).applyMatrix4(parentInv);
      }
      b.parent!.getWorldQuaternion(_q2);
      b.quaternion.copy(_q2.invert().multiply(_q));
      b.updateMatrixWorld(true);
    }
  }

  pelvisPos(out = new THREE.Vector3()) {
    const t = this.parts.get('pelvis')!.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  pelvisVel(out = new THREE.Vector3()) {
    const v = this.parts.get('pelvis')!.body.linvel();
    return out.set(v.x, v.y, v.z);
  }

  maxSpeed() {
    let m = 0;
    for (const p of this.order) {
      const v = p.body.linvel();
      m = Math.max(m, Math.hypot(v.x, v.y, v.z));
    }
    return m;
  }

  setCollisionGroups(g: number) {
    for (const p of this.order) {
      for (let i = 0; i < p.body.numColliders(); i++) p.body.collider(i).setCollisionGroups(g);
    }
  }

  deactivate() {
    const w = this.phys.world;
    this.release('left');
    this.release('right');
    for (const p of this.order) w.removeRigidBody(p.body);
    this.parts.clear();
    this.order = [];
    this.muscles = [];
  }
}

function inertiaOf(b: RAPIER.RigidBody) {
  const i = b.principalInertia();
  return Math.max(0.004, (i.x + i.y + i.z) / 3);
}
