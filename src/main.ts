import * as THREE from 'three';
import './ui/styles.css';
import { initRapier, PhysicsWorld } from './physics/world';
import { createStage } from './render/scene';
import { buildPark } from './park/build';
import { buildStructures } from './park/structures';
import { Props } from './park/props';
import { Crowd } from './park/crowd';
import { buildRyker } from './render/vehicleModel';
import { loadGLB, loadJSON, MODELS } from './render/assets';
import { RiderRig, type RiderFit } from './rider/rig';
import { Input, frameOf, type InputFrame } from './core/input';
import { ChaseCam } from './render/camera';
import { SIM } from './config/tuning';
import { Game, type Mode } from './game/game';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { AudioEngine } from './audio/audio';
import { SoundDirector, ComedyDirector } from './audio/director';
import { LETTERS } from './park/layout';
import { Replay } from './game/replay';
import { Fx } from './render/fx';
import { Attract } from './game/attract';
import { FirstRide } from './game/firstRide';
import { FirstRideView } from './ui/firstRide';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

// Optional backdrop module (scenery around the park) — picked up automatically when present.
const backdropMods = import.meta.glob('./park/backdrop.ts', { eager: true }) as Record<string, { buildBackdrop?: (s: THREE.Scene, p: PhysicsWorld) => unknown }>;

const TIPS = [
  'Your weight on the handlebar is also your weight on the throttle. Brake. Then mash.',
  'Let go of a grab before you land. The seat is not going to come find you.',
  'Speed alone will never throw you off. Everything else might.',
  'Hit L just as you land to link a manual and keep the combo alive.',
  'Land backwards? That is a fakie. Hit SHIFT to revert and keep the combo.',
  'The pavilion roof is load-bearing. Probably.',
  'Somewhere in this park is a tape. It is not somewhere sensible.',
  'Rear manual too far back and you will loop out. He will still be holding on.',
];

function loadingScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'loading';
  wrap.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/art/loading.jpg)`;
  wrap.innerHTML = `<div class="loading-box"><div class="loading-title">LOADING THE RYKER…</div><div class="loading-bar"><i></i></div><div class="loading-tip"></div></div>`;
  ui.appendChild(wrap);
  const bar = wrap.querySelector('i') as HTMLElement;
  const tip = wrap.querySelector('.loading-tip') as HTMLElement;
  let t = Math.floor(Math.random() * TIPS.length);
  tip.textContent = `TIP: ${TIPS[t]}`;
  const iv = setInterval(() => {
    t = (t + 1) % TIPS.length;
    tip.textContent = `TIP: ${TIPS[t]}`;
  }, 3200);
  return {
    progress: (f: number) => (bar.style.width = `${Math.round(Math.min(1, f) * 100)}%`),
    done: () => {
      clearInterval(iv);
      wrap.style.transition = 'opacity 0.5s';
      wrap.style.opacity = '0';
      setTimeout(() => wrap.remove(), 520);
    },
  };
}

async function boot() {
  const loading = loadingScreen();
  let pr = 0.02;
  const bump = (f: number) => loading.progress((pr = Math.max(pr, f)));
  await initRapier();
  const stage = createStage(canvas);
  const phys = new PhysicsWorld();
  const park = buildPark(phys, stage.scene);
  buildStructures(stage.scene, phys);
  for (const m of Object.values(backdropMods)) m.buildBackdrop?.(stage.scene, phys);
  bump(0.12);
  let pRyker = 0;
  let pRider = 0;
  const [rykerGltf, riderGltf, fit] = await Promise.all([
    loadGLB(MODELS.ryker, (f) => ((pRyker = f), bump(0.12 + 0.7 * (pRyker * 0.85 + pRider * 0.15)))),
    loadGLB(MODELS.rider, (f) => ((pRider = f), bump(0.12 + 0.7 * (pRyker * 0.85 + pRider * 0.15)))),
    loadJSON<RiderFit>(MODELS.fit),
  ]);
  const ryker = buildRyker(rykerGltf);
  stage.scene.add(ryker.root);
  const rig = new RiderRig(riderGltf, fit);
  ryker.root.add(rig.root);
  const input = new Input();
  const cam = new ChaseCam(stage.camera, phys);
  const game = new Game(phys, park, ryker, rig, stage.scene, cam, input);
  game.props = new Props(stage.scene, phys, game.events, park.heightAt);
  const crowd = new Crowd(stage.scene, phys, game);
  bump(0.86);

  // Audio: load the essentials now, voices in the background.
  const audio = new AudioEngine();
  const sound = new SoundDirector(audio, game);
  const comedy = new ComedyDirector(audio, game);
  await Promise.race([sound.preload(), new Promise((r) => setTimeout(r, 6000))]);
  void comedy.preload();
  bump(1);

  const hud = new Hud(ui);
  hud.root.style.display = 'none';
  const captions = document.createElement('div');
  captions.className = 'captions';
  ui.appendChild(captions);
  comedy.onCaption = (speaker, text) => {
    const c = document.createElement('div');
    c.className = 'caption';
    c.innerHTML = `<b>${speaker}</b>${text}`;
    captions.appendChild(c);
    while (captions.children.length > 2) captions.firstChild!.remove();
    setTimeout(() => c.classList.add('out'), 3400);
    setTimeout(() => c.remove(), 3900);
  };
  game.onGoal = (_id, name) => hud.toast(name, '', 'goal');
  game.onCheatUnlocked = (name, desc) => hud.toast(name, desc, 'cheat');
  game.explore.onSecret = (s) => hud.toast(s.name, s.sub, 'secret');
  game.events.on('fell_off_map', () => hud.toast('FELL OFF THE MAP', 'Put back where you started.', 'info'));
  const replay = new Replay(game, stage, ui);
  const fx = new Fx(stage.scene, game);
  const attract = new Attract(game);
  const startAttract = () => {
    game.demo = true;
    comedy.enabled = false;
    attract.start();
    cam.mode = 'follow';
    audio.sfx.gain.setTargetAtTime(game.save.settings.sfx * 0.3, audio.ctx.currentTime, 0.2);
  };
  const stopAttract = () => {
    attract.stop();
    game.demo = false;
    comedy.enabled = true;
    audio.stopLoops();
  };

  type App = 'title' | 'menu' | 'run' | 'paused' | 'results' | 'replay';
  let app: App = 'title';
  const firstRide = new FirstRide(game, () => {
    game.save.introCompleted = true;
    game.persist();
    game.running = false;
    game.paused = true;
    app = 'results';
    audio.stopLoops();
    hud.root.style.display = 'none';
    menus.show('intro-done', false);
    void audio.playMusic('results-sting', { loop: false, fade: 0.2 });
  });
  const firstRideView = new FirstRideView(hud.guidance, firstRide, () => startRun('free'));
  const RUN_TRACKS = ['run-punk', 'run-hiphop', 'run-ska'];
  let track = Math.floor(Math.random() * RUN_TRACKS.length);
  audio.onMusicEnded = (id) => {
    if (RUN_TRACKS.includes(id) && (app === 'run' || app === 'paused')) {
      track = (track + 1) % RUN_TRACKS.length;
      void audio.playMusic(RUN_TRACKS[track], { loop: false });
    }
  };

  const applySettings = () => {
    const s = game.save.settings;
    audio.setVolumes(s);
    comedy.language = s.language;
    cam.shakeScale = s.shake ? 1 : 0;
    hud.root.classList.toggle('no-controls', !s.showControls);
    stage.setQuality(s.quality);
    game.persist();
  };

  const toTitleCamera = () => {
    cam.mode = 'orbit';
    hud.root.style.display = 'none';
  };

  const menus = new Menus(ui, game, {
    startRun: (mode: Mode) => startRun(mode),
    resume: () => {
      app = 'run';
      game.paused = false;
      input.sample();
    },
    restart: () => startRun(game.mode),
    quitToMenu: () => {
      firstRide.stop();
      game.running = false;
      audio.stopLoops();
      app = 'menu';
      toTitleCamera();
      void audio.playMusic('title-theme');
      menus.show('main', false);
      startAttract();
    },
    applySettings,
    applyCheats: () => {
      game.applyCheats();
      game.persist();
    },
    sfx: (n) => audio.play(`sfx/ui-${n}.mp3`, { vol: 0.8, bus: audio.sfx }),
    hasFootage: () =>
      fetch(`${import.meta.env.BASE_URL}media/original.mp4`, { method: 'HEAD' })
        .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('video'))
        .catch(() => false),
    onScreen: (name) => {
      firstRideView.update(game);
      if (name === 'footage') {
        audio.stopMusic(0.5);
        audio.stopLoops();
      }
      else if ((app === 'menu' || app === 'title') && !audio.musicId) void audio.playMusic('title-theme');
    },
  });

  const startRun = (mode: Mode) => {
    firstRide.stop();
    if (attract.active) stopAttract();
    menus.close();
    app = 'run';
    cam.mode = 'follow';
    hud.root.style.display = '';
    game.startRun(mode);
    if (mode === 'practice') firstRide.start();
    comedy.enabled = mode !== 'practice';
    captions.replaceChildren();
    input.sample();
    track = (track + 1) % RUN_TRACKS.length;
    void audio.playMusic(RUN_TRACKS[track], { loop: false, fade: 0.8 });
    applySettings();
    hud.update(game);
    firstRideView.update(game);
  };

  const stepRun = (dt: number, f: InputFrame) => {
    game.step(dt, f);
    firstRide.step(dt, f);
  };

  game.onRunEnd = (score) => {
    app = 'results';
    audio.stopLoops();
    void audio.playMusic('results-sting', { loop: false, fade: 0.2 });
    const s = game.save;
    menus.results(score, {
      best: s.best,
      newBest: score > 0 && score >= s.best,
      goals: [...game.runGoals],
      letters: LETTERS.map((l, i) => (game.lettersTaken.has(i) ? l.letter : '_')).join(''),
      drag: runDrag,
      bails: runBails,
      combo: s.bestCombo,
    });
  };
  let runDrag = 0;
  let runBails = 0;
  let controlsHintT = 0;
  game.events.on('run_start', () => {
    hud.reset();
    runDrag = 0;
    runBails = 0;
    replay.clear();
    fx.clear();
    crowd.reset();
    controlsHintT = 0;
    hud.root.classList.remove('hint-faded');
  });
  game.events.on('rider_recovered', (e) => (runDrag += e.dragMetres));
  game.events.on('rider_detached', () => {
    runBails++;
    runDrag += game.rider.dragMetres;
  });

  input.onPress = (b) => {
    if (app === 'replay') {
      if (b === 'down') {
        replay.saveClip();
        return;
      }
      replay.stop();
      app = replayReturn;
      input.sample();
      return;
    }
    if (menus.open) {
      menus.press(b);
      return;
    }
    if (app === 'run') {
      if (b === 'pause') {
        app = 'paused';
        game.paused = true;
        audio.stopLoops();
        menus.show('pause');
      } else if (b === 'horn') audio.play('sfx/horn.mp3', { vol: 0.9 });
      else if (b === 'back' && !firstRide.active && game.rider.state === 'detached' && replay.available) startReplay();
    }
  };
  // Losing focus mid-run pauses (never let the Ryker drive off while you're in another window).
  const autoPause = () => {
    if (app === 'run') {
      app = 'paused';
      game.paused = true;
      audio.stopLoops();
      menus.show('pause');
    }
  };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => document.hidden && autoPause());
  let replayReturn: App = 'run';
  const startReplay = () => {
    replayReturn = app;
    app = 'replay';
    game.paused = true;
    audio.stopLoops();
    replay.play();
  };
  game.events.on('rider_detached', () => {
    if (!game.demo && !firstRide.active) hud.toast('INCIDENT RECORDED', 'Press BACKSPACE for the replay', 'info');
  });

  // Dev-only console hooks (scripted testing); not exposed in production builds.
  const hooks = { game, stage, phys, park, rig, ryker, cam, hud, menus, audio, comedy, replay, fx, attract, crowd, firstRide, dev: null as unknown, THREE };
  if (import.meta.env.DEV) (window as any).__game = hooks;

  // Title screen over an orbiting view of the park.
  loading.done();
  toTitleCamera();
  applySettings();
  menus.show('title');
  startAttract();
  const titleMusic = () => {
    if (app === 'title' || app === 'menu') void audio.playMusic('title-theme');
    window.removeEventListener('keydown', titleMusic);
    window.removeEventListener('pointerdown', titleMusic);
  };
  window.addEventListener('keydown', titleMusic);
  window.addEventListener('pointerdown', titleMusic);
  menus.root.addEventListener('click', () => {
    if (menus.screen === 'title') menus.press('confirm');
  });
  const origShow = menus.show.bind(menus);
  menus.show = (name: string, push = true) => {
    if (name === 'main' && app === 'title') app = 'menu';
    origShow(name, push);
  };

  const dev = {
    paused: false,
    /** Run n fixed steps with a scripted frame (or a function of step index). */
    sim(n: number, f: InputFrame | ((i: number) => InputFrame)) {
      for (let i = 0; i < n && !game.paused; i++) stepRun(SIM.dt, typeof f === 'function' ? f(i) : f);
      game.render(1 / 60, 1);
      hud.update(game);
      firstRideView.update(game);
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
    startRun,
  };
  hooks.dev = dev;

  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden || dev.paused) dt = 0;
    if (app === 'run' && !game.paused) {
      const scale = game.slomoActive() ? 0.35 : 1;
      acc += dt * scale;
      let steps = 0;
      while (acc >= SIM.dt && steps < SIM.maxCatchUp) {
        stepRun(SIM.dt, input.sample());
        replay.record();
        acc -= SIM.dt;
        steps++;
        if (game.paused) { acc = 0; break; }
      }
      if (steps >= SIM.maxCatchUp) acc = 0;
      controlsHintT += dt;
      if (controlsHintT > 25) hud.root.classList.add('hint-faded');
    } else if ((app === 'title' || app === 'menu') && attract.active) {
      acc += dt;
      let steps = 0;
      while (acc >= SIM.dt && steps < SIM.maxCatchUp) {
        game.step(SIM.dt, attract.frame(frameOf));
        acc -= SIM.dt;
        steps++;
      }
      if (steps >= SIM.maxCatchUp) acc = 0;
      input.sample(); // menus own the real input
      fx.update(dt);
    } else {
      acc = 0;
      if (app !== 'replay') input.sample(); // drain edges while in menus
    }
    if (app === 'replay') replay.update(dt);
    else {
      crowd.update(dt);
      if (app === 'run' && !game.paused) fx.update(dt * (game.slomoActive() ? 0.35 : 1));
      fx.setViewport(stage.renderer.domElement.height, stage.camera.fov);
      game.render(dt, acc / SIM.dt);
      if (cam.mode === 'orbit') cam.update(dt, new THREE.Vector3(-8, 0, 0), game.vehicle.fwd, game.vehicle.vel, { airborne: false, vert: false, wide: 0 });
      else if (attract.active) cam.distance = 8.5;
      else cam.distance = 6.4;
    }
    stage.tick(dt);
    stage.followShadow(cam.mode === 'orbit' ? new THREE.Vector3(-8, 0, 0) : game.vehicle.pos);
    stage.render();
    if (app === 'run' || app === 'paused') {
      hud.update(game);
      firstRideView.update(game);
      sound.update(dt, app === 'run');
      comedy.update();
    } else if (app !== 'replay') sound.update(dt, attract.active);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  ui.innerHTML = `<div class="boot err">${String(e.message ?? e)}</div>`;
});
