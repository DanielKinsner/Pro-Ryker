import * as THREE from 'three';
import type { InputFrame, Dir } from '../core/input';
import type { Vehicle } from '../physics/vehicle';
import type { RiderController } from '../rider/rider';
import type { PoseName } from '../rider/pose';
import type { EventBus } from '../core/events';
import { Combo, spinLabel } from './combo';
import { findRail, startGrind, stepGrind, exitGrind, type GrindState } from './grind';
import type { GrindRail } from '../park/rails';
import { AIR } from '../config/tuning';

// Trick vocabulary. The labels borrow skate-game readability; the physics are an unapologetic
// Ryker parody (the whole rider-and-vehicle assembly rotates together).

export interface FlipDef {
  id: string;
  name: string;
  roll: number; // turns about the forward axis
  pitch: number; // turns about the right axis (+ = backflip)
  yaw: number; // turns about the up axis
  dur: number;
  points: number;
  special?: boolean;
}
export interface GrabDef {
  id: string;
  name: string;
  pose: PoseName;
  kind: 'hands' | 'legs' | 'body';
  points: number;
  perSec: number;
  special?: boolean;
}

export const FLIPS: Record<Exclude<Dir, never>, FlipDef> = {
  none: { id: 'kickflip', name: 'KICKFLIP', roll: 1, pitch: 0, yaw: 0, dur: AIR.flipTrickDur, points: 250 },
  left: { id: 'kickflip', name: 'KICKFLIP', roll: 1, pitch: 0, yaw: 0, dur: AIR.flipTrickDur, points: 250 },
  right: { id: 'heelflip', name: 'HEELFLIP', roll: -1, pitch: 0, yaw: 0, dur: AIR.flipTrickDur, points: 250 },
  up: { id: 'frontflip', name: 'FRONT FLIP', roll: 0, pitch: -1, yaw: 0, dur: 0.82, points: 450 },
  down: { id: 'backflip', name: 'BACKFLIP', roll: 0, pitch: 1, yaw: 0, dur: 0.82, points: 450 },
};

export const SPECIAL_FLIPS: Record<string, FlipDef> = {
  'up,down': { id: 'midlife', name: 'THE MID-LIFE VARIAL', roll: 1, pitch: 0, yaw: 1, dur: 0.95, points: 1800, special: true },
  'left,right': { id: 'insurance', name: 'THE INSURANCE CLAIM', roll: 2, pitch: 0, yaw: 0, dur: 1.05, points: 2000, special: true },
  'down,up': { id: 'threepoint', name: 'THE THREE-POINT TURN', roll: 0, pitch: 1, yaw: 1.5, dur: 1.15, points: 2400, special: true },
};

export const GRABS: Record<Dir, GrabDef> = {
  none: { id: 'nohander', name: 'NO-HANDER', pose: 'nohander', kind: 'hands', points: 200, perSec: 260 },
  up: { id: 'superman', name: 'SUPERMAN', pose: 'superman', kind: 'legs', points: 300, perSec: 320 },
  down: { id: 'coffin', name: 'COFFIN', pose: 'coffin', kind: 'body', points: 250, perSec: 240 },
  left: { id: 'cancan', name: 'CAN-CAN', pose: 'cancan', kind: 'legs', points: 250, perSec: 260 },
  right: { id: 'selfie', name: 'THE CONTENT CREATOR', pose: 'selfie', kind: 'body', points: 300, perSec: 300 },
};

export const SPECIAL_GRABS: Record<string, GrabDef> = {
  'up,up': { id: 'unlicensed', name: 'THE UNLICENSED SUPERMAN', pose: 'superman', kind: 'legs', points: 1500, perSec: 700, special: true },
  'left,right': { id: 'sunday', name: 'THE SUNDAY DRIVER', pose: 'seatstand', kind: 'legs', points: 1500, perSec: 650, special: true },
};

