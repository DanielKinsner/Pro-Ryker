import * as THREE from 'three';
import { SIM, SESSION, CAMERA } from '../config/tuning';
import { EventBus } from '../core/events';
import type { Input, InputFrame } from '../core/input';
import { loadSave, writeSave, type SaveData, type Cheats } from '../core/save';
import { PhysicsWorld } from '../physics/world';
import { Vehicle } from '../physics/vehicle';
import type { Park } from '../park/build';
import { GAPS, LETTERS, SPAWNS, PARKING_BAYS, type GapDef } from '../park/layout';
import type { Props } from '../park/props';
import type { RykerVisual } from '../render/vehicleModel';
import type { RiderRig } from '../rider/rig';
import { RiderController } from '../rider/rider';
import { TrickSystem } from './tricks';
import { GOALS, CHEAT_UNLOCKS, TAPE_POS } from './goals';
import { Explore } from './explore';
import type { ChaseCam } from '../render/camera';

export type Mode = 'career' | 'free' | 'practice';

interface Collectible {
  kind: 'letter' | 'tape';
  letter: string;
  index: number;
  pos: THREE.Vector3;
  mesh: THREE.Object3D;
  taken: boolean;
}

export class Game {
  events = new EventBus();
  vehicle: Vehicle;
  rider: RiderController;
  tricks: TrickSystem;
  explore: Explore;
  save: SaveData;
  mode: Mode = 'career';
  running = false;
  paused = false;
  timeLeft: number = SESSION.runSeconds;
  finishing = false;
  runScore = 0;
  runOver = false;
  simTime = 0;
  safe = { pos: new THREE.Vector3(), yaw: 0 };
  private safeT = 0;
  bailT = 0;
  collectibles: Collectible[] = [];
  lettersTaken = new Set<number>();
  conesDown = new Set<number>();
  runGoals = new Set<string>();
  private takeoff: { pos: THREE.Vector3; y: number } | null = null;
  lastLanding = { quality: 'clean', reason: '' };
  airborneWasVert = false;
  private wideCam = 0;
  private hadFaceManual = false;
  onGoal: ((id: string, name: string) => void) | null = null;
  onRunEnd: ((score: number) => void) | null = null;
  onCheatUnlocked: ((name: string, desc: string) => void) | null = null;

  constructor(
    public phys: PhysicsWorld,
    public park: Park,
    public ryker: RykerVisual,
    public rig: RiderRig,
    public scene: THREE.Scene,
    public cam: ChaseCam,
    public input: Input,
  ) {
    this.save = loadSave();
    this.vehicle = new Vehicle(phys);
    this.rider = new RiderController(rig, this.vehicle, ryker, scene, phys, this.events);
    this.tricks = new TrickSystem(this.vehicle, this.rider, park.rails, this.events);
    this.explore = new Explore(this);
    this.wire();
    this.buildCollectibles();
    this.applyCheats();
    this.respawn(SPAWNS[0].x, SPAWNS[0].z, SPAWNS[0].yawDeg);
  }

  // ---------------------------------------------------------------- wiring

  private wire() {
    const v = this.vehicle;
    const ev = this.events;
    v.onAirborne = (vert) => {
      this.takeoff = { pos: v.pos.clone(), y: v.pos.y };
      this.airborneWasVert = vert;
      ev.emit('airborne', { vert, speed: v.speed });
    };
    v.onOllie = (charge) => ev.emit('ollie', { charge });
    v.onLanding = (e) => {
      this.cam.addShake(Math.min(0.9, e.impact * 0.05));
      if (!this.rider.attached) {
        // The empty Ryker landing a stunt on its own.
        if (this.rider.state === 'detached' && e.quality !== 'slam' && e.airTime > 0.5) this.bikeLandedAlone = true;
        return;
      }
      this.lastLanding = { quality: e.quality, reason: e.reason };
      ev.emit('landed', { quality: e.quality, airTime: e.airTime, fakie: e.fakie, impact: e.impact, reason: e.reason });
      this.checkGaps();
      if (e.quality === 'slam') {
        this.tricks.lose(e.reason);
        this.rider.detach(e.reason, e.speed);
        return;
      }
      this.tricks.onLanded(e.quality, e.fakie);
      if (e.quality === 'sketchy') this.rider.addStrain(e.strain, e.reason);
      else if (e.quality === 'bad') this.rider.hang(e.reason);
    };
    v.onTumble = (upY) => {
      if (!this.rider.attached) return;
      if (upY < 0.35) {
        this.tricks.lose('rolled the Ryker');
        this.rider.detach('rolled the Ryker', v.speed);
      } else this.rider.addStrain(0.5, 'bottomed out');
    };
    ev.on('rider_detached', () => {
      this.tricks.lose('bailed');
      if (this.recordsEnabled) this.save.bails++;
      this.bailT = 0;
    });
    ev.on('rider_recovered', (e) => {
      this.tricks.onRecovered(e.fromOneHand);
      if (this.recordsEnabled) this.save.dragMetres += e.dragMetres;
      if (e.dragMetres >= 20) this.completeGoal('reenact');
    });
    ev.on('hang_entered', () => (this.hadFaceManual = true));
    ev.on('combo_banked', (e) => {
      this.runScore = this.tricks.score;
      if (this.recordsEnabled && e.score > this.save.bestCombo) this.save.bestCombo = e.score;
      if (this.hadFaceManual && e.score >= 10000 && e.names.some((n) => n.includes('FACE MANUAL'))) this.completeGoal('stillcounts');
      this.hadFaceManual = false;
      this.checkScoreGoals();
    });
    ev.on('combo_lost', () => (this.hadFaceManual = false));
    ev.on('gap', (e) => {
      if (e.id === 'roof') this.completeGoal('roof');
      if (e.id === 'planter') this.completeGoal('planter');
      if (this.recordsEnabled && !this.save.gaps.includes(e.id)) {
        this.save.gaps.push(e.id);
        this.persist();
      }
    });
    ev.on('prop_hit', (e) => {
      if (e.kind === 'cone') {
        this.conesDown.add(e.id);
        if (this.conesDown.size >= 5) this.completeGoal('cones');
      }
    });
  }
  bikeLandedAlone = false;
  props: Props | null = null;
  /** Attract-mode demo: nothing it does counts (goals, records, save). */
  demo = false;
  get recordsEnabled() {
    return !this.demo && this.mode !== 'practice';
  }
  private emptyStillT = 0;
  private emptyReported = false;

