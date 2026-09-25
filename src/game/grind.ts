import * as THREE from 'three';
import type { Vehicle } from '../physics/vehicle';
import type { GrindRail } from '../park/rails';
import { SIM } from '../config/tuning';

// Rail lock-on. The Ryker's belly rides the rail (kinematic while grinding), balance with A/D.

export type GrindStyle = 'grind' | 'slide' | 'crooked';

const BELLY = 0.3; // model-space height of the chassis belly above the ground contact plane

const NAMES: Record<string, Record<GrindStyle, string>> = {
  rail: { grind: 'CHASSIS GRIND', slide: 'CHASSIS BOARDSLIDE', crooked: 'CROOKED CHASSIS' },
  ledge: { grind: 'LEDGE GRIND', slide: 'LEDGE SLIDE', crooked: 'CROOKED LEDGE' },
  bench: { grind: 'BENCH PRESS', slide: 'BENCH WARMER', crooked: 'CROOKED BENCH' },
  coping: { grind: 'COPING GRIND', slide: 'ROCK AND ROLL-OVER', crooked: 'COPING SCRAPE' },
  roof: { grind: 'ROOF GRIND', slide: 'GUTTER SLIDE', crooked: 'CROOKED GUTTER' },
  sculpture: { grind: 'PUBLIC ART GRIND', slide: 'VANDAL SLIDE', crooked: 'CROOKED ART' },
};

export interface GrindState {
  rail: GrindRail;
  s: number;
  dir: 1 | -1;
  speed: number;
  style: GrindStyle;
  yawOffset: number; // vehicle yaw relative to rail tangent (rad)
  balance: number;
  balanceVel: number;
  t: number;
  distance: number;
  name: string;
}

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export function findRail(v: Vehicle, rails: GrindRail[]): { rail: GrindRail; s: number } | null {
  const probe = v.pos.clone().addScaledVector(v.up, BELLY);
  let best: { rail: GrindRail; s: number; score: number } | null = null;
  for (const r of rails) {
    const c = r.closestXZ(probe);
    if (c.dxz > 1.15) continue;
    const dy = v.pos.y - c.y; // vehicle ground plane relative to rail top
    if (dy < -0.62 || dy > 2.2) continue;
    // Coming down onto it or level with it — not climbing away above it.
    if (dy > 0.4 && v.vel.y > 2) continue;
    r.at(c.s, _p, _t);
    const along = Math.abs(v.vel.x * _t.x + v.vel.z * _t.z + v.vel.y * _t.y);
    if (along < 2.2) continue;
    const score = c.dxz + Math.max(0, dy) * 0.3;
    if (!best || score < best.score) best = { rail: r, s: c.s, score };
  }
  return best ? { rail: best.rail, s: best.s } : null;
}

export function startGrind(v: Vehicle, rail: GrindRail, s: number): GrindState {
  rail.at(s, _p, _t);
  const vAlong = v.vel.dot(_t);
  const dir: 1 | -1 = vAlong >= 0 ? 1 : -1;
  // Heading vs rail tangent (horizontal)
  const fh = new THREE.Vector3(v.fwd.x, 0, v.fwd.z).normalize();
  const th = new THREE.Vector3(_t.x, 0, _t.z).normalize().multiplyScalar(dir);
  let ang = Math.atan2(th.clone().cross(fh).y, th.dot(fh)); // signed, fwd relative to travel
  const a = Math.abs(ang);
  let style: GrindStyle;
  let snap: number;
  if (a < 0.52 || a > Math.PI - 0.52) {
    style = 'grind';
    snap = a < Math.PI / 2 ? 0 : Math.PI;
  } else if (a > 1.05 && a < Math.PI - 1.05) {
    style = 'slide';
    snap = Math.PI / 2;
  } else {
    style = 'crooked';
    snap = a < Math.PI / 2 ? Math.PI / 4 : (3 * Math.PI) / 4;
  }
  ang = Math.sign(ang || 1) * snap;
  const names = NAMES[rail.kind] ?? NAMES.rail;
  const name = style === 'grind' && snap === Math.PI ? `FAKIE ${names.grind}` : names[style];
  v.setKinematic(true);
  return {
    rail,
    s,
    dir,
    speed: Math.max(4, Math.abs(vAlong) * 0.95),
    style,
    yawOffset: ang,
    balance: Math.sin(s * 12.9898 + rail.total) * 0.05, // deterministic nudge
    balanceVel: 0,
    t: 0,
    distance: 0,
    name,
  };
}

/** Advance the grind one fixed step. Returns 'end' at the rail end, 'fall' if balance is lost. */
export function stepGrind(g: GrindState, v: Vehicle, steer: number, dt: number, perfectBalance: boolean): 'ok' | 'end' | 'fall' {
  g.t += dt;
  const { rail } = g;
  rail.at(g.s, _p, _t);
  // Gravity along the rail, a little friction.
  const slope = _t.y * g.dir;
  g.speed += -SIM.gravity * -slope * dt * 0.9 - 1.2 * dt;
  g.speed = Math.max(1.2, Math.min(28, g.speed));
  const ds = g.speed * dt * g.dir;
  g.s += ds;
  g.distance += Math.abs(ds);
  // Balance: drifts away from centre, faster the longer you hold it; A/D pushes back.
  if (!perfectBalance) {
    const drift = g.balance * (2.4 + g.t * 0.35) + Math.sin(g.t * 2.3 + g.s) * 0.9;
    g.balanceVel += (drift - steer * 7.5) * dt;
    g.balanceVel *= Math.exp(-1.6 * dt);
    g.balance += g.balanceVel * dt;
  } else g.balance *= 0.9;

  if (!rail.closed && (g.s <= 0 || g.s >= rail.total)) return 'end';
  if (Math.abs(g.balance) > 1) return 'fall';

  rail.at(g.s, _p, _t);
  const travel = _t.clone().multiplyScalar(g.dir);
  // Orientation: yaw = travel direction + offset; pitch follows the rail for straight grinds; roll = balance.
  const flat = new THREE.Vector3(travel.x, 0, travel.z).normalize();
  const fwd = flat.clone().applyAxisAngle(UP, g.yawOffset);
  if (g.style === 'grind') fwd.y = travel.y * Math.cos(g.yawOffset);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  _m.makeBasis(right, up, fwd.clone().negate());
  _q.setFromRotationMatrix(_m);
  const roll = new THREE.Quaternion().setFromAxisAngle(fwd, -g.balance * 0.38);
  _q.premultiply(roll);
  const pos = _p.clone().addScaledVector(up, -BELLY);
  v.body.setNextKinematicTranslation(pos);
  v.body.setNextKinematicRotation(_q);
  v.vel.copy(travel).multiplyScalar(g.speed);
  return 'ok';
}

/** Leave the rail: back to a dynamic body carrying the rail velocity (+ optional pop). */
export function exitGrind(g: GrindState, v: Vehicle, pop: number, sideways: number) {
  g.rail.at(Math.max(0, Math.min(g.rail.total, g.s)), _p, _t);
  const vel = _t.clone().multiplyScalar(g.dir * g.speed);
  vel.y += pop;
  if (sideways) {
    const side = new THREE.Vector3().crossVectors(_t, UP).normalize();
    vel.addScaledVector(side, sideways);
  }
  v.setKinematic(false);
  v.body.setLinvel(vel, true);
  v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  v.readPose();
}
