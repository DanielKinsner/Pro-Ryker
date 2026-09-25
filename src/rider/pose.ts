import * as THREE from 'three';
import { BONES, type RiderRig, type Side } from './rig';

// A pose is a recipe of targets in vehicle space (pelvis, spine bend, hands, feet, poles).
// Poses blend by lerping the numbers; the IK solver then bends the real skeleton to match.

export interface Limb {
  /** 1 = on the grip / peg, 0 = at `pos`. */
  attach: number;
  pos: THREE.Vector3;
  pole: THREE.Vector3;
}

export interface PoseParams {
  pelvis: THREE.Vector3; // offset from the seated pelvis (vehicle space)
  pelvisRot: THREE.Vector3; // extra rotation (x pitch fwd+, y yaw, z roll) radians
  spine: THREE.Vector3; // total bend over three spine bones (x fwd+, y twist, z side)
  head: THREE.Vector3; // extra head rotation
  hand: Record<Side, Limb>;
  foot: Record<Side, Limb>;
  /** Show the phone prop in the right hand. */
  phone: number;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function cloneParams(p: PoseParams): PoseParams {
  return {
    pelvis: p.pelvis.clone(),
    pelvisRot: p.pelvisRot.clone(),
    spine: p.spine.clone(),
    head: p.head.clone(),
    hand: {
      left: { attach: p.hand.left.attach, pos: p.hand.left.pos.clone(), pole: p.hand.left.pole.clone() },
      right: { attach: p.hand.right.attach, pos: p.hand.right.pos.clone(), pole: p.hand.right.pole.clone() },
    },
    foot: {
      left: { attach: p.foot.left.attach, pos: p.foot.left.pos.clone(), pole: p.foot.left.pole.clone() },
      right: { attach: p.foot.right.attach, pos: p.foot.right.pos.clone(), pole: p.foot.right.pole.clone() },
    },
    phone: p.phone,
  };
}

/** out = lerp(a, b, t) (out may alias a). */
export function lerpParams(out: PoseParams, a: PoseParams, b: PoseParams, t: number) {
  out.pelvis.lerpVectors(a.pelvis, b.pelvis, t);
  out.pelvisRot.lerpVectors(a.pelvisRot, b.pelvisRot, t);
  out.spine.lerpVectors(a.spine, b.spine, t);
  out.head.lerpVectors(a.head, b.head, t);
  for (const s of ['left', 'right'] as Side[]) {
    for (const k of ['hand', 'foot'] as const) {
      const o = out[k][s];
      o.attach = a[k][s].attach + (b[k][s].attach - a[k][s].attach) * t;
      o.pos.lerpVectors(a[k][s].pos, b[k][s].pos, t);
      o.pole.lerpVectors(a[k][s].pole, b[k][s].pole, t);
    }
  }
  out.phone = a.phone + (b.phone - a.phone) * t;
  return out;
}

// ---------------------------------------------------------------- library

export type PoseName = 'seated' | 'superman' | 'nohander' | 'cancan' | 'seatstand' | 'selfie' | 'coffin' | 'crouch' | 'unsettled' | 'hangL' | 'hangR';

export function makePoses(rig: RiderRig): Record<PoseName, PoseParams> {
  const f = rig.fit;
  const hand = (s: Side): Limb => ({ attach: 1, pos: V(...(f.arms[s].wrist as [number, number, number])), pole: V(...(f.arms[s].poleHint as [number, number, number])) });
  const foot = (s: Side): Limb => ({ attach: 1, pos: V(...(f.feet[s].anchor as [number, number, number])), pole: V(...(f.legs[s].pole as [number, number, number])) });
  const seated: PoseParams = {
    pelvis: V(),
    pelvisRot: V(),
    spine: V(),
    head: V(),
    hand: { left: hand('left'), right: hand('right') },
    foot: { left: foot('left'), right: foot('right') },
    phone: 0,
  };
  const P = (mod: (p: PoseParams) => void) => {
    const p = cloneParams(seated);
    mod(p);
    return p;
  };
  function hangSide(x: number) {
    return P((p) => {
      p.pelvis.set(0.86 * x, -0.32, 0.46);
      p.pelvisRot.set(0.95, -0.25 * x, -0.55 * x);
      p.spine.set(0.25, 0, -0.25 * x);
      p.head.set(-0.45, 0.2 * x, 0);
      p.foot.left.attach = 0;
      p.foot.left.pos.set(0.62 * x + (x > 0 ? 0.1 : -0.1), 0.3, 1.62);
      p.foot.left.pole.set(0.9 * x, 0.2, 0.6);
      p.foot.right.attach = 0;
      p.foot.right.pos.set(0.95 * x, 0.3, 1.48);
      p.foot.right.pole.set(1.3 * x, 0.2, 0.6);
    });
  }
  return {
    seated,
    // Crouch before an ollie: compress down over the bars.
    crouch: P((p) => {
      p.pelvis.set(0, -0.08, -0.05);
      p.spine.set(0.45, 0, 0);
      p.head.set(-0.3, 0, 0);
    }),
    // THE UNLICENSED SUPERMAN: hips leave the seat, body horizontal behind the bars, legs trailing.
    superman: P((p) => {
      p.pelvis.set(0, 0.42, 0.62);
      p.pelvisRot.set(1.25, 0, 0);
      p.spine.set(-0.15, 0, 0);
      p.head.set(-0.9, 0, 0);
      for (const s of ['left', 'right'] as Side[]) {
        const x = s === 'left' ? -0.22 : 0.22;
        p.foot[s].attach = 0;
        p.foot[s].pos.set(x, 1.35, 1.75);
        p.foot[s].pole.set(x * 2, 0.4, 1.2);
      }
    }),
    // NO-HANDER: both arms up, leaning back, pure confidence.
    nohander: P((p) => {
      p.spine.set(-0.35, 0, 0);
      p.head.set(-0.25, 0, 0);
      p.pelvis.set(0, 0.04, 0.05);
      p.hand.left.attach = 0;
      p.hand.left.pos.set(-0.55, 1.95, 0.2);
      p.hand.left.pole.set(-1.2, 1.2, 0.6);
      p.hand.right.attach = 0;
      p.hand.right.pos.set(0.55, 1.95, 0.2);
      p.hand.right.pole.set(1.2, 1.2, 0.6);
    }),
    // CAN-CAN: one leg kicked across and out the other side.
    cancan: P((p) => {
      p.pelvis.set(-0.1, 0.16, 0.08);
      p.pelvisRot.set(-0.15, 0.25, 0.35);
      p.spine.set(-0.2, -0.2, 0.3);
      p.head.set(0.1, -0.3, 0);
      // Left leg kicked high over the tank and out the right side.
      p.foot.left.attach = 0;
      p.foot.left.pos.set(0.95, 1.45, -0.75);
      p.foot.left.pole.set(0.4, 2.1, -1.4);
    }),
    // SEAT STAND: standing on the seat, surfing it, arms out.
    seatstand: P((p) => {
      p.pelvis.set(0, 0.72, 0.1);
      p.spine.set(0.1, 0, 0);
      p.head.set(0.1, 0, 0);
      for (const s of ['left', 'right'] as Side[]) {
        const x = s === 'left' ? -1 : 1;
        p.foot[s].attach = 0;
        p.foot[s].pos.set(0.16 * x, 0.72, 0.42);
        p.foot[s].pole.set(0.5 * x, 1.2, -0.6);
        p.hand[s].attach = 0;
        p.hand[s].pos.set(0.85 * x, 1.85, 0.3);
        p.hand[s].pole.set(0.8 * x, 1.2, 0.9);
      }
    }),
    // THE CONTENT CREATOR: one hand films a selfie mid-air.
    selfie: P((p) => {
      p.spine.set(-0.05, 0.35, 0);
      p.head.set(0.05, 0.45, 0);
      p.hand.right.attach = 0;
      p.hand.right.pos.set(0.42, 1.52, -0.42);
      p.hand.right.pole.set(1.1, 1.0, 0.2);
      p.phone = 1;
    }),
    // COFFIN: lying back flat along the seat, arms straight to the bars.
    coffin: P((p) => {
      p.pelvis.set(0, 0.06, 0.2);
      p.pelvisRot.set(-0.9, 0, 0);
      p.spine.set(-0.6, 0, 0);
      p.head.set(0.3, 0, 0);
    }),
    // Thrown off the side, still holding both grips: hips beside the rear wheel, torso stretched
    // up to the bars, boots trailing on the concrete (the clip's drag). Entry pose before physics.
    hangR: hangSide(1),
    hangL: hangSide(-1),
    // Unsettled (scaled by strain in the controller): hips slid, a boot off the peg.
    unsettled: P((p) => {
      p.pelvis.set(0.16, 0.16, 0.1);
      p.pelvisRot.set(0.1, 0.15, -0.3);
      p.spine.set(0.25, -0.2, 0.35);
      p.head.set(-0.2, -0.3, 0.2);
      p.foot.right.attach = 0;
      p.foot.right.pos.set(0.72, 0.18, 0.1);
      p.foot.right.pole.set(1.2, 0.8, -0.6);
    }),
  };
}

// ---------------------------------------------------------------- solver

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();

export interface SolveExtras {
  /** Handlebar steer rotation (world wrist targets rotate with the bars). */
  steerQ: THREE.Quaternion;
  steerPivot: THREE.Vector3;
  /** Secondary motion: lean (x fwd, z side) and pelvis bob, radians/metres. */
  lean: THREE.Vector3;
  bob: number;
}

export function solvePose(rig: RiderRig, p: PoseParams, x: SolveExtras) {
  rig.resetPose();
  const pelvis = rig.bone(BONES.pelvis);
  const rest = rig.rest.get(BONES.pelvis)!;
  pelvis.position.copy(rest.t).add(p.pelvis);
  pelvis.position.y += x.bob;
  // +X rotation tips the rig backward, so 'forward' params are negated.
  _q.setFromEuler(_e.set(-(p.pelvisRot.x + x.lean.x * 0.3), p.pelvisRot.y, p.pelvisRot.z + x.lean.z * 0.3, 'YXZ'));
  pelvis.quaternion.copy(rest.r).premultiply(_q);
  const spineBones = [BONES.spine, BONES.spine2, BONES.chest];
  for (const n of spineBones) {
    const b = rig.bone(n);
    _q.setFromEuler(_e.set(-(p.spine.x + x.lean.x) / 3, p.spine.y / 3, (p.spine.z + x.lean.z) / 3, 'YXZ'));
    b.quaternion.copy(rig.rest.get(n)!.r).multiply(_q);
  }
  for (const n of [BONES.neck, BONES.head]) {
    const b = rig.bone(n);
    _q.setFromEuler(_e.set(-(p.head.x - x.lean.x * 0.6) / 2, p.head.y / 2, (p.head.z - x.lean.z * 0.5) / 2, 'YXZ'));
    b.quaternion.copy(rig.rest.get(n)!.r).multiply(_q);
  }
  rig.root.updateMatrixWorld(true);

  for (const s of ['left', 'right'] as Side[]) {
    const h = p.hand[s];
    // Grip wrist target rotates with the handlebar.
    const grip = _v.fromArray(rig.fit.arms[s].wrist).sub(x.steerPivot).applyQuaternion(x.steerQ).add(x.steerPivot);
    _t.copy(h.pos).lerp(grip, h.attach);
    rig.toWorld(_t, _t);
    rig.toWorld(h.pole, _p);
    rig.twoBone(rig.bone(BONES.upperArm(s)), rig.bone(BONES.forearm(s)), rig.bone(BONES.hand(s)), _t, _p);
  }
  for (const s of ['left', 'right'] as Side[]) {
    const f = p.foot[s];
    _t.fromArray(rig.fit.feet[s].anchor).lerp(f.pos, 1 - f.attach);
    rig.toWorld(_t, _t);
    rig.toWorld(f.pole, _p);
    rig.twoBone(rig.bone(BONES.thigh(s)), rig.bone(BONES.shin(s)), rig.bone(BONES.foot(s)), _t, _p);
  }
}