  // ---------------------------------------------------------------- run control

  startRun(mode: Mode) {
    this.mode = mode;
    this.running = true;
    this.paused = false;
    this.runOver = false;
    this.finishing = false;
    this.timeLeft = mode === 'career' ? SESSION.runSeconds : Infinity;
    this.tricks.score = 0;
    this.tricks.special = 0;
    this.tricks.specialReady = false;
    this.tricks.pop = { text: '', t: 99, kind: 'trick' };
    this.hadFaceManual = false;
    this.runScore = 0;
    this.lettersTaken.clear();
    this.conesDown.clear();
    this.runGoals.clear();
    this.explore.reset();
    for (const c of this.collectibles) {
      c.taken = c.kind === 'tape' ? this.save.goals.includes('tape') : false;
      c.mesh.visible = !c.taken;
    }
    if (this.recordsEnabled) this.save.runs++;
    this.props?.reset();
    const s = SPAWNS[0];
    this.respawn(s.x, s.z, s.yawDeg);
    this.events.emit('run_start', { mode });
  }

  endRun() {
    if (this.runOver || !this.recordsEnabled) return;
    this.runOver = true;
    this.running = false;
    if (this.tricks.combo.active && this.rider.attached) this.tricks.bank();
    const score = this.tricks.score;
    if (this.mode === 'career') this.save.best = Math.max(this.save.best, score);
    else this.save.bestFree = Math.max(this.save.bestFree, score);
    this.persist();
    this.events.emit('run_end', { score });
    this.onRunEnd?.(score);
  }

