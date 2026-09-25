import * as THREE from 'three';
import { CAMERA } from '../config/tuning';
import { RAPIER, COL, type PhysicsWorld } from '../physics/world';

// THPS-style chase cam: behind the direction of travel, horizon always level
// (the Ryker barrel-rolls; the camera doesn't). Widens for big air and hanging-on.

export class ChaseCam {
  pos = new THREE.Vector3();
  look = new THREE.Vector3();
  heading = new THREE.Vector3(0, 0, -1);
  distance: number = CAMERA.distance;
  height: number = CAMERA.height;
  extra = 0;
  shake = 0;
  shakeScale = 1;
  private t = 0;
  mode: 'follow' | 'orbit' | 'free' = 'follow';
  orbitAngle = 0;

  constructor(public camera: THREE.PerspectiveCamera, private phys: PhysicsWorld) {}

  snap(target: THREE.Vector3, forward: THREE.Vector3) {
    this.heading.set(forward.x, 0, forward.z).normalize();
    this.look.copy(target);
    this.pos.copy(target).addScaledVector(this.heading, -this.distance).add(new THREE.Vector3(0, this.height, 0));
    this.apply();
  }

  /**
   * target: point to frame (vehicle or ragdoll). forward: vehicle forward. vel: travel velocity.
   * airborne/vert change how the heading is chosen.
   */
  update(dt: number, target: THREE.Vector3, forward: THREE.Vector3, vel: THREE.Vector3, opts: { airborne: boolean; vert: boolean; wide: number }) {
    this.t += dt;
    if (this.mode === 'orbit') {
      this.orbitAngle += dt * 0.12;
      this.pos.set(target.x + Math.cos(this.orbitAngle) * 42, target.y + 16, target.z + Math.sin(this.orbitAngle) * 42);
      this.look.copy(target);
      this.apply();
      return;
    }
    // Desired heading: horizontal travel direction when moving, else vehicle forward.
    const hv = new THREE.Vector3(vel.x, 0, vel.z);
    const hf = new THREE.Vector3(forward.x, 0, forward.z);
    let desired: THREE.Vector3;
    const speedH = hv.length();
    if (opts.vert) desired = this.heading.clone(); // hold still through vert air
    else if (speedH > 2.5) desired = hv.normalize();
    else if (hf.lengthSq() > 0.01) desired = hf.normalize();
    else desired = this.heading.clone();
    // Going backwards (fakie) slowly: keep facing the vehicle's front.
    if (!opts.airborne && speedH > 0.5 && speedH < 6 && hf.lengthSq() > 0.01 && desired.dot(hf.normalize()) < -0.5) desired = hf.clone();
    const k = 1 - Math.exp(-dt * (opts.airborne ? 2.2 : 4.5));
    this.heading.lerp(desired, k).normalize();

    this.extra += (opts.wide - this.extra) * (1 - Math.exp(-dt * 2.5));
    const dist = this.distance + this.extra + Math.min(2.5, vel.length() * 0.06);
    const height = this.height + this.extra * 0.45;
    const want = target.clone().addScaledVector(this.heading, -dist);
    want.y = Math.max(want.y + height, target.y + 1.2);
    // Keep the camera above the ground and out of walls.
    const dir = want.clone().sub(target);
    const len = dir.length();
    dir.normalize();
    const hit = this.phys.world.castRay(rayOf(target, dir), len, true, undefined, COL.ground);
    if (hit && hit.timeOfImpact < len) want.copy(target).addScaledVector(dir, Math.max(1.2, hit.timeOfImpact - 0.35));
    this.pos.lerp(want, 1 - Math.exp(-dt * CAMERA.followLerp));
    const lookWant = target.clone().addScaledVector(this.heading, CAMERA.lookAhead).add(new THREE.Vector3(0, 0.6, 0));
    this.look.lerp(lookWant, 1 - Math.exp(-dt * 10));
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.apply();
  }

  addShake(s: number) {
    this.shake = Math.min(1.2, this.shake + s);
  }

  private apply() {
    this.camera.position.copy(this.pos);
    if (this.shake > 0 && this.shakeScale > 0) {
      const s = this.shake * this.shake * 0.25 * this.shakeScale;
      this.camera.position.x += Math.sin(this.t * 53) * s;
      this.camera.position.y += Math.sin(this.t * 71 + 1) * s;
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}

function rayOf(o: THREE.Vector3, d: THREE.Vector3) {
  return new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
}
