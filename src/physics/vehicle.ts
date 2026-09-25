import * as THREE from 'three';
import { RAPIER, COL, type PhysicsWorld } from './world';
import { VEHICLE, AIR, SIM } from '../config/tuning';
import { classifyLanding, type LandingResult } from './landing';

// Arcade raycast vehicle on a Rapier dynamic body.
// Model/body space: +X right, +Y up, -Z forward, origin on the ground between the axles.

export interface VehicleControl {
  throttle: number;
  brake: number;
  steer: number;
  pitch: number;
  drift: boolean;
  ollieHeld: boolean;
  ollieRelease: boolean;
  /** Extra forced throttle (the death grip) — cannot be cancelled by releasing W. */
  forcedThrottle: number;
  /** 0..1 steering authority (reduced while hanging on). */
  steerAuthority: number;
  manual: 'none' | 'rear' | 'nose';
  manualBalance: number; // -1..1
}

export interface WheelState {
  name: string;
  local: THREE.Vector3; // wheel centre at rest (model space)
  radius: number;
  front: boolean;
  contact: boolean;
  compression: number;
  prevCompression: number;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  load: number;
  spin: number;
  surface: string;
}

export interface LandingEvent extends LandingResult {
  airTime: number;
  impact: number;
  speed: number;
  normal: THREE.Vector3;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _vI = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Vehicle {
  body: RAPIER.RigidBody;
  chassis: RAPIER.Collider;
  nose: RAPIER.Collider;
  riderCol: RAPIER.Collider;
  wheels: WheelState[];
  ctl: VehicleControl = {
    throttle: 0,
    brake: 0,
    steer: 0,
    pitch: 0,
    drift: false,
    ollieHeld: false,
    ollieRelease: false,
    forcedThrottle: 0,
    steerAuthority: 1,
    manual: 'none',
    manualBalance: 0,
  };

  // Pose (read after each physics step)
  pos = new THREE.Vector3();
  quat = new THREE.Quaternion();
  vel = new THREE.Vector3();
  angVel = new THREE.Vector3();
  up = new THREE.Vector3(0, 1, 0);
  fwd = new THREE.Vector3(0, 0, -1);
  right = new THREE.Vector3(1, 0, 0);
  prevPos = new THREE.Vector3();
  prevQuat = new THREE.Quaternion();

  grounded = false;
  contacts = 0;
  groundNormal = new THREE.Vector3(0, 1, 0);
  airTime = 0;
  groundTime = 0;
  lastGroundedAt = 0;
  steerAngle = 0;
  charge = 0;
  speed = 0;
  forwardSpeed = 0;
  rpm = 0;
  slip = 0;
  /** Seconds of reduced grip after a bad landing (the skid). */
  skid = 0;
  fakie = false;

  // Air control (we own orientation while airborne)
  airBase = new THREE.Quaternion();
  spinVel = 0;
  flipVel = 0;
  airYaw = 0; // unwrapped accumulated yaw this air (rad)
  airFlip = 0;
  trickRot = new THREE.Quaternion(); // overlay from the trick system
  trickAngVel = new THREE.Vector3();
  vertAir = false;
  vertNormal = new THREE.Vector3();
  vertPlaneD = 0;
  launchSpeed = 0;
  private preVel = new THREE.Vector3();
  tumbling = false;
  private tumbleReported = false;
  onTumble: ((upY: number) => void) | null = null;
  private pitchLatch = false;
  empty = false;
  frozen = false;
  kinematic = false;
  onLanding: ((e: LandingEvent) => void) | null = null;
  onAirborne: ((vert: boolean) => void) | null = null;
  onOllie: ((charge: number) => void) | null = null;
  /** Grab kind currently held (affects landing) — set by the trick system. */
  grabHeld: 'none' | 'hands' | 'legs' | 'body' = 'none';
  grabReleasedAt = -99;
  trickUnfinished = false;
  time = 0;

  constructor(private phys: PhysicsWorld) {
    const w = phys.world;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      .setCcdEnabled(true)
      // Props (cones, bins) and the ragdoll can't shove the Ryker: it plows through them (arcade).
      .setDominanceGroup(1)
      .setLinearDamping(0.02)
      .setAngularDamping(0.6)
      .setCanSleep(false);
    this.body = w.createRigidBody(bd);
    // Main chassis: the body tub between the wheels.
    this.chassis = w.createCollider(
      RAPIER.ColliderDesc.roundCuboid(0.36, 0.2, 0.95, 0.08)
        .setTranslation(0, 0.6, 0.05)
        .setMass(VEHICLE.massKg * 0.82)
        .setFriction(0.55)
        .setRestitution(0.08)
        .setCollisionGroups(COL.vehicle),
      this.body,
    );
    // Front axle + fenders (wide).
    this.nose = w.createCollider(
      RAPIER.ColliderDesc.roundCuboid(0.56, 0.1, 0.3, 0.08)
        .setTranslation(0, 0.4, -0.86)
        .setMass(VEHICLE.massKg * 0.18)
        .setFriction(0.55)
        .setRestitution(0.08)
        .setCollisionGroups(COL.vehicle),
      this.body,
    );
    // The seated rider's torso/head: part of the vehicle while he's aboard.
    this.riderCol = w.createCollider(
      RAPIER.ColliderDesc.capsule(0.32, 0.22)
        .setTranslation(0, 1.18, 0.3)
        .setMass(0.001)
        .setFriction(0.5)
        .setCollisionGroups(COL.vehicle),
      this.body,
    );
    this.wheels = VEHICLE.wheels.map((wd) => ({
      name: wd.name,
      local: new THREE.Vector3(...wd.pos),
      radius: wd.radius,
      front: wd.front,
      contact: false,
      compression: 0,
      prevCompression: 0,
      normal: new THREE.Vector3(0, 1, 0),
      point: new THREE.Vector3(),
      load: 0,
      spin: 0,
      surface: 'concrete',
    }));
    this.readPose();
  }

  get mass() {
    return this.body.mass();
  }

  spawn(x: number, y: number, z: number, yawDeg: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, (-yawDeg * Math.PI) / 180);
    this.setKinematic(false);
    this.body.setTranslation({ x, y: y + 0.08, z }, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.spinVel = this.flipVel = 0;
    this.trickRot.identity();
    this.trickAngVel.set(0, 0, 0);
    this.airTime = 0;
    this.groundTime = 0;
    this.grounded = true;
    this.skid = 0;
    this.fakie = false;
    this.empty = false;
    this.vertAir = false;
    this.charge = 0;
    this.grabHeld = 'none';
    this.trickUnfinished = false;
    this.ctl.manual = 'none';
    this.ctl.forcedThrottle = 0;
    this.chassis.setCollisionGroups(COL.vehicle);
    this.nose.setCollisionGroups(COL.vehicle);
    this.riderCol.setEnabled(true);
    this.readPose();
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    for (const wh of this.wheels) {
      wh.compression = wh.prevCompression = 0.05;
    }
  }

  setKinematic(on: boolean) {
    if (on === this.kinematic) return;
    this.kinematic = on;
    this.body.setBodyType(on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
  }

  /** The rider left: the Ryker carries on alone (and can now hit him). */
  setEmpty(on: boolean) {
    this.empty = on;
    this.riderCol.setEnabled(!on);
    this.chassis.setCollisionGroups(on ? COL.vehicleEmpty : COL.vehicle);
    this.nose.setCollisionGroups(on ? COL.vehicleEmpty : COL.vehicle);
  }

  /** While he's hanging on, his torso/legs can lie on (and drag off) the chassis. */
  setRiderCollision(on: boolean) {
    const g = on || this.empty ? COL.vehicleEmpty : COL.vehicle;
    this.chassis.setCollisionGroups(g);
    this.nose.setCollisionGroups(g);
  }

  readPose() {
    const t = this.body.translation();
    const r = this.body.rotation();
    const lv = this.body.linvel();
    const av = this.body.angvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(lv.x, lv.y, lv.z);
    this.angVel.set(av.x, av.y, av.z);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.speed = this.vel.length();
  }

  /** World position of a model-space point. */
  worldPoint(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.quat).add(this.pos);
  }

  /** World centre of mass. */
  com(out = new THREE.Vector3()) {
    const c = this.body.worldCom();
    return out.set(c.x, c.y, c.z);
  }

  // ------------------------------------------------------------------ step

  preStep(dt: number) {
    this.time += dt;
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    if (this.frozen || this.kinematic) return;
    this.readPose();
    this.preVel.copy(this.vel);
    const m = this.mass;
    this.castWheels();

    // Airborne only when *every* wheel is off the ground; touchdown is judged at first contact.
    // (Counting one wheel as "air" froze the rotation and left the nose stuck up on crests.)
    const wasGrounded = this.grounded;
    const nowGrounded = this.contacts >= 1;

    if (nowGrounded) {
      this.groundNormal.set(0, 0, 0);
      for (const w of this.wheels) if (w.contact) this.groundNormal.add(w.normal);
      this.groundNormal.normalize();
    }

    if (nowGrounded && !wasGrounded) this.handleTouchdown();
    if (!nowGrounded && wasGrounded) this.handleTakeoff();
    this.grounded = nowGrounded;

    this.applySuspension(dt);
    if (this.grounded) {
      this.lastGroundedAt = this.time;
      this.airTime = 0;
      this.groundTime += dt;
      this.applyDrive(dt, m);
      this.applyGroundAssists(dt, m);
      this.handleOllie(dt);
    } else {
      this.airTime += dt;
      this.groundTime = 0;
      // Late ollie off a lip (coyote time).
      if (this.time - this.lastGroundedAt < VEHICLE.coyoteTime) this.handleOllie(dt);
      else this.charge = 0;
      // Chassis resting on something with no wheels down: that's a tumble, not flight.
      // Physics owns the rotation (never freeze it); a crash if it's actually on its side/roof.
      this.tumbling = this.chassisTouching();
      if (this.tumbling) {
        if (!this.tumbleReported && this.airTime > 0.05) {
          this.tumbleReported = true;
          this.onTumble?.(this.up.y);
        }
        // Arcade self-right when it's only a little over (lets it fall back onto its wheels).
        if (!this.empty && this.up.y > 0.35) {
          const axis = _v.crossVectors(this.up, UP);
          this.body.applyTorqueImpulse(axis.multiplyScalar(VEHICLE.uprightAssist * 0.6 * m * dt), true);
        }
      } else {
        this.applyAir(dt);
      }
    }
    if (this.grounded) {
      this.tumbling = false;
      this.tumbleReported = false;
    }
    if (this.skid > 0) this.skid -= dt;
  }

  postStep() {
    if (this.frozen) return;
    this.readPose();
    if (this.kinematic) {
      // Kinematic bodies (grinding) don't report velocity: derive it from the motion.
      this.vel.subVectors(this.pos, this.prevPos).divideScalar(SIM.dt);
      this.speed = this.vel.length();
    }
    // Wheel spin visuals
    for (const w of this.wheels) {
      const v = _v.copy(this.vel);
      const along = v.dot(this.fwd);
      w.spin -= (along / w.radius) * SIM.dt * (w.contact || !this.grounded ? 1 : 1);
    }
  }

  private castWheels() {
    this.contacts = 0;
    const maxLen = VEHICLE.suspensionUp + VEHICLE.suspensionRest;
    for (const w of this.wheels) {
      w.prevCompression = w.compression;
      // Ray from the top of travel, along -up, to the bottom of the tyre at full droop.
      const top = _v.set(w.local.x, w.local.y + VEHICLE.suspensionUp, w.local.z).applyQuaternion(this.quat).add(this.pos);
      const dir = _v2.copy(this.up).negate();
      const hit = this.phys.rayGround(top.x, top.y, top.z, dir.x, dir.y, dir.z, maxLen + w.radius);
      if (hit && hit.ny * this.up.y + hit.nx * this.up.x + hit.nz * this.up.z > 0.2) {
        w.contact = true;
        w.compression = Math.max(0, maxLen + w.radius - hit.dist);
        w.normal.set(hit.nx, hit.ny, hit.nz);
        w.point.set(hit.px, hit.py, hit.pz);
        const tag = this.phys.tags.get(hit.collider.handle);
        w.surface = tag?.kind ?? 'concrete';
        this.contacts++;
      } else {
        w.contact = false;
        w.compression = 0;
        w.load = 0;
      }
    }
  }

  private applySuspension(dt: number) {
    const manual = this.ctl.manual;
    for (const w of this.wheels) {
      if (!w.contact) continue;
      // During a manual the lifted end's springs are off (so it can actually come up).
      if ((manual === 'rear' && w.front) || (manual === 'nose' && !w.front)) continue;
      // Preload so the static ride height is the modelled one (compression = suspensionRest).
      const x0 = VEHICLE.suspensionRest - (this.mass * -SIM.gravity) / 3 / VEHICLE.springK;
      const x = w.compression;
      // Damper uses the wheel point's real velocity along the suspension axis. (Differencing the
      // compression spiked on first contact — prev = fully extended — and bounced every landing.)
      const at0 = _v3.set(w.local.x, w.local.y, w.local.z).applyQuaternion(this.quat).add(this.pos);
      const r = at0.sub(this.body.worldCom() as unknown as THREE.Vector3);
      const pv = _v2.copy(this.angVel).cross(r).add(this.vel);
      const dx = -pv.dot(this.up);
      let f = VEHICLE.springK * (x - x0) + VEHICLE.damperC * dx;
      // Bump stop.
      if (x > VEHICLE.suspensionUp + VEHICLE.suspensionRest * 0.9) f += 60000 * (x - (VEHICLE.suspensionUp + VEHICLE.suspensionRest * 0.9));
      f = Math.max(0, Math.min(f, 60000));
      w.load = f;
      const imp = _v.copy(this.up).multiplyScalar(f * dt);
      const at = _v3.set(w.local.x, w.local.y, w.local.z).applyQuaternion(this.quat).add(this.pos);
      this.body.applyImpulseAtPoint(imp, at, true);
    }
  }

  private applyDrive(dt: number, m: number) {
    const c = this.ctl;
    const n = this.groundNormal;
    // Heading in the ground plane
    const f = _v.copy(this.fwd).addScaledVector(n, -this.fwd.dot(n)).normalize();
    const r = _v2.crossVectors(f, n).normalize(); // right in plane
    const vAlong = this.vel.dot(f);
    const vSide = this.vel.dot(r);
    this.forwardSpeed = vAlong;
    const speed = Math.hypot(vAlong, vSide);

    let throttle = Math.min(1, Math.max(c.throttle, c.forcedThrottle));
    let brake = c.brake;
    if (this.empty) {
      throttle = c.forcedThrottle;
      brake = 0;
    }
    // Forced throttle (his weight on the grip) is fought by the brake.
    if (c.forcedThrottle > 0 && brake > 0) throttle = Math.max(0, throttle - brake * 0.9);

    let drive = 0;
    if (throttle > 0 && vAlong < VEHICLE.maxSpeed) {
      const fade = 1 - Math.max(0, vAlong / VEHICLE.maxSpeed) ** 3;
      drive += throttle * VEHICLE.engineForce * fade;
    }
    if (brake > 0) {
      if (vAlong > 0.6) drive -= brake * VEHICLE.brakeForce;
      // Reverse (not while he's hanging on — then the brake just brakes).
      else if (vAlong > -VEHICLE.reverseMax && throttle === 0 && c.forcedThrottle === 0) drive -= brake * VEHICLE.engineForce * 0.55;
      else if (vAlong > 0) drive -= brake * VEHICLE.brakeForce * Math.min(1, vAlong / 0.6);
    }
    // Rolling + air drag
    drive -= Math.sign(vAlong) * (VEHICLE.rollingDrag * m + VEHICLE.airDrag * m * vAlong * vAlong * 0.2);
    // Only the rear wheel drives; only with rear contact.
    const rear = this.wheels[2];
    if (rear.contact || this.ctl.manual !== 'none') {
      this.body.applyImpulse(_v3.copy(f).multiplyScalar(drive * dt), true);
    }

    // Lateral grip: cancel sideways slip (bounded). Drift / skid / empty reduce it.
    let grip = VEHICLE.lateralGrip;
    if (c.drift && Math.abs(vAlong) > 5) grip = VEHICLE.driftGrip;
    if (this.skid > 0) grip = Math.min(grip, 4);
    if (this.empty) grip *= 0.5;
    // Stalling on a steep wall: let it slide down rather than tip over sideways.
    if (n.y < 0.75 && speed < 5) grip *= 0.25 + 0.75 * (speed / 5);
    const cancel = -vSide * Math.min(1, grip * dt);
    this.body.applyImpulse(_v3.copy(r).multiplyScalar(cancel * m), true);
    this.slip = Math.abs(vSide);

    // Arcade steering: we command yaw rate about the ground normal.
    const s01 = Math.min(1, speed / 5);
    const hi = Math.min(1, Math.max(0, (speed - 8) / 18));
    const auth = this.empty ? 0 : c.steerAuthority;
    const dirSign = vAlong < -0.5 ? -1 : 1;
    let target = -c.steer * VEHICLE.yawRateMax * s01 * (1 - 0.5 * hi) * auth * dirSign;
    if (c.drift && Math.abs(vAlong) > 5) target *= 1.45;
    // Kick-turn assist: stalling on a steep wall swings you to face down (or back down) the fall line.
    if (!this.empty && n.y < 0.8 && speed < 4.5) {
      const fall = _v3.set(0, -1, 0).addScaledVector(n, n.y).normalize(); // downhill in the surface
      const along = f.dot(fall);
      const want = along >= 0 ? fall : fall.clone().negate();
      const cross = f.clone().cross(want).dot(n); // + = turn left about n
      const strength = (1 - n.y / 0.8) * (1 - speed / 4.5);
      target += Math.max(-1, Math.min(1, cross * 3)) * 3.2 * strength;
    }
    const wN = this.angVel.dot(n);
    const k = this.empty ? 0 : Math.min(1, 12 * dt);
    this.body.applyTorqueImpulse(_v3.copy(n).multiplyScalar((target - wN) * k * this.yawInertia()), true);
    const steerMax = VEHICLE.steerMaxLow + (VEHICLE.steerMaxHigh - VEHICLE.steerMaxLow) * hi;
    this.steerAngle += (c.steer * steerMax * auth - this.steerAngle) * Math.min(1, 10 * dt);

    // Engine note
    const targetRpm = 1300 + Math.min(1, Math.abs(vAlong) / VEHICLE.maxSpeed) * 4200 + throttle * 2200;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, 6 * dt);
  }

