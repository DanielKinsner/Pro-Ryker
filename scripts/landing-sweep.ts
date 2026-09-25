// Tuning tool: fly the real Ryker physics off the park's ramps with player-like habits (steering on the
// lip, tapping W/S or A/D mid-air) and count how often each habit ends in a bad landing (= thrown into
// the hang) or a slam. Run: npx vite-node scripts/landing-sweep.ts
import { initRapier, PhysicsWorld } from '../src/physics/world';
import { Vehicle, type LandingEvent } from '../src/physics/vehicle';
import { sampleHeights } from '../src/park/heightfield';
import { BOUNDS, FEATURES } from '../src/park/layout';
import { addParkColliders } from '../src/park/build';
import { SIM } from '../src/config/tuning';

type Ctl = Partial<Vehicle['ctl']>;
interface Ramp {
  name: string;
  x: number;
  z: number;
  yaw: number;
  throttle: number;
}
const RAMPS: Ramp[] = [
  { name: 'funbox', x: -60, z: -4, yaw: 90, throttle: 1 },
  { name: 'funbox 70%', x: -60, z: -4, yaw: 90, throttle: 0.7 },
  { name: 'funbox angled', x: -58, z: -12, yaw: 65, throttle: 1 },
  { name: 'gap kicker', x: -6, z: 30, yaw: 90, throttle: 1 },
  { name: 'hump', x: 20, z: -18, yaw: 90, throttle: 1 },
  { name: 'east QP angled', x: 32, z: 8, yaw: 110, throttle: 1 },
  { name: 'pad → east QP', x: 28, z: 0, yaw: 90, throttle: 1 },
  { name: 'hump → east QP', x: 28, z: -15, yaw: 90, throttle: 1 },
  { name: 'hump → QP wing', x: 28, z: -18, yaw: 90, throttle: 1 },
];

/** A player habit: what they press relative to the takeoff moment (t in seconds, t=0 at takeoff). */
interface Habit {
  name: string;
  ctl: (t: number, base: Ctl) => Ctl;
}
const HABITS: Habit[] = [
  { name: 'hands off in the air', ctl: (t, b) => (t < 0 ? b : {}) },
  { name: 'hold W the whole way', ctl: (_t, b) => b },
  { name: 'let go of W, re-press W mid-air', ctl: (t, b) => (t < 0 ? b : t > 0.25 ? { ...b } : {}) },
  { name: 'tap S mid-air', ctl: (t, b) => (t < 0 ? b : t > 0.2 && t < 0.45 ? { brake: 1, pitch: -1 } : {}) },
  { name: 'steering (50%) as you leave the lip', ctl: (t, b) => (t < -0.1 ? b : t < 0.15 ? { ...b, steer: 0.5 } : {}) },
  { name: 'steering (full) as you leave the lip', ctl: (t, b) => (t < -0.1 ? b : t < 0.15 ? { ...b, steer: 1 } : {}) },
  { name: 'hold steer 0.3 s into the air', ctl: (t, b) => (t < -0.1 ? b : t < 0.3 ? { ...b, steer: 1 } : {}) },
  { name: 'quick A/D tap mid-air (0.12 s)', ctl: (t, b) => (t < 0 ? b : t > 0.2 && t < 0.32 ? { steer: -1 } : {}) },
  { name: 'spin on purpose: hold A 0.3 s', ctl: (t, b) => (t < 0 ? b : t > 0.05 && t < 0.35 ? { steer: -1 } : {}) },
  { name: 'spin on purpose: hold D 0.55 s', ctl: (t, b) => (t < 0 ? b : t > 0.05 && t < 0.6 ? { steer: 1 } : {}) },
];

await initRapier();
const grid = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, BOUNDS.cell);
const sec = (s: number) => Math.round(s / SIM.dt);

function run(ramp: Ramp, habit: Habit | null, takeoffStep: number) {
  const phys = new PhysicsWorld();
  addParkColliders(phys, grid);
  const v = new Vehicle(phys);
  const landings: LandingEvent[] = [];
  let firstAir = -1;
  let yaw = 0; // spin at the first landing
  let i = 0;
  v.onLanding = (e) => {
    if (!landings.length) yaw = v.airYaw;
    landings.push(e);
  };
  v.onAirborne = () => {
    if (firstAir < 0 && i > sec(0.6) && v.speed > 4) firstAir = i; // not the drop at spawn
  };
  v.spawn(ramp.x, 0, ramp.z, ramp.yaw);
  const base: Ctl = { throttle: ramp.throttle };
  for (; i < sec(0.5); i++) step(v, phys, {});
  for (let k = 0; k < sec(7); k++, i++) {
    const t = (i - takeoffStep) * SIM.dt;
    const c = habit ? habit.ctl(t, base) : base;
    step(v, phys, c);
    if (landings.some((l) => l.airTime > 0.3) && t > 1.5) break;
  }
  return { landings, firstAir, pos: v.pos.clone(), yaw };
}

function step(v: Vehicle, phys: PhysicsWorld, ctl: Ctl) {
  Object.assign(v.ctl, { throttle: 0, brake: 0, steer: 0, pitch: 0, ollieHeld: false, ollieRelease: false }, ctl);
  // W is throttle *and* the air lean, S is brake and lean back (as the real input does).
  if (ctl.throttle && ctl.pitch === undefined) v.ctl.pitch = ctl.throttle > 0.5 ? 1 : 0;
  v.preStep(SIM.dt);
  phys.step();
  v.postStep();
}

const tally = new Map<string, { clean: number; sketchy: number; bad: number; slam: number; n: number }>();
const rows: string[] = [];
for (const ramp of RAMPS) {
  // Find the takeoff moment for this ramp with plain throttle (the sim is deterministic).
  const probe = run(ramp, null, 1e9);
  const big = probe.landings.find((l) => l.airTime > 0.3);
  if (probe.firstAir < 0 || !big) {
    rows.push(`${ramp.name.padEnd(16)} — no real air (${probe.landings.map((l) => l.airTime.toFixed(2)).join(',')})`);
    continue;
  }
  const out: string[] = [];
  for (const h of HABITS) {
    const r = run(ramp, h, probe.firstAir);
    const worst = r.landings.filter((l) => l.airTime > 0.12).reduce<LandingEvent | null>((w, l) => (!w || rank(l) > rank(w) ? l : w), null);
    const q = worst?.quality ?? 'none';
    const t = tally.get(h.name) ?? { clean: 0, sketchy: 0, bad: 0, slam: 0, n: 0 };
    if (q !== 'none') t[q]++;
    t.n++;
    tally.set(h.name, t);
    const big = r.landings.find((l) => l.airTime > 0.3);
    const spun = h.name.startsWith('spin') && big ? `/${Math.round(Math.abs(r.yaw) * 57.3)}°` : '';
    out.push(`${{ clean: 'C', sketchy: 's', bad: 'BAD', slam: 'SLAM', none: '-' }[q]}${spun}${worst && q !== 'clean' ? `(${worst.reason})` : ''}`);
  }
  rows.push(`${ramp.name.padEnd(16)} air ${big.airTime.toFixed(2)}s  ${out.join(' ')}`);
}
function rank(l: LandingEvent) {
  return { clean: 0, sketchy: 1, bad: 2, slam: 3 }[l.quality];
}
console.log(rows.join('\n'));
console.log('\nHabit                                    clean sketchy bad slam  (bad+slam = thrown off)');
for (const [name, t] of tally) console.log(`${name.padEnd(40)} ${String(t.clean).padStart(5)} ${String(t.sketchy).padStart(7)} ${String(t.bad).padStart(3)} ${String(t.slam).padStart(4)}`);
