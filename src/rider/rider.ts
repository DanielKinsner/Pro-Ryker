import * as THREE from 'three';
import { RIDER, SIM } from '../config/tuning';
import { COL, RAPIER, type PhysicsWorld } from '../physics/world';
import { Ragdoll } from '../physics/ragdoll';
import type { Vehicle } from '../physics/vehicle';
import type { EventBus } from '../core/events';
import type { RykerVisual } from '../render/vehicleModel';
import { BONES, type RiderRig, type Side } from './rig';
import { makePoses, solvePose, lerpParams, cloneParams, type PoseName, type PoseParams } from './pose';

export type RiderState = 'seated' | 'unsettled' | 'hanging' | 'recovering' | 'detached';

const STEER_AXIS = new THREE.Vector3(0, 1, 0.28).normalize();
const STEER_PIVOT = new THREE.Vector3(0.005, 0.954, -0.215);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class RiderController {
  state: RiderState = 'seated';
  strain = 0;
  /** Hanging minigame: 0..1 haul progress, 0..1 grip left on the current hand(s). */
  haul = 0;
  grip = 1;
  hands = 2;
  hangTime = 0;
  dragMetres = 0;
  recoverT = 0;
  protectT = 0;
  stateT = 0;
  detachT = 0;
  settledT = 0;
  settledReported = false;
  helmetOff = false;
  /** Grab trick pose requested by the trick system. */
  grab: { pose: PoseName; target: number; weight: number } = { pose: 'nohander', target: 0, weight: 0 };
  manualLean = 0;
  ragdoll: Ragdoll;
  poses: Record<PoseName, PoseParams>;
  private cur: PoseParams;
  private lean = new THREE.Vector3();
  private leanVel = new THREE.Vector3();
  private bob = 0;
  private bobVel = 0;
  private prevVel = new THREE.Vector3();
  private blendFrom = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  private rootFromPos = new THREE.Vector3();
  private rootFromQuat = new THREE.Quaternion();
  private deathGrip = 0;
  private emptyThrottle = 0;
  helmet: { mesh: THREE.Mesh; body: RAPIER.RigidBody } | null = null;
  phone: THREE.Mesh;
  /** Things the HUD / scoring want to know this step. */
  hangCause = '';
  detachCause = '';

  constructor(
    public rig: RiderRig,
    private vehicle: Vehicle,
    private ryker: RykerVisual,
    private scene: THREE.Scene,
    private phys: PhysicsWorld,
    private events: EventBus,
  ) {
    this.ragdoll = new Ragdoll(phys, rig);
    this.poses = makePoses(rig);
    this.cur = cloneParams(this.poses.seated);
    // Phone prop for THE CONTENT CREATOR.
    this.phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.15, 0.012),
      new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3, metalness: 0.6, emissive: '#3a6cff', emissiveIntensity: 0.25 }),
    );
    this.phone.visible = false;
    rig.bone(BONES.hand('right')).add(this.phone);
    this.phone.position.set(0, 0.1, 0.05);
  }

  get attached() {
    return this.state === 'seated' || this.state === 'unsettled' || this.state === 'recovering';
  }

  get hanging() {
    return this.state === 'hanging';
  }

  // ------------------------------------------------------------------ sim rate

  addStrain(amount: number, cause: string) {
    if (!this.attached || this.state === 'recovering') return;
    if (this.protectT > 0 && amount < 0.9) amount *= 0.3;
    this.strain = Math.min(1.5, this.strain + amount);
    if (this.strain >= RIDER.hangEnter) this.hang(cause);
  }

  step(dt: number, input: { haulPressed: boolean; letGo: boolean; brake: number }) {
    const v = this.vehicle;
    this.stateT += dt;
    // Grab/pose blend runs at sim rate: it decides landing outcomes, so it can't depend on frame rate.
    const g = this.grab;
    const rate = g.pose === 'hangL' || g.pose === 'hangR' ? 0.12 : 0.14;
    g.weight += Math.sign(g.target - g.weight) * Math.min(Math.abs(g.target - g.weight), dt / rate);
    this.protectT = Math.max(0, this.protectT - dt);

    this.prevVel.copy(v.vel);

    switch (this.state) {
      case 'seated':
      case 'unsettled': {
        // Sudden hits (walls, kerbs) strain the grip; plain speed never does. Measured as
        // horizontal deceleration along the heading, smoothed over a few ticks, so suspension
        // spikes over ramp creases (vertical) don't count.
        this.decelHist.push(v.vel.clone().setY(0));
        if (this.decelHist.length > 4) this.decelHist.shift();
        if (this.decelHist.length === 4 && v.grounded) {
          const hd = _v2.set(v.fwd.x, 0, v.fwd.z).normalize();
          const dv = this.decelHist[0].clone().sub(this.decelHist[3]).dot(hd); // + = slowed down
          const decel = dv / (3 * dt);
          if (decel > 42 && v.chassisHitStatic()) this.addStrain((decel - 42) * 0.006, 'hit something');
        }
        // A roof/side contact with the rider collider means he's between the Ryker and the floor.
        this.strain = Math.max(0, this.strain - RIDER.strainDecay * dt * (v.grounded ? 1 : 0.2));
        if (this.state === 'seated' && this.strain > RIDER.unsettledEnter) this.setState('unsettled');
        else if (this.state === 'unsettled' && this.strain < RIDER.unsettledExit && this.stateT > RIDER.dwell) this.setState('seated');
        if (input.letGo) this.detach('let go on purpose', 0);
        break;
      }
      case 'recovering': {
        this.recoverT += dt;
        if (this.recoverT >= RIDER.recoverBlend) {
          this.setState('seated');
          this.strain = 0.25;
          this.protectT = RIDER.recoverSettle;
        }
        break;
      }
      case 'hanging':
        this.stepHanging(dt, input);
        break;
      case 'detached': {
        this.detachT += dt;
        // Let him bounce off his own Ryker after a moment (not while overlapping it).
        if (this.detachT - dt < 0.45 && this.detachT >= 0.45 && this.ragdoll.active) this.ragdoll.setCollisionGroups(COL.riderFree);
        // The empty Ryker keeps the last of the death grip for a moment ("still having a good time").
        this.emptyThrottle = Math.max(0, this.emptyThrottle - dt * 0.8);
        v.ctl.forcedThrottle = this.emptyThrottle;
        this.ragdoll.tone = Math.max(0.03, 0.12 - this.detachT * 0.05);
        const moving = this.ragdoll.maxSpeed();
        this.settledT = moving < 0.6 ? this.settledT + dt : 0;
        if (!this.settledReported && this.settledT > 0.7) {
          this.settledReported = true;
          const d = this.ragdoll.pelvisPos(_v2).distanceTo(v.pos);
          this.events.emit('ragdoll_settled', { distanceFromBike: d });
        }
        break;
      }
    }
    if (this.ragdoll.active) this.ragdoll.step(dt);
    this.stepHelmet();
  }

  private stepHanging(dt: number, input: { haulPressed: boolean; letGo: boolean; brake: number }) {
    const v = this.vehicle;
    this.hangTime += dt;
    if (this.entryT > 0) {
      this.entryT -= dt;
      v.ctl.forcedThrottle = RIDER.deathGripThrottle;
      v.ctl.steerAuthority = RIDER.hangSteer;
      if (this.entryT <= 0) this.activateHang();
      return;
    }
    const speed = v.speed;
    this.dragMetres += speed * dt;
    // His weight is on the twist-grip: the Ryker accelerates unless you brake against it.
    this.deathGrip = RIDER.deathGripThrottle * (this.hands === 2 ? 1 : 0.55);
    v.ctl.forcedThrottle = this.deathGrip;
    v.ctl.steerAuthority = RIDER.hangSteer;
    // Haul yourself back: mash. Harder the faster you're being dragged. (Decay first, then taps,
    // so a full meter is actually reachable.)
    this.haul = Math.max(0, this.haul - (RIDER.haulDecayBase + RIDER.haulDecayPerMps * speed) * dt);
    if (input.haulPressed) this.haul = Math.min(1, this.haul + RIDER.haulPerTap * (this.hands === 2 ? 1 : 0.7));
    // Grip drains with speed and impacts.
    const pv = this.ragdoll.pelvisVel(_v2);
    const impact = this.lastPelvisVel ? pv.distanceTo(this.lastPelvisVel) : 0;
    this.lastPelvisVel = (this.lastPelvisVel ?? new THREE.Vector3()).copy(pv);
    // Only real slams cost grip (ragdoll jiggle doesn't), with a cooldown so one hit counts once.
    this.impactCd = Math.max(0, this.impactCd - dt);
    let hit = 0;
    if (impact > 7 && this.impactCd <= 0) {
      hit = RIDER.gripDrainImpact * Math.min(2.5, impact / 7);
      this.impactCd = 0.3;
    }
    this.grip -= (RIDER.gripDrainBase + RIDER.gripDrainPerMps * speed + (input.brake > 0.5 ? -0.03 : 0)) * dt + hit;
    // Arms reach for the bars while hanging; a failing grip lets his body swing more.
    this.ragdoll.tone = 0.32;
    const hold = (this.hands === 2 ? 1 : 0.55) * (0.45 + 0.55 * Math.max(0, this.grip)) * (v.grounded ? 1 : 0.5);
    for (const t of this.ragdoll.tethers) t.k = (t.key === 'pelvis' ? 38 : 46) * hold;
    if (input.letGo) {
      this.detach('let go on purpose', 0);
      return;
    }
    if (this.grip <= 0) {
      if (this.hands === 2) {
        // First hand slips. The other one is doing everything now.
        const side: Side = this.lastSlip === 'left' ? 'right' : 'left';
        this.ragdoll.release(side);
        this.hands = 1;
        this.grip = 0.65;
        this.lastSlip = side;
        this.events.emit('grip_lost', { handsLeft: 1 });
      } else {
        this.detach('lost his grip', speed);
        return;
      }
    }
    // Upside-down Ryker: nothing to climb back onto.
    if (v.up.y < 0.2 && !v.grounded && this.hangTime > 0.3) this.grip -= dt * 0.8;
    if (this.haul >= 1) {
      const pel = this.ragdoll.pelvisPos(_v);
      const seat = v.worldPoint(_v2.set(0, 0.8, 0.43));
      if (pel.distanceTo(seat) < 3.2 && v.up.y > 0.45) this.recover();
      else this.haul = 0.85; // too far / too upside down: keep trying
    }
  }
  private lastPelvisVel: THREE.Vector3 | null = null;
  private decelHist: THREE.Vector3[] = [];
  private impactCd = 0;
  lastBuckSide = 1;
  private entryT = 0;
  private lastSlip: Side = 'right';

  hang(cause: string) {
    if (this.state === 'hanging' || this.state === 'detached') return;
    const v = this.vehicle;
    // Off the side he goes: whichever way the Ryker is rolling/sliding (default: his right).
    const lat = v.vel.dot(v.right) * 0.15 + v.angVel.dot(v.fwd) * 0.4;
    this.lastBuckSide = lat < -0.05 ? -1 : 1;
    // Short procedural lead-in (the design kit's "near-hang" phase): swing off the seat to the side,
    // then physics takes over from that pose, already clear of the bodywork.
    this.entryT = 0.16;
    this.grab.pose = this.lastBuckSide > 0 ? 'hangR' : 'hangL';
    this.grab.target = 1;
    this.grab.weight = Math.min(this.grab.weight, 0.2);
    this.hands = 2;
    this.grip = 1;
    this.haul = 0;
    this.hangTime = 0;
    this.dragMetres = 0;
    this.hangCause = cause;
    this.lastPelvisVel = null;
    v.ctl.forcedThrottle = RIDER.deathGripThrottle;
    this.setState('hanging');
    this.events.emit('hang_entered', { hands: 2, speed: v.speed, cause });
  }

  /** Hand the hanging rider to the ragdoll, from the (procedural) thrown-off-the-side pose. */
  private activateHang() {
    const v = this.vehicle;
    this.ryker.update(v, 1);
    this.grab.weight = 1;
    this.renderPose(0);
    this.rig.root.updateMatrixWorld(true);
    const com = v.com(new THREE.Vector3());
    const w = v.angVel.clone();
    const side = v.right.clone().multiplyScalar(this.lastBuckSide);
    const drift = v.up.clone().multiplyScalar(0.2).addScaledVector(v.fwd, -0.8).addScaledVector(side, 0.6);
    this.ragdoll.activate(
      (p, out) => out.copy(v.vel).add(w.clone().cross(p.clone().sub(com))),
      (key) => (key === 'pelvis' || key.startsWith('thigh') || key.startsWith('shin') ? drift : null),
    );
    this.toWorldSpace();
    const gripsLocal = this.gripPointsLocal();
    this.ragdoll.grip('left', v.body, gripsLocal.left);
    this.ragdoll.grip('right', v.body, gripsLocal.right);
    this.ragdoll.tone = 0.32;
    // Body stretched out and dragging (standing reference pose for spine/hips/knees), arms reaching.
    this.ragdoll.targetPose(this.rig.bind, ['torso', 'chest', 'head', 'thigh_left', 'thigh_right', 'shin_left', 'shin_right'], 0.7);
    // His core holds his body in the drag position beside/behind the rear wheel (soft tethers in the
    // Ryker's frame); legs drag on the concrete, everything flops physically. Hips/legs start clear
    // of the bodywork and can't pass under it; torso/arms reach over the side panel to the grips.
    for (const [key, part] of this.ragdoll.parts) {
      const g = key === 'pelvis' || key.startsWith('thigh') || key.startsWith('shin') ? COL.riderFree : COL.rider;
      for (let i = 0; i < part.body.numColliders(); i++) part.body.collider(i).setCollisionGroups(g);
    }
    v.setRiderCollision(true);
    const sx = this.lastBuckSide;
    this.ragdoll.tethers = [
      { key: 'pelvis', other: v.body, local: new THREE.Vector3(0.62 * sx, 0.24, 1.0), k: 38, c: 7 },
      { key: 'chest', other: v.body, local: new THREE.Vector3(0.42 * sx, 0.58, 0.28), k: 46, c: 8 },
    ];
    v.riderCol.setEnabled(false);
    this.grab.target = 0;
    this.grab.weight = 0;
  }

  detach(cause: string, speed: number) {
    if (this.state === 'detached') return;
    const v = this.vehicle;
    if (!this.ragdoll.active) {
      this.ryker.update(v, 1);
      this.renderPose(0);
      this.rig.root.updateMatrixWorld(true);
      const com = v.com(new THREE.Vector3());
      const w = v.angVel.clone();
      this.ragdoll.activate((p, out) => out.copy(v.vel).add(w.clone().cross(p.clone().sub(com))));
      this.toWorldSpace();
    }
    this.ragdoll.release('left');
    this.ragdoll.release('right');
    this.ragdoll.tethers = [];
    this.ragdoll.tone = 0.12;
    this.emptyThrottle = this.state === 'hanging' ? this.deathGrip : 0;
    v.ctl.forcedThrottle = this.emptyThrottle;
    v.setEmpty(true);
    this.popHelmet();
    this.detachCause = cause;
    this.detachT = 0;
    this.settledT = 0;
    this.settledReported = false;
    this.setState('detached');
    this.events.emit('rider_detached', { speed: speed || v.speed, cause, vehicleMoving: v.speed > 2 });
  }

  recover() {
    const v = this.vehicle;
    const fromOne = this.hands === 1;
    // Capture the ragdoll pose, move the rig back into vehicle space, blend to the seat.
    this.ryker.update(v, 1);
    this.ragdoll.sync();
    this.rig.root.updateMatrixWorld(true);
    this.ryker.root.attach(this.rig.root);
    this.rootFromPos.copy(this.rig.root.position);
    this.rootFromQuat.copy(this.rig.root.quaternion);
    this.blendFrom.clear();
    for (const [name, b] of this.rig.bones) this.blendFrom.set(name, { q: b.quaternion.clone(), p: b.position.clone() });
    this.ragdoll.deactivate();
    v.riderCol.setEnabled(true);
    v.setRiderCollision(false);
    v.ctl.forcedThrottle = 0;
    v.ctl.steerAuthority = 1;
    this.recoverT = 0;
    this.decelHist = []; // speed history from before the hang is not a crash
    this.strain = 0;
    this.setState('recovering');
    this.events.emit('rider_recovered', { fromOneHand: fromOne, dragMetres: this.dragMetres });
  }

  /** Full reset for a respawn. */
  reset() {
    this.ragdoll.deactivate();
    if (this.rig.root.parent !== this.ryker.root) this.ryker.root.add(this.rig.root);
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.quaternion.identity();
    this.rig.resetPose();
    this.strain = 0;
    this.haul = 0;
    this.grip = 1;
    this.hands = 2;
    this.protectT = 0.5;
    this.grab.target = this.grab.weight = 0;
    this.vehicle.ctl.forcedThrottle = 0;
    this.vehicle.ctl.steerAuthority = 1;
    this.emptyThrottle = 0;
    this.lean.set(0, 0, 0);
    this.leanVel.set(0, 0, 0);
    this.prevVel.copy(this.vehicle.vel);
    this.decelHist = []; // a respawn's instant stop is not a crash
    this.entryT = 0;
    this.lastPelvisVel = null;
    this.clearHelmet();
    this.setState('seated');
    this.cur = cloneParams(this.poses.seated);
  }

  private setState(s: RiderState) {
    if (s === this.state) return;
    const from = this.state;
    this.state = s;
    this.stateT = 0;
    this.events.emit('rider_state', { from, to: s });
  }

  private toWorldSpace() {
    this.scene.add(this.rig.root);
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.quaternion.identity();
    this.rig.root.updateMatrixWorld(true);
  }

  /** Grip contact points in vehicle space (rotated with the current steer). */
  private gripPointsLocal() {
    const q = new THREE.Quaternion().setFromAxisAngle(STEER_AXIS, -this.vehicle.steerAngle * 0.55);
    const f = this.rig.fit;
    const pt = (s: Side) => new THREE.Vector3().fromArray(f.arms[s].contact).sub(STEER_PIVOT).applyQuaternion(q).add(STEER_PIVOT);
    return { left: pt('left'), right: pt('right') };
  }

  // ------------------------------------------------------------------ helmet

  private popHelmet() {
    const h = this.rig.helmet;
    if (!h || this.helmetOff) return;
    // Bake the skinned helmet at its current pose into a rigid prop.
    h.updateMatrixWorld(true);
    const src = h.geometry;
    const n = src.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const tmp = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      h.getVertexPosition(i, tmp);
      tmp.applyMatrix4(h.matrixWorld);
      pos.set([tmp.x, tmp.y, tmp.z], i * 3);
      c.add(tmp);
    }
    c.divideScalar(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] -= c.x;
      pos[i * 3 + 1] -= c.y;
      pos[i * 3 + 2] -= c.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
    if (src.index) g.setIndex(src.index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, h.material);
    mesh.castShadow = true;
    mesh.position.copy(c);
    this.scene.add(mesh);
    h.visible = false;
    const body = this.phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setCcdEnabled(true).setAngularDamping(0.4).setLinearDamping(0.1),
    );
    this.phys.world.createCollider(RAPIER.ColliderDesc.ball(0.15).setMass(1.4).setRestitution(0.55).setFriction(0.5).setCollisionGroups(COL.helmet), body);
    const hv = this.ragdoll.active ? this.ragdoll.part('head')!.body.linvel() : this.vehicle.vel;
    body.setLinvel({ x: hv.x * 0.9, y: hv.y + 3.2, z: hv.z * 0.9 }, true);
    body.setAngvel({ x: 7, y: 3, z: -5 }, true);
    this.helmet = { mesh, body };
    this.helmetOff = true;
    this.events.emit('helmet_off', {});
  }

  private stepHelmet() {
    if (!this.helmet) return;
    const t = this.helmet.body.translation();
    const r = this.helmet.body.rotation();
    this.helmet.mesh.position.set(t.x, t.y, t.z);
    this.helmet.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  private clearHelmet() {
    if (this.helmet) {
      this.scene.remove(this.helmet.mesh);
      this.helmet.mesh.geometry.dispose();
      this.phys.world.removeRigidBody(this.helmet.body);
      this.helmet = null;
    }
    this.helmetOff = false;
    if (this.rig.helmet) this.rig.helmet.visible = true;
  }

  // ------------------------------------------------------------------ render rate

  /** Pose the skeleton for this frame. */
  renderPose(dt: number) {
    if (this.ragdoll.active && ((this.state === 'hanging' && this.entryT <= 0) || this.state === 'detached')) {
      this.ragdoll.sync();
      this.phone.visible = false;
      return;
    }
    // Secondary motion springs (render-rate is fine; purely visual).
    if (dt > 0) {
      const v = this.vehicle;
      const acc = _v.copy(v.vel).sub(this.prevRenderVel).divideScalar(Math.max(dt, 1e-3));
      this.prevRenderVel.copy(v.vel);
      acc.y -= SIM.gravity;
      const f = acc.applyQuaternion(_q.copy(v.quat).invert());
      const target = _v2.set(THREE.MathUtils.clamp(f.z * 0.018, -0.35, 0.35), 0, THREE.MathUtils.clamp(f.x * 0.012, -0.3, 0.3));
      if (!v.grounded) target.set(-0.08, 0, 0);
      const k = 70;
      const c = 8.5;
      this.leanVel.addScaledVector(target.sub(this.lean), k * dt).multiplyScalar(Math.exp(-c * dt));
      this.lean.addScaledVector(this.leanVel, dt);
      const bobT = v.grounded ? THREE.MathUtils.clamp(-(f.y - -SIM.gravity) * 0.004, -0.12, 0.06) : 0.03;
      this.bobVel += (bobT - this.bob) * 90 * dt;
      this.bobVel *= Math.exp(-10 * dt);
      this.bob += this.bobVel * dt;
    }
    const p = this.cur;
    lerpParams(p, this.poses.seated, this.poses.seated, 0);
    const unsettled = this.state === 'unsettled' ? Math.min(1, (this.strain - 0.15) / 0.55) : this.state === 'seated' ? Math.max(0, (this.strain - 0.12) * 0.8) : 0;
    if (unsettled > 0) lerpParams(p, p, this.poses.unsettled, Math.min(1, unsettled));
    if (this.vehicle.charge > 0) lerpParams(p, p, this.poses.crouch, this.vehicle.charge * 0.8);
    if (this.grab.weight > 0) lerpParams(p, p, this.poses[this.grab.pose], this.grab.weight);
    if (this.manualLean !== 0) p.spine.x += this.manualLean;
    const steerQ = _q.setFromAxisAngle(STEER_AXIS, -this.vehicle.steerAngle * 0.55);
    solvePose(this.rig, p, { steerQ, steerPivot: STEER_PIVOT, lean: this.lean, bob: this.bob });
    this.phone.visible = p.phone > 0.5;

    if (this.state === 'recovering') {
      // Haul back onto the seat: blend from the captured ragdoll pose.
      const t = Math.min(1, this.recoverT / RIDER.recoverBlend);
      const e = t * t * (3 - 2 * t);
      for (const [name, b] of this.rig.bones) {
        const from = this.blendFrom.get(name);
        if (!from) continue;
        b.quaternion.slerpQuaternions(from.q, b.quaternion.clone(), e);
        if (name === BONES.pelvis) b.position.lerpVectors(from.p, b.position.clone(), e);
      }
      this.rig.root.position.lerpVectors(this.rootFromPos, new THREE.Vector3(), e);
      this.rig.root.quaternion.slerpQuaternions(this.rootFromQuat, new THREE.Quaternion(), e);
    } else if (this.rig.root.parent === this.ryker.root) {
      this.rig.root.position.set(0, 0, 0);
      this.rig.root.quaternion.identity();
    }
  }
  private prevRenderVel = new THREE.Vector3();
}