  /**
   * Moment of inertia about a world axis. Rapier reports inertia in the body's *principal* frame,
   * which is rotated relative to the model — so it must be rotated back, not read per-component.
   */
  inertiaAbout(axisWorld: THREE.Vector3) {
    const pi = this.body.principalInertia();
    const pf = this.body.principalInertiaLocalFrame();
    const r = this.body.rotation();
    const q = _q.set(r.x, r.y, r.z, r.w).multiply(_q2.set(pf.x, pf.y, pf.z, pf.w));
    const l = _vI.copy(axisWorld).applyQuaternion(q.invert());
    return pi.x * l.x * l.x + pi.y * l.y * l.y + pi.z * l.z * l.z;
  }

  private yawInertia() {
    return this.inertiaAbout(this.groundNormal);
  }

  private applyGroundAssists(dt: number, m: number) {
    const n = this.groundNormal;
    const speed = this.speed;
    // Stick to steep transitions at speed (THPS-style adhesion).
    // Always a little on steep walls so you roll back down fakie instead of peeling off.
    const steep = 1 - Math.max(0, n.y);
    if (this.contacts >= 2) {
      const k = VEHICLE.stickForce * (0.22 * Math.min(1, speed / 7) + steep * (speed > 0.5 ? 1 : 0.75));
      this.body.applyImpulse(_v.copy(n).multiplyScalar(-k * -SIM.gravity * m * dt), true);
    }
    if (this.empty) return;
    // Upright assist: align up with the surface normal (not world up).
    const c = this.ctl;
    if (c.manual !== 'none') {
      this.applyManualTorque(dt, m);
      return;
    }
    const axis = _v.crossVectors(this.up, n);
    const wPerp = _v2.copy(this.angVel).addScaledVector(n, -this.angVel.dot(n));
    const gain = this.skid > 0 ? VEHICLE.uprightAssist * 0.35 : VEHICLE.uprightAssist;
    const tq = axis.multiplyScalar(gain * m).addScaledVector(wPerp, -VEHICLE.uprightDamp * m);
    this.body.applyTorqueImpulse(tq.multiplyScalar(dt), true);
  }

