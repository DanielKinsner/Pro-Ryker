import * as THREE from 'three';
import type { Game } from './game';
import { frameOf, type InputFrame, type FrameSpec } from '../core/input';

// Title-screen attract mode: a bot drives a loop through the park using normal gameplay inputs
// (so whatever happens — clean kickflip or the full drag — is the real game).

interface Waypoint {
  x: number;
  z: number;
  /** Actions when reaching this point: ollie (hold then pop), flip, grind press. */
  act?: 'ollie-flip' | 'grind' | 'ollie-grab';
  speed?: number;
}

const LOOP: Waypoint[] = [
  { x: -52, z: -4, speed: 1 },
  { x: -47.4, z: -4, act: 'ollie-flip', speed: 1 },
  { x: -34, z: -4, speed: 0.7 },
  { x: -35, z: 24, speed: 0.8 },
  { x: 8, z: 27, speed: 0.9 },
  { x: 12, z: 2, speed: 0.8 },
  { x: 21.5, z: 2, act: 'grind', speed: 1 },
  { x: 50, z: 2, speed: 0.8 },
  { x: 52, z: -24, speed: 0.8 },
  { x: 38, z: -24, act: 'ollie-grab', speed: 1 },
  { x: -34, z: -23, speed: 0.9 },
  { x: -60, z: -8, speed: 0.6 },
];

export class Attract {
  private i = 0;
  private hold = 0;
  private flipAt = -1;
  private grabT = 0;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  active = false;

  constructor(private game: Game) {}

  start() {
    this.active = true;
    this.i = 0;
    this.game.startRun('free');
    this.game.respawn(-60, -4, 90);
  }

  stop() {
    this.active = false;
  }

  /** Produce this tick's input frame. */
  frame(empty: (p: FrameSpec) => InputFrame = frameOf): InputFrame {
    const g = this.game;
    const v = g.vehicle;
    const r = g.rider;
    // After a bail: enjoy it for a moment, then carry on from the start.
    if (r.state === 'detached') {
      if (g.bailT > 3.5) {
        g.respawn(-60, -4, 90);
        this.i = 0;
      }
      return empty({});
    }
    // Hanging on: brake and mash (the bot is decent at saving it).
    if (r.state === 'hanging') {
      this.hold = (this.hold + 1) % 7;
      return empty({ brake: 0.7, pressed: this.hold === 0 ? { ollie: 1 } : {} });
    }
    const wp = LOOP[this.i];
    const to = new THREE.Vector3(wp.x - v.pos.x, 0, wp.z - v.pos.z);
    const dist = to.length();
    const fwd = new THREE.Vector3(v.fwd.x, 0, v.fwd.z).normalize();
    to.normalize();
    const cross = fwd.x * to.z - fwd.z * to.x; // + = target is to the right
    const steer = Math.max(-1, Math.min(1, cross * 2.5));
    const ahead = fwd.dot(to);
    let throttle = (wp.speed ?? 0.8) * (ahead > 0.3 ? 1 : 0.3);
    let brake = 0;
    if (ahead < -0.2 && v.speed > 4) {
      throttle = 0;
      brake = 0.6;
    }
    const f: FrameSpec & { held: NonNullable<FrameSpec['held']>; pressed: NonNullable<FrameSpec['pressed']>; released: NonNullable<FrameSpec['released']> } = {
      throttle,
      brake,
      steer,
      held: {},
      pressed: {},
      released: {},
    };
    // Actions
    if (wp.act && dist < 5.5 && v.grounded) {
      if (wp.act === 'grind') f.pressed.grind = 1;
      else f.held.ollie = true;
    }
    if ((wp.act === 'ollie-flip' || wp.act === 'ollie-grab') && dist < 0.9 && v.grounded) {
      f.released.ollie = 1;
      this.flipAt = g.simTime + (wp.act === 'ollie-flip' ? 0.12 : 0.1);
      if (wp.act === 'ollie-grab') this.grabT = 0.5;
    }
    if (this.flipAt > 0 && g.simTime >= this.flipAt && !v.grounded) {
      f.pressed.flip = 1;
      this.flipAt = -1;
    }
    if (this.grabT > 0 && !v.grounded) {
      this.grabT -= 1 / 120;
      f.held.grab = true;
      f.dir = 'up';
    }
    // Grinding: stay balanced.
    const gr = g.tricks.grind;
    if (gr) f.steer = Math.max(-1, Math.min(1, gr.balance * 1.6 + gr.balanceVel * 0.5));
    if (dist < 2.5 || (wp.act && dist < 1.2)) this.i = (this.i + 1) % LOOP.length;
    // Unstick
    if (v.pos.distanceTo(this.lastPos) < 0.02) this.stuckT += 1 / 120;
    else this.stuckT = 0;
    this.lastPos.copy(v.pos);
    if (this.stuckT > 3) {
      g.respawn(-60, -4, 90);
      this.i = 0;
      this.stuckT = 0;
    }
    return empty(f);
  }
}
