import * as THREE from 'three';
import './ui/styles.css';
import { initRapier, PhysicsWorld } from './physics/world';
import { createStage } from './render/scene';
import { buildPark } from './park/build';
import { SPAWNS } from './park/layout';
import { Vehicle } from './physics/vehicle';
import { buildRyker } from './render/vehicleModel';
import { loadGLB, loadJSON, MODELS } from './render/assets';
import { RiderRig, type RiderFit } from './rider/rig';
import { Input } from './core/input';
import { ChaseCam } from './render/camera';
import { SIM } from './config/tuning';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

async function boot() {
  ui.innerHTML = `<div class="boot">LOADING<span id="boot-p"></span></div>`;
  await initRapier();
  const stage = createStage(canvas);
  const phys = new PhysicsWorld();
  const park = buildPark(phys, stage.scene);
  const [rykerGltf, riderGltf, fit] = await Promise.all([loadGLB(MODELS.ryker), loadGLB(MODELS.rider), loadJSON<RiderFit>(MODELS.fit)]);
  const ryker = buildRyker(rykerGltf);
  stage.scene.add(ryker.root);
  const rider = new RiderRig(riderGltf, fit);
  ryker.root.add(rider.root);

  const vehicle = new Vehicle(phys);
  const sp = SPAWNS[0];
  vehicle.spawn(sp.x, park.heightAt(sp.x, sp.z), sp.z, sp.yawDeg);
  const input = new Input();
  const cam = new ChaseCam(stage.camera, phys);
  cam.snap(vehicle.pos, vehicle.fwd);
  ui.innerHTML = `<div id="dbg" class="dbg"></div>`;
  const dbg = document.getElementById('dbg')!;

  // Dev hook: run N fixed steps synchronously with scripted controls (for testing in throttled panes).
  const script: Partial<typeof vehicle.ctl> = {};
  const simSteps = (n: number, ctl: Partial<typeof vehicle.ctl> = {}) => {
    for (let i = 0; i < n; i++) {
      Object.assign(vehicle.ctl, ctl);
      vehicle.preStep(SIM.dt);
      phys.step();
      vehicle.postStep();
      vehicle.ctl.ollieRelease = false;
    }
    ryker.update(vehicle, 1);
    return {
      pos: vehicle.pos.toArray().map((n) => +n.toFixed(2)),
      spd: +vehicle.speed.toFixed(2),
      up: vehicle.up.toArray().map((n) => +n.toFixed(2)),
      grounded: vehicle.grounded,
      contacts: vehicle.contacts,
      air: +vehicle.airTime.toFixed(2),
    };
  };
  void script;
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) dt = 0;
    acc += dt;
    let steps = 0;
    if ((window as any).__game?.paused) acc = 0;
    while (acc >= SIM.dt && steps < SIM.maxCatchUp) {
      const f = input.sample();
      const c = vehicle.ctl;
      c.throttle = f.throttle;
      c.brake = f.brake;
      c.steer = f.steer;
      c.pitch = f.pitch;
      c.drift = f.held.revert;
      c.ollieHeld = f.held.ollie;
      c.ollieRelease = f.released.ollie > 0;
      if (f.pressed.restart) {
        vehicle.spawn(sp.x, park.heightAt(sp.x, sp.z), sp.z, sp.yawDeg);
      }
      vehicle.preStep(SIM.dt);
      phys.step();
      vehicle.postStep();
      acc -= SIM.dt;
      steps++;
    }
    if (steps >= SIM.maxCatchUp) acc = 0;
    const alpha = acc / SIM.dt;
    ryker.update(vehicle, alpha);
    const target = ryker.root.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    cam.update(dt, target, vehicle.fwd, vehicle.vel, { airborne: !vehicle.grounded, vert: vehicle.vertAir, wide: 0 });
    stage.followShadow(vehicle.pos);
    stage.renderer.render(stage.scene, stage.camera);
    dbg.textContent = `spd ${vehicle.speed.toFixed(1)} m/s  contacts ${vehicle.contacts}  ${vehicle.grounded ? 'GROUND' : 'AIR ' + vehicle.airTime.toFixed(2)}  up.y ${vehicle.up.y.toFixed(2)}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as any).__game = { vehicle, phys, park, stage, rider, ryker, cam, simSteps, SPAWNS, spawn: (i = 0) => { const s = SPAWNS[i]; vehicle.spawn(s.x, park.heightAt(s.x, s.z), s.z, s.yawDeg); }, paused: false };
}

boot().catch((e) => {
  console.error(e);
  ui.innerHTML = `<div class="boot err">${String(e.message ?? e)}</div>`;
});