  private applyManualTorque(dt: number, m: number) {
    const c = this.ctl;
    const n = this.groundNormal;
    // Target pitch: nose up (rear manual) or tail up (nose manual), offset by the balance needle.
    const base = c.manual === 'rear' ? 0.36 : -0.3;
    const target = base + c.manualBalance * 0.34 * (c.manual === 'rear' ? 1 : -1);
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd.dot(n))));
    // Drive the pitch rate (velocity-level, scaled by the real inertia) — stable, and strong enough
    // to beat gravity's torque about the axle the Ryker is balancing on.
    const wantRate = Math.max(-3.5, Math.min(3.5, (target - pitch) * 9));
    const wR = this.angVel.dot(this.right);
    const Ip = this.inertiaAbout(this.right);
    this.body.applyTorqueImpulse(_v2.copy(this.right).multiplyScalar(Ip * (wantRate - wR) * 0.35), true);
    // Keep roll level to the surface.
    const axis = _v3.crossVectors(this.up, n);
    axis.addScaledVector(this.right, -axis.dot(this.right));
    this.body.applyTorqueImpulse(axis.multiplyScalar(VEHICLE.uprightAssist * m * dt), true);
  }

  private handleOllie(dt: number) {
    const c = this.ctl;
    if (c.ollieHeld) this.charge = Math.min(1, this.charge + dt / VEHICLE.chargeTime);
    if (c.ollieRelease) {
      const n = this.grounded ? this.groundNormal : _v3.copy(this.up);
      const dv = VEHICLE.ollieBase + this.charge * VEHICLE.ollieCharge;
      // Pop along the surface normal; on steep walls pop straight up (the vert lock keeps you in the ramp).
      const dir = n.y < 0.5 ? _v.copy(UP) : _v.copy(n).lerp(UP, 0.35).normalize();
      const vn = this.vel.dot(dir);
      const add = Math.max(0, dv - Math.max(0, vn) * 0.5);
      this.body.applyImpulse(dir.multiplyScalar(add * this.mass), true);
      this.onOllie?.(this.charge);
      this.charge = 0;
      this.lastGroundedAt = -99; // no double ollie
    }
  }

  private handleTakeoff() {
    this.airBase.copy(this.quat);
    this.spinVel = 0;
    this.flipVel = 0;
    this.airYaw = 0;
    this.airFlip = 0;
    this.trickRot.identity();
    this.launchSpeed = this.speed;
    this.pitchLatch = this.ctl.pitch !== 0;
    // Vert air: launching off a near-vertical lip → go straight up and come back into the ramp.
    const n = this.groundNormal;
    this.vertAir = false;
    if (n.y < VEHICLE.vertNormalY && this.vel.y > 1.5) {
      const nh = _v.set(n.x, 0, n.z);
      if (nh.lengthSq() > 1e-4) {
        nh.normalize();
        this.vertAir = true;
        this.vertNormal.copy(nh);
        // Remove velocity pushing away from (or into) the ramp plane.
        const vOut = this.vel.dot(nh);
        const nv = _v2.copy(this.vel).addScaledVector(nh, -vOut);
        this.body.setLinvel(nv, true);
        this.vertPlaneD = this.pos.dot(nh);
      }
    }
    this.onAirborne?.(this.vertAir);
  }

  private applyAir(dt: number) {
    if (this.empty) return; // loose bike: Rapier owns everything
    const c = this.ctl;
    // Spin (A/D) about world up, flip (W/S) about the vehicle's right axis.
    // W/S held since takeoff (throttle into the ramp) doesn't lean until released once.
    if (this.pitchLatch && c.pitch === 0) this.pitchLatch = false;
    const pitch = this.pitchLatch ? 0 : c.pitch;
    const wantSpin = -c.steer * AIR.spinMax;
    const wantFlip = -pitch * AIR.flipMax;
    this.spinVel += Math.sign(wantSpin - this.spinVel) * Math.min(Math.abs(wantSpin - this.spinVel), (c.steer ? AIR.spinAccel : AIR.damp * 2) * dt);
    this.flipVel += Math.sign(wantFlip - this.flipVel) * Math.min(Math.abs(wantFlip - this.flipVel), (pitch ? AIR.flipAccel : AIR.damp * 2) * dt);
    this.airYaw += this.spinVel * dt;
    this.airFlip += this.flipVel * dt;
    _q.setFromAxisAngle(UP, this.spinVel * dt);
    this.airBase.premultiply(_q);
    const rightW = _v.set(1, 0, 0).applyQuaternion(this.airBase);
    _q.setFromAxisAngle(rightW, this.flipVel * dt);
    this.airBase.premultiply(_q).normalize();
    const q = _q2.copy(this.airBase).multiply(this.trickRot);
    this.body.setRotation(q, true);
    const w = _v2.set(0, this.spinVel, 0).addScaledVector(rightW, this.flipVel).add(this.trickAngVel);
    this.body.setAngvel(w, true);

    // Vert air: hold the ramp plane so you come back into the transition.
    if (this.vertAir) {
      const d = this.pos.dot(this.vertNormal) - this.vertPlaneD;
      const vOut = this.vel.dot(this.vertNormal);
      const corr = -d * 6 - vOut * 3;
      this.body.applyImpulse(_v3.copy(this.vertNormal).multiplyScalar(corr * this.mass * dt), true);
    }
  }

  private handleTouchdown() {
    if (this.airTime < 0.12) {
      // Tiny hop: no judgement.
      this.airBase.copy(this.quat);
      return;
    }
    const n = this.groundNormal;
    const vt = _v.copy(this.preVel).addScaledVector(n, -this.preVel.dot(n));
    const speed = vt.length();
    const f = _v2.copy(this.fwd).addScaledVector(n, -this.fwd.dot(n));
    let yawErr = 0;
    if (speed > 1e-3 && f.lengthSq() > 1e-6) {
      f.normalize();
      yawErr = (Math.acos(Math.max(-1, Math.min(1, f.dot(vt) / speed))) * 180) / Math.PI;
    }
    const impact = Math.max(0, -this.preVel.dot(n));
    const res = classifyLanding({
      upDot: this.up.dot(n),
      yawErrDeg: yawErr,
      impact,
      trickUnfinished: this.trickUnfinished,
      grabReleasedAgo: this.time - this.grabReleasedAt,
      grabHeld: this.grabHeld,
      speed,
    });
    const ev: LandingEvent = { ...res, airTime: this.airTime, impact, speed, normal: n.clone() };
    this.fakie = res.fakie;
    // Landing assist for decent landings: square up to the surface and the travel direction.
    if (!this.empty && (res.quality === 'clean' || res.quality === 'sketchy')) {
      const align = res.quality === 'clean' ? 1 : 0.5;
      // Up → normal
      _q.setFromUnitVectors(this.up, n);
      _q2.identity().slerp(_q, align);
      const q = _q2.multiply(this.quat).normalize();
      this.body.setRotation(q, true);
      // Travel direction → heading (or reversed for fakie)
      if (speed > 1) {
        const heading = _v3.set(0, 0, -1).applyQuaternion(q);
        heading.addScaledVector(n, -heading.dot(n)).normalize();
        if (res.fakie) heading.negate();
        const vn = this.vel.dot(n);
        const newV = heading.multiplyScalar(speed * (res.quality === 'clean' ? 0.97 : 0.85)).addScaledVector(n, Math.min(0, vn) * 0.1);
        this.body.setLinvel(newV, true);
      }
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else if (!this.empty) {
      // Bad: skid it out. Keep most of the rotation but kill the spin so it doesn't cartwheel forever.
      this.skid = 0.8;
      const w = this.body.angvel();
      this.body.setAngvel({ x: w.x * 0.3, y: w.y * 0.3, z: w.z * 0.3 }, true);
    }
    this.trickRot.identity();
    this.trickAngVel.set(0, 0, 0);
    this.vertAir = false;
    this.spinVel = this.flipVel = 0;
    this.readPose();
    this.onLanding?.(ev);
  }

  /** Is the seated rider's torso/head collider touching static geometry (head meets concrete)? */
  riderTouching() {
    if (!this.riderCol.isEnabled()) return false;
    const w = this.phys.world;
    let hit = false;
    w.contactPairsWith(this.riderCol, (other) => {
      if (hit || other.parent()?.handle === this.body.handle) return;
      if (!this.phys.tags.has(other.handle)) return; // statics only
      w.contactPair(this.riderCol, other, (m) => {
        if (m.numContacts() > 0) hit = true;
      });
    });
    return hit;
  }

  /** Chassis or nose touching static world geometry (walls, ledges, kerbs) — not props or the rider. */
  chassisHitStatic() {
    const w = this.phys.world;
    let hit = false;
    for (const c of [this.chassis, this.nose]) {
      w.contactPairsWith(c, (other) => {
        if (hit || !this.phys.tags.has(other.handle)) return;
        w.contactPair(c, other, (m) => {
          if (m.numContacts() > 0) hit = true;
        });
      });
      if (hit) return true;
    }
    return false;
  }

  /** Is the chassis/nose/rider collider in actual contact with static geometry or props? */
  chassisTouching() {
    const w = this.phys.world;
    let touching = false;
    for (const c of [this.chassis, this.nose, this.riderCol]) {
      if (!c.isEnabled()) continue;
      w.contactPairsWith(c, (other) => {
        if (touching || other.parent()?.handle === this.body.handle) return;
        w.contactPair(c, other, (manifold) => {
          if (manifold.numContacts() > 0) touching = true;
        });
      });
      if (touching) return true;
    }
    return false;
  }

  /** Grounded, upright and not doing anything silly: a good respawn point. */
  isSafe() {
    return this.grounded && !this.empty && this.up.y > 0.93 && this.groundNormal.y > 0.97 && this.skid <= 0;
  }
}

export function yawOf(q: THREE.Quaternion) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(f.x, -f.z);
}