interface ActiveFlip {
  def: FlipDef;
  t: number;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function trickRotation(def: FlipDef, t: number, out: THREE.Quaternion) {
  const e = ease(Math.min(1, t / def.dur));
  const a = Math.PI * 2 * e;
  out.setFromAxisAngle(Y, def.yaw * a);
  _q2.setFromAxisAngle(X, def.pitch * a);
  out.multiply(_q2);
  _q2.setFromAxisAngle(Z, def.roll * a);
  out.multiply(_q2);
  return out;
}

export class TrickSystem {
  combo = new Combo();
  flip: ActiveFlip | null = null;
  flipQueue: FlipDef[] = [];
  flipsThisAir: { def: FlipDef; entry: ReturnType<Combo['add']> }[] = [];
  grab: { def: GrabDef; t: number; entry: ReturnType<Combo['add']> } | null = null;
  manual: { nose: boolean; balance: number; vel: number; t: number; dist: number; entry: ReturnType<Combo['add']> } | null = null;
  grind: GrindState | null = null;
  grindEntry: ReturnType<Combo['add']> | null = null;
  faceEntry: ReturnType<Combo['add']> | null = null;
  special = 0;
  specialReady = false;
  landedAgo = 99;
  lastLandFakie = false;
  grindBuffer = 0;
  bankTimer = 0;
  revertT = 0;
  score = 0;
  perfectBalance = false;
  /** Pop-up text for the HUD: last completed trick + time. */
  pop: { text: string; t: number; kind: 'trick' | 'bad' | 'good' } = { text: '', t: 0, kind: 'trick' };
  cheatsSpecialAlways = false;

  constructor(
    private v: Vehicle,
    private rider: RiderController,
    private rails: GrindRail[],
    private events: EventBus,
  ) {}

  private flash(text: string, kind: 'trick' | 'bad' | 'good' = 'trick') {
    this.pop = { text, t: 0, kind };
  }

  step(dt: number, f: InputFrame) {
    const v = this.v;
    this.pop.t += dt;
    this.landedAgo += dt;
    this.grindBuffer = f.pressed.grind ? 0.28 : Math.max(0, this.grindBuffer - dt);
    if (this.cheatsSpecialAlways) this.special = 1;
    if (!this.specialReady && this.special >= 1) {
      this.specialReady = true;
      this.events.emit('special_ready', {});
    }
    if (this.specialReady && this.special < 0.98 && !this.cheatsSpecialAlways) this.specialReady = false;

    // --- Hanging on: the face manual is the combo now.
    if (this.rider.hanging) {
      this.cancelAir();
      if (this.manual) this.endManual(false, false);
      if (this.grind) this.endGrind(0, 0, true);
      if (!this.faceEntry) this.faceEntry = this.combo.add('facemanual', 'FACE MANUAL', 50, true);
      if (v.speed > 2) this.combo.grow('facemanual', (40 + v.speed * 14) * dt);
      return;
    }
    if (!this.rider.attached) return;

    // --- Grinding
    if (this.grind) {
      const res = stepGrind(this.grind, v, f.steer, dt, this.perfectBalance);
      this.combo.grow(this.grindEntry!.id, (90 + this.grind.speed * 6) * dt);
      this.rider.manualLean = 0;
      if (f.released.ollie) this.endGrind(6.2, 0, false);
      else if (res === 'end') this.endGrind(1.2, 0, false);
      else if (res === 'fall') this.endGrind(0.5, Math.sign(this.grind.balance) * 2.5, true);
      return;
    }
    if (this.grindBuffer > 0 && v.speed > 2.5 && !this.manual) {
      const r = findRail(v, this.rails);
      if (r) {
        this.cancelAir(true);
        this.grind = startGrind(v, r.rail, r.s);
        this.grindBuffer = 0;
        this.grindEntry = this.combo.add(`grind:${this.grind.name}`, this.grind.name, 150, true);
        this.bankTimer = 0;
        this.events.emit('grind_start', { rail: r.rail.id, kind: this.grind.name });
        this.flash(this.grind.name);
        return;
      }
    }

    if (!v.grounded) {
      this.stepAir(dt, f);
      this.rider.manualLean = 0;
      return;
    }

    // --- Ground
    if (this.manual) {
      this.stepManual(dt, f);
    } else if (f.pressed.grind && v.speed > 2 && v.wheels[2].contact) {
      this.startManual(f.throttle > 0.5 && f.brake === 0);
    }
    // Revert: Shift right after landing (spins a fakie landing back around).
    if (f.pressed.revert && this.landedAgo < 0.5 && this.combo.active && !this.manual) {
      this.combo.add('revert', 'REVERT', 120);
      this.events.emit('revert', {});
      if (this.lastLandFakie) this.revertT = 0.28;
      this.bankTimer = -0.35; // a little extra link time
      this.flash('REVERT');
    }
    if (this.revertT > 0) {
      // Swing the Ryker 180° on the ground, keeping its travel.
      const n = v.groundNormal;
      const turn = (Math.PI / 0.28) * Math.min(dt, this.revertT);
      _q.setFromAxisAngle(n, turn);
      const r = v.body.rotation();
      _q2.set(r.x, r.y, r.z, r.w).premultiply(_q);
      v.body.setRotation(_q2, true);
      this.revertT -= dt;
    }
    // Powerslide while a combo is live keeps it going (a vehicle's version of a revert/manual link).
    if (f.held.revert && Math.abs(f.steer) > 0.3 && v.speed > 7 && this.combo.active && this.landedAgo < 1.2 && !this.manual) {
      if (!this.combo.entries.some((e) => e.id === 'powerslide' && e.live)) {
        this.combo.add('powerslide', 'POWERSLIDE', 80, true);
        this.events.emit('powerslide', {});
      }
      this.combo.grow('powerslide', 60 * dt);
      this.bankTimer = 0;
    } else this.combo.end('powerslide');

    // Bank the combo after a short clean roll-out.
    if (this.combo.active && !this.manual && this.rider.attached) {
      this.bankTimer += dt;
      if (this.bankTimer > 0.45) this.bank();
    }
  }

