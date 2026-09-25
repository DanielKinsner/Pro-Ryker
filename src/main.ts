import * as THREE from 'three';
import './ui/styles.css';
import { initRapier, PhysicsWorld } from './physics/world';
import { createStage } from './render/scene';
import { buildPark } from './park/build';
import { buildRyker } from './render/vehicleModel';
import { loadGLB, loadJSON, MODELS } from './render/assets';
import { RiderRig, type RiderFit } from './rider/rig';
import { Input, type InputFrame, type Btn } from './core/input';
import { ChaseCam } from './render/camera';
import { SIM } from './config/tuning';
import { Game } from './game/game';
import { Hud } from './ui/hud';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

const BTNS: Btn[] = ['ollie', 'flip', 'grab', 'grind', 'revert', 'restart', 'pause', 'letgo', 'confirm', 'back', 'horn'];
/** Build an input frame by hand (scripted tests / bots). */
export function frameOf(p: Partial<Omit<InputFrame, 'held' | 'pressed' | 'released'>> & { held?: Partial<Record<Btn, boolean>>; pressed?: Partial<Record<Btn, number>>; released?: Partial<Record<Btn, number>> } = {}): InputFrame {
  const z = Object.fromEntries(BTNS.map((b) => [b, 0])) as Record<Btn, number>;
  const f = Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;
  return {
    throttle: p.throttle ?? 0,
    brake: p.brake ?? 0,
    steer: p.steer ?? 0,
    pitch: p.pitch ?? 0,
    dir: p.dir ?? 'none',
    recentDirs: p.recentDirs ?? [],
    device: 'keyboard',
    held: { ...f, ...p.held },
    pressed: { ...z, ...p.pressed },
    released: { ...z, ...p.released },
  };
}

async function boot() {
  ui.innerHTML = `<div class="boot">LOADING<span id="boot-p"></span></div>`;
  await initRapier();
  const stage = createStage(canvas);
  const phys = new PhysicsWorld();
  const park = buildPark(phys, stage.scene);
  const [rykerGltf, riderGltf, fit] = await Promise.all([loadGLB(MODELS.ryker), loadGLB(MODELS.rider), loadJSON<RiderFit>(MODELS.fit)]);
  const ryker = buildRyker(rykerGltf);
  stage.scene.add(ryker.root);
  const rig = new RiderRig(riderGltf, fit);
  ryker.root.add(rig.root);
  const input = new Input();
  const cam = new ChaseCam(stage.camera, phys);
  const game = new Game(phys, park, ryker, rig, stage.scene, cam, input);
  ui.innerHTML = '';
  const hud = new Hud(ui);
  game.onGoal = (_id, name) => hud.toast(name, '', 'goal');
  game.onCheatUnlocked = (name, desc) => hud.toast(name, desc, 'cheat');
  game.startRun('free');
  input.onPress = (b) => {
    if (b === 'horn') hud.toggleControls();
  };

  const dev = {
    paused: false,
    /** Run n fixed steps with a scripted frame (or a function of step index). */
    sim(n: number, f: InputFrame | ((i: number) => InputFrame)) {
      for (let i = 0; i < n; i++) game.step(SIM.dt, typeof f === 'function' ? f(i) : f);
      game.render(1 / 60, 1);
      return dev.state();
    },
    state() {
      const v = game.vehicle;
      return {
        pos: v.pos.toArray().map((n) => +n.toFixed(2)),
        spd: +v.speed.toFixed(2),
        up: v.up.toArray().map((n) => +n.toFixed(2)),
        grounded: v.grounded,
        air: +v.airTime.toFixed(2),
        rider: game.rider.state,
        strain: +game.rider.strain.toFixed(2),
        combo: game.tricks.combo.entries.map((e) => `${e.name}:${Math.round(e.base)}`).join(' + '),
        score: game.tricks.score,
      };
    },
    frameOf,
  };

  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden || dev.paused) dt = 0;
    const scale = game.slomoActive() ? 0.35 : 1;
    acc += dt * scale;
    let steps = 0;
    while (acc >= SIM.dt && steps < SIM.maxCatchUp) {
      game.step(SIM.dt, input.sample());
      acc -= SIM.dt;
      steps++;
    }
    if (steps >= SIM.maxCatchUp) acc = 0;
    game.render(dt, acc / SIM.dt);
    stage.followShadow(game.vehicle.pos);
    stage.renderer.render(stage.scene, stage.camera);
    hud.update(game);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as any).__game = { game, stage, phys, park, rig, ryker, cam, hud, dev, THREE };
}

boot().catch((e) => {
  console.error(e);
  ui.innerHTML = `<div class="boot err">${String(e.message ?? e)}</div>`;
});