  respawn(x: number, z: number, yawDeg: number, yHint?: number) {
    // With a height hint (a safe spot up on the highway or the on-ramp), find the surface under it;
    // otherwise it's the park's ground.
    const y = yHint === undefined ? this.park.heightAt(x, z) : (this.phys.groundHeight(x, z, yHint + 1.5) ?? yHint);
    this.vehicle.spawn(x, y, z, yawDeg);
    this.rider.reset();
    this.tricks.reset();
    this.safe.pos.set(x, y, z);
    this.safe.yaw = yawDeg;
    this.bailT = 0;
    this.bikeLandedAlone = false;
    this.emptyStillT = 0;
    this.emptyReported = false;
    this.takeoff = null;
    this.cam.snap(this.vehicle.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), this.vehicle.fwd);
    this.events.emit('run_reset', {});
  }

  respawnSafe() {
    this.respawn(this.safe.pos.x, this.safe.pos.z, this.safe.yaw, this.safe.pos.y);
  }

  // ---------------------------------------------------------------- fixed step

  step(dt: number, f: InputFrame) {
    this.simTime += dt;
    this.events.simTime = this.simTime;
    const v = this.vehicle;
    const r = this.rider;

    if (this.running && this.mode === 'career' && !this.runOver) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        // Time's up: let the current combo finish (capped), then end.
        if (!this.finishing) this.finishing = true;
        const busy = this.tricks.combo.active && (r.attached || r.hanging) && this.timeLeft > -SESSION.maxFinishGrace;
        if (!busy) this.endRun();
      }
    }

    // Controls → vehicle
    const c = v.ctl;
    const canDrive = r.attached || r.hanging;
    c.throttle = canDrive ? f.throttle : 0;
    c.brake = canDrive ? f.brake : 0;
    c.steer = canDrive ? f.steer : 0;
    c.pitch = canDrive ? f.pitch : 0;
    c.drift = canDrive && f.held.revert;
    c.ollieHeld = r.attached && f.held.ollie && !this.tricks.grind;
    c.ollieRelease = r.attached && f.released.ollie > 0 && !this.tricks.grind && !this.tricks.manual;
    if (!r.hanging && r.attached) {
      c.forcedThrottle = 0;
      c.steerAuthority = r.state === 'unsettled' ? 0.8 : 1;
    }
    if (this.runOver) {
      c.throttle = 0;
      c.brake = 0.4;
    }

    this.tricks.step(dt, f);
    r.step(dt, { haulPressed: f.pressed.ollie > 0, letGo: f.held.letgo, brake: f.brake });
    v.preStep(dt);
    this.phys.step();
    v.postStep();
    this.tricks.tickSpecial(dt);
    this.props?.update();

    // The empty Ryker coming to rest on its own (VALET PARKING if it's upright in a service bay).
    if (r.state === 'detached' && !this.emptyReported) {
      this.emptyStillT = v.speed < 0.3 ? this.emptyStillT + dt : 0;
      if (this.emptyStillT > 1) {
        this.emptyReported = true;
        const inBay = PARKING_BAYS.some((b) => Math.abs(v.pos.x - b.x) < b.hx && Math.abs(v.pos.z - b.z) < b.hz);
        this.events.emit('empty_bike_settled', { upright: v.up.y > 0.8, inParkingBay: inBay });
      }
    }

    // Head meets concrete while seated → immediate bail (no forced warning delay).
    if (r.attached && r.state !== 'recovering' && v.riderTouching() && v.speed > 1.5) {
      this.tricks.lose('head met concrete');
      r.detach('head met concrete', v.speed);
    }

    // Safe respawn points
    this.safeT += dt;
    if (this.safeT > 0.25) {
      this.safeT = 0;
      if (r.state === 'seated' && v.isSafe() && !this.tricks.grind && v.speed < 18) {
        this.safe.pos.copy(v.pos);
        const fw = v.fwd;
        this.safe.yaw = (Math.atan2(fw.x, -fw.z) * 180) / Math.PI;
      }
    }

    // After a bail: any drive input respawns (after a beat so you can watch).
    if (r.state === 'detached') {
      this.bailT += dt;
      const wantsGo = f.pressed.ollie || f.pressed.restart || (f.throttle > 0.5 && this.bailT > 1.2);
      if ((wantsGo && this.bailT > 0.35) || this.bailT > 6) this.respawnSafe();
    } else if (f.pressed.restart) {
      this.respawnSafe();
    }

    this.checkCollectibles();
    this.explore.step(dt);
  }

  // ---------------------------------------------------------------- render

  render(dt: number, alpha: number) {
    const v = this.vehicle;
    this.ryker.update(v, alpha);
    this.rider.renderPose(dt);
    for (const c of this.collectibles) {
      if (!c.taken) {
        c.mesh.rotation.y += dt * 2.2;
        c.mesh.position.y = c.pos.y + Math.sin(this.simTime * 2 + c.index) * 0.15;
      }
    }
    // Camera: follow the Ryker; after a bail, frame the rider (keeping the bike in view).
    const r = this.rider;
    let target = this.ryker.root.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    let wide = 0;
    if (r.state === 'hanging') wide = CAMERA.hangExtra;
    if (r.state === 'detached' && r.ragdoll.active) {
      const p = r.ragdoll.pelvisPos(new THREE.Vector3());
      const d = p.distanceTo(v.pos);
      target = p.lerp(target, d < 12 ? 0.35 : 0.1);
      wide = Math.min(6, 1.5 + d * 0.25);
    }
    if (!v.grounded && v.airTime > 0.6) wide = Math.max(wide, 1.2);
    this.wideCam = wide;
    const vel = r.state === 'detached' && r.ragdoll.active ? r.ragdoll.pelvisVel(new THREE.Vector3()) : v.vel;
    this.cam.update(dt, target, v.fwd, vel, { airborne: !v.grounded, vert: v.vertAir, wide: this.wideCam });
  }

  // ---------------------------------------------------------------- gaps, letters, goals

  private checkGaps() {
    if (!this.takeoff) return;
    const from = this.takeoff;
    const to = this.vehicle.pos;
    const inBox = (b: GapDef['from'], p: THREE.Vector3) =>
      Math.abs(p.x - b.x) <= b.hx && Math.abs(p.z - b.z) <= b.hz && (b.minY === undefined || p.y >= b.minY);
    for (const g of GAPS) {
      if (inBox(g.from, from.pos) && inBox(g.to, to) && from.pos.distanceTo(to) > 2) {
        this.tricks.combo.add(`gap:${g.id}`, g.name, g.points);
        this.events.emit('gap', { id: g.id, name: g.name, points: g.points });
      }
    }
    this.takeoff = null;
  }

  private buildCollectibles() {
    LETTERS.forEach((l, i) => {
      const mesh = letterSprite(l.letter);
      mesh.position.set(l.x, l.y, l.z);
      this.scene.add(mesh);
      this.collectibles.push({ kind: 'letter', letter: l.letter, index: i, pos: new THREE.Vector3(l.x, l.y, l.z), mesh, taken: false });
    });
    const tape = tapeMesh();
    tape.position.set(TAPE_POS.x, TAPE_POS.y, TAPE_POS.z);
    this.scene.add(tape);
    this.collectibles.push({ kind: 'tape', letter: 'TAPE', index: 9, pos: new THREE.Vector3(TAPE_POS.x, TAPE_POS.y, TAPE_POS.z), mesh: tape, taken: this.save.goals.includes('tape') });
    tape.visible = !this.save.goals.includes('tape');
  }

  private checkCollectibles() {
    const v = this.vehicle;
    const probe = v.pos.clone().addScaledVector(v.up, 1.0);
    const riderP = this.rider.ragdoll.active && this.rider.hanging ? this.rider.ragdoll.pelvisPos(new THREE.Vector3()) : null;
    for (const c of this.collectibles) {
      if (c.taken) continue;
      const d = Math.min(probe.distanceTo(c.pos), riderP ? riderP.distanceTo(c.pos) : Infinity);
      if (d > 2.1) continue;
      if (!(this.rider.attached || this.rider.hanging)) continue;
      c.taken = true;
      c.mesh.visible = false;
      if (c.kind === 'letter') {
        this.lettersTaken.add(c.index);
        this.events.emit('letter', { letter: c.letter, index: c.index });
        if (this.lettersTaken.size === LETTERS.length) this.completeGoal('letters');
      } else {
        this.completeGoal('tape');
      }
    }
  }

  private checkScoreGoals() {
    const s = this.tricks.score;
    if (this.mode !== 'career') return;
    if (s >= 15000) this.completeGoal('score1');
    if (s >= 40000) this.completeGoal('score2');
    if (s >= 100000) this.completeGoal('score3');
  }

  completeGoal(id: string) {
    if (!this.recordsEnabled || this.runGoals.has(id)) return;
    this.runGoals.add(id);
    const def = GOALS.find((g) => g.id === id);
    if (!def) return;
    const isNew = !this.save.goals.includes(id);
    if (isNew) this.save.goals.push(id);
    this.events.emit('goal_complete', { id, name: def.name });
    this.onGoal?.(id, isNew ? def.name : `${def.name} (again)`);
    // Unlocks
    for (const u of CHEAT_UNLOCKS) {
      if (this.save.goals.length >= u.at && !this.save.cheatsUnlocked.includes(u.cheat)) {
        this.save.cheatsUnlocked.push(u.cheat);
        this.onCheatUnlocked?.(u.name, u.desc);
      }
    }
    this.persist();
  }

  // ---------------------------------------------------------------- cheats & save

  applyCheats() {
    const c = this.save.cheats;
    const on = (k: keyof Cheats) => c[k] && this.save.cheatsUnlocked.includes(k);
    this.rig.headScale = on('bigHead') ? 2.6 : 1;
    this.rig.applyHeadScale();
    this.phys.world.gravity = { x: 0, y: on('moonGravity') ? SIM.gravity * 0.42 : SIM.gravity, z: 0 };
    this.tricks.perfectBalance = on('perfectBalance');
    this.tricks.cheatsSpecialAlways = on('specialAlways');
    this.ryker.setMods(on('slingmodsParts'));
  }

  slomoActive() {
    const c = this.save.cheats;
    return c.slomo && this.save.cheatsUnlocked.includes('slomo') && !this.vehicle.grounded && this.vehicle.airTime > 0.25;
  }

  persist() {
    if (!this.demo) writeSave(this.save);
  }
}

function letterSprite(letter: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.font = '200px Anton, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 18;
  g.strokeStyle = '#111';
  g.strokeText(letter, 128, 138);
  g.fillStyle = '#ffd23f';
  g.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.05, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  const grp = new THREE.Group();
  grp.add(m, glow);
  return grp;
}

function tapeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.1), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4 }));
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4efe2';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#c21';
  x.font = '30px "Permanent Marker", cursive';
  x.fillText('DO NOT', 20, 40);
  x.fillText('WATCH', 60, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: t }));
  label.position.z = 0.051;
  g.add(body, label);
  const glow = new THREE.PointLight('#ffd23f', 2, 5);
  g.add(glow);
  return g;
}