  // ---------------------------------------------------------------- air

  private stepAir(dt: number, f: InputFrame) {
    const v = this.v;
    if (this.manual) this.endManual(false, false);
    this.bankTimer = 0;
    const high = v.airTime > 0.06;
    if (f.pressed.flip && high) {
      const def = this.pickFlip(f);
      if (def) {
        if (!this.flip) this.startFlip(def);
        else if (this.flipQueue.length < 2) this.flipQueue.push(def);
      }
    }
    if (this.flip) {
      this.flip.t += dt;
      trickRotation(this.flip.def, this.flip.t, v.trickRot);
      // Approximate angular velocity of the overlay for honest collisions.
      trickRotation(this.flip.def, this.flip.t + dt, _q);
      _q2.copy(v.trickRot).invert().premultiply(_q);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_q2.w)));
      const axis = new THREE.Vector3(_q2.x, _q2.y, _q2.z).normalize().applyQuaternion(v.quat);
      v.trickAngVel.copy(axis).multiplyScalar(ang / dt);
      v.trickUnfinished = true;
      if (this.flip.t >= this.flip.def.dur) {
        const def = this.flip.def;
        v.trickRot.identity();
        v.trickAngVel.set(0, 0, 0);
        v.trickUnfinished = false;
        const entry = this.combo.add(def.id, def.name, def.points);
        this.flipsThisAir.push({ def, entry });
        this.events.emit('trick_completed', { id: def.id, name: def.name, points: def.points, kind: def.special ? 'special' : 'flip' });
        this.flash(def.name, def.special ? 'good' : 'trick');
        if (def.special) this.special = Math.max(0, this.special - 0.5);
        this.flip = null;
        const next = this.flipQueue.shift();
        if (next) this.startFlip(next);
      }
    }
    // Grabs: hold K.
    if (f.held.grab && high && !this.grab) {
      const def = this.pickGrab(f);
      this.grab = { def, t: 0, entry: this.combo.add(def.id, def.name, def.points, true) };
      this.rider.grab.pose = def.pose;
      this.rider.grab.target = 1;
      this.events.emit('trick_started', { id: def.id, name: def.name, kind: def.special ? 'special' : 'grab' });
      this.flash(def.name, def.special ? 'good' : 'trick');
      if (def.special) this.special = Math.max(0, this.special - 0.5);
    }
    if (this.grab) {
      this.grab.t += dt;
      if (f.held.grab) {
        if (this.grab.t > 0.18) this.combo.grow(this.grab.def.id, this.grab.def.perSec * dt);
        v.grabHeld = this.rider.grab.weight > 0.35 ? this.grab.def.kind : 'none';
      } else this.releaseGrab();
    } else if (this.rider.grab.weight < 0.35) v.grabHeld = 'none';
  }

  private releaseGrab() {
    if (!this.grab) return;
    this.combo.end(this.grab.def.id);
    this.events.emit('trick_completed', { id: this.grab.def.id, name: this.grab.def.name, points: Math.round(this.grab.entry.base), kind: 'grab' });
    this.rider.grab.target = 0;
    this.v.grabReleasedAt = this.v.time;
    this.grab = null;
  }

  private pickFlip(f: InputFrame): FlipDef | null {
    if (this.specialReady || this.cheatsSpecialAlways) {
      const seq = f.recentDirs.slice(-2).join(',');
      const sp = SPECIAL_FLIPS[seq];
      if (sp) return sp;
    }
    return FLIPS[f.dir];
  }

  private pickGrab(f: InputFrame): GrabDef {
    if (this.specialReady || this.cheatsSpecialAlways) {
      const seq = f.recentDirs.slice(-2).join(',');
      const sp = SPECIAL_GRABS[seq];
      if (sp) return sp;
    }
    return GRABS[f.dir];
  }

  private startFlip(def: FlipDef) {
    this.flip = { def, t: 0 };
    this.events.emit('trick_started', { id: def.id, name: def.name, kind: def.special ? 'special' : 'flip' });
  }

  /** Abort air tricks (grind catch, bail). */
  cancelAir(keepCompleted = false) {
    this.flip = null;
    this.flipQueue = [];
    this.v.trickRot.identity();
    this.v.trickAngVel.set(0, 0, 0);
    this.v.trickUnfinished = false;
    if (this.grab) this.releaseGrab();
    if (!keepCompleted) this.flipsThisAir = [];
  }

  // ---------------------------------------------------------------- landing

  /** Called by the game when the vehicle touches down (after the landing is classified). */
  onLanded(quality: 'clean' | 'sketchy' | 'bad' | 'slam', fakie: boolean) {
    const v = this.v;
    // Spin credit
    const sp = spinLabel(v.airYaw);
    const halves = sp.deg / 180;
    if (quality === 'clean' || quality === 'sketchy' || quality === 'bad') {
      if (halves >= 1) {
        const lastFlip = this.flipsThisAir[this.flipsThisAir.length - 1];
        if (lastFlip) {
          lastFlip.entry.name = `${sp.label} ${lastFlip.entry.name}`;
          lastFlip.entry.base *= 1 + 0.5 * halves;
        } else {
          this.combo.add(`spin${sp.deg}`, `${sp.label} AIR DONUT`, 120 * halves);
        }
        this.events.emit('trick_completed', { id: 'spin', name: `${sp.label}`, points: 120 * halves, kind: 'spin' });
      }
      // Air time bonus for genuinely big air.
      if (v.airTime > 1.4 && this.combo.active) this.combo.last()!.base += Math.round((v.airTime - 1.4) * 300);
    }
    this.flipsThisAir = [];
    this.flip = null;
    this.flipQueue = [];
    if (this.grab) this.releaseGrab();
    this.lastLandFakie = fakie;
    this.landedAgo = 0;
    this.bankTimer = 0;
    if (quality === 'sketchy' && this.combo.active) {
      this.combo.quality = 0.5;
      this.flash('SKETCHY', 'bad');
    }
    if (fakie && this.combo.active) this.combo.last()!.name = `FAKIE ${this.combo.last()!.name}`.replace('FAKIE FAKIE', 'FAKIE');
    // Pressing manual as you land links it.
    if (this.grindBuffer > 0 && (quality === 'clean' || quality === 'sketchy') && !this.findLinkRail()) this.startManual(false);
  }

  private findLinkRail() {
    return findRail(this.v, this.rails);
  }

  // ---------------------------------------------------------------- manual

  private startManual(nose: boolean) {
    this.manual = { nose, balance: 0, vel: nose ? -0.2 : 0.2, t: 0, dist: 0, entry: this.combo.add(nose ? 'nosemanual' : 'manual', nose ? 'NOSE MANUAL' : 'MANUAL', 80, true) };
    this.v.ctl.manual = nose ? 'nose' : 'rear';
    this.bankTimer = 0;
    this.events.emit('manual_start', { nose });
    this.flash(nose ? 'NOSE MANUAL' : 'MANUAL');
  }

  private stepManual(dt: number, f: InputFrame) {
    const m = this.manual!;
    const v = this.v;
    m.t += dt;
    m.dist += v.speed * dt;
    // Balance: W/S (pitch) — THPS-style needle that drifts harder the longer you hold it.
    if (!this.perfectBalance) {
      const drift = m.balance * (2.2 + m.t * 0.3) + Math.sin(m.t * 1.9) * 0.7;
      m.vel += (drift + f.pitch * -6.5 * (m.nose ? -1 : 1)) * dt;
      m.vel *= Math.exp(-1.4 * dt);
      m.balance += m.vel * dt;
    } else m.balance *= 0.9;
    v.ctl.manualBalance = m.balance;
    v.ctl.throttle = v.speed < 7 ? 0.35 : 0;
    v.ctl.brake = 0;
    this.rider.manualLean = m.balance * 0.3 * (m.nose ? 1 : -1) + (m.nose ? 0.25 : -0.2);
    this.combo.grow(m.nose ? 'nosemanual' : 'manual', (60 + v.speed * 8) * dt);
    if (f.pressed.grind && m.t > 0.2) this.endManual(false, false);
    else if (f.released.ollie) this.endManual(false, false);
    else if (m.balance > 1) this.endManual(true, false); // looped out
    else if (m.balance < -1) this.endManual(false, true); // slammed the other end down
    else if (v.speed < 1.2) this.endManual(false, false);
  }

  private endManual(loopedOut: boolean, slammed: boolean) {
    const m = this.manual;
    if (!m) return;
    this.combo.end(m.nose ? 'nosemanual' : 'manual');
    this.v.ctl.manual = 'none';
    this.v.ctl.manualBalance = 0;
    this.rider.manualLean = 0;
    this.manual = null;
    this.events.emit('manual_end', { nose: m.nose, distance: m.dist, loopedOut, slammed });
    this.bankTimer = 0;
    if (loopedOut) {
      // Rear manual looped out: he slides off the back still holding the bars. Face manual time.
      this.flash('LOOPED OUT', 'bad');
      this.rider.hang(m.nose ? 'went over the bars' : 'looped out');
    } else if (slammed) {
      this.combo.quality = Math.min(this.combo.quality, 0.5);
      this.rider.addStrain(0.45, 'slammed the manual');
      this.flash('SKETCHY', 'bad');
    }
  }

  // ---------------------------------------------------------------- grind end

  private endGrind(pop: number, sideways: number, fellOff: boolean) {
    const g = this.grind;
    if (!g) return;
    exitGrind(g, this.v, pop, sideways);
    if (this.grindEntry) this.combo.end(this.grindEntry.id);
    this.grindEntry = null;
    this.events.emit('grind_end', { rail: g.rail.id, kind: g.name, distance: g.distance, fellOff });
    this.grind = null;
    this.bankTimer = 0;
    if (fellOff && this.rider.attached) {
      this.flash('FELL OFF', 'bad');
      this.rider.addStrain(0.55, 'fell off the rail');
    }
  }

  // ---------------------------------------------------------------- banking

  bank() {
    if (!this.combo.active) return;
    const r = this.combo.bank();
    this.faceEntry = null;
    this.score += r.score;
    this.special = Math.min(1, this.special + r.score / 4000 + 0.06);
    this.events.emit('combo_banked', r);
    if (r.tricks >= 2 || r.score >= 500) this.flash(`+${r.score.toLocaleString()}`, 'good');
  }

  lose(reason: string) {
    this.cancelAir();
    if (this.manual) this.endManual(false, false);
    if (this.grind) {
      exitGrind(this.grind, this.v, 0, 0);
      this.grind = null;
    }
    this.faceEntry = null;
    if (!this.combo.active) return;
    const score = this.combo.total;
    this.combo.clear();
    this.special = Math.max(0, this.special - 0.35);
    this.events.emit('combo_lost', { score, reason });
  }

  /** Rider pulled himself back on: the face manual lands with a bonus. */
  onRecovered(fromOneHand: boolean) {
    this.combo.end('facemanual');
    this.combo.add(fromOneHand ? 'onehand' : 'stillcounts', fromOneHand ? 'ONE-HANDED SAVE' : 'STILL COUNTS', fromOneHand ? 900 : 500);
    this.faceEntry = null;
    this.bankTimer = -0.6;
    this.flash(fromOneHand ? 'ONE-HANDED SAVE' : 'STILL COUNTS', 'good');
  }

  reset() {
    this.cancelAir();
    this.manual = null;
    if (this.grind) {
      this.v.setKinematic(false);
      this.grind = null;
    }
    this.combo.clear();
    this.faceEntry = null;
    this.bankTimer = 0;
    this.v.ctl.manual = 'none';
    this.rider.manualLean = 0;
  }

  /** Special meter slowly drains when you're not comboing. */
  tickSpecial(dt: number) {
    if (!this.combo.active && !this.cheatsSpecialAlways) this.special = Math.max(0, this.special - dt * 0.035);
  }
}
