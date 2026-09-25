import { describe, it, expect, beforeAll } from 'vitest';
import { initRapier, PhysicsWorld } from '../src/physics/world';
import { Vehicle, type LandingEvent } from '../src/physics/vehicle';
import { sampleHeights } from '../src/park/heightfield';
import { BOUNDS, FEATURES } from '../src/park/layout';
import { addParkColliders } from '../src/park/build';
import { SIM } from '../src/config/tuning';

// Headless regression cases from the design kit's matrix, on the real park colliders.

let grid: ReturnType<typeof sampleHeights>;
beforeAll(async () => {
  await initRapier();
  grid = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, BOUNDS.cell);
});

function world() {
  const phys = new PhysicsWorld();
  addParkColliders(phys, grid);
  const v = new Vehicle(phys);
  const landings: LandingEvent[] = [];
  v.onLanding = (e) => landings.push(e);
  const step = (n: number, ctl: Partial<Vehicle['ctl']> = {}) => {
    for (let i = 0; i < n; i++) {
      Object.assign(v.ctl, { throttle: 0, brake: 0, steer: 0, pitch: 0, ollieHeld: false, ollieRelease: false }, ctl);
      v.preStep(SIM.dt);
      phys.step();
      v.postStep();
    }
  };
  return { phys, v, step, landings };
}

const sec = (s: number) => Math.round(s / SIM.dt);

describe('vehicle regression matrix', () => {
  it('full throttle on a clean straight: upright, grounded, fast', () => {
    const { v, step } = world();
    v.spawn(-300, 0, 0, 90);
    step(sec(0.5));
    let minUp = 1;
    let airSteps = 0;
    for (let i = 0; i < sec(8); i++) {
      step(1, { throttle: 1 });
      minUp = Math.min(minUp, v.up.y);
      if (!v.grounded) airSteps++;
    }
    expect(minUp).toBeGreaterThan(0.95);
    expect(airSteps).toBe(0);
    expect(v.speed).toBeGreaterThan(20);
  });

  it('brake to a stop, then reverse', () => {
    const { v, step } = world();
    v.spawn(-300, 0, 0, 90);
    step(sec(3), { throttle: 1 });
    step(sec(3), { brake: 1 });
    expect(v.forwardSpeed).toBeLessThan(-2); // held brake after stopping = reverse
    expect(v.up.y).toBeGreaterThan(0.95);
  });

  it('is deterministic for identical inputs', () => {
    const run = () => {
      const { v, step } = world();
      v.spawn(-58, 0, -4, 90);
      step(sec(0.5));
      step(sec(3), { throttle: 1, steer: 0.3 });
      step(sec(2));
      return v.pos.toArray();
    };
    const a = run();
    const b = run();
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));
  });

  it('funbox launch → air → clean landing', () => {
    const { v, step, landings } = world();
    v.spawn(-58, 0, -4, 90);
    step(sec(0.5));
    step(sec(0.7), { throttle: 1 });
    for (let i = 0; i < sec(2) && v.pos.x < -47.6; i++) step(1, { throttle: 1, ollieHeld: true });
    step(1, { throttle: 1, ollieRelease: true });
    step(sec(2.5));
    const big = landings.find((l) => l.airTime > 0.5);
    expect(big).toBeTruthy();
    expect(big!.quality).toBe('clean');
  });

  it('bowl: in, up the far wall, back down — no tumble', () => {
    const { v, step } = world();
    v.spawn(-58, 0, -4, 90);
    step(sec(0.5));
    step(sec(3), { throttle: 1 });
    let minUp = 1;
    for (let i = 0; i < sec(6); i++) {
      step(1);
      if (v.contacts >= 2) minUp = Math.min(minUp, v.up.dot(v.groundNormal)); // single-wheel clips mid-landing are fine
    }
    expect(v.tumbling).toBe(false);
    expect(minUp).toBeGreaterThan(0.75); // wheels stayed roughly square to the surface (diagonal wall climbs lean ~37°)
  });

  it('low-speed bump is not a launch', () => {
    const { v, step, landings } = world();
    v.spawn(-58, 0, -4, 90);
    step(sec(0.5));
    step(sec(0.4), { throttle: 0.4 });
    step(sec(2));
    expect(landings.every((l) => l.airTime < 0.3)).toBe(true);
  });

  // Playtest (Dan): "going off a ramp can instantly send you into the hang". Steering held onto the lip
  // used to become a 540°/s spin → sideways landing. Held A/D is latched at takeoff now.
  it('steering onto the funbox lip and holding it does not spin you sideways', () => {
    const { v, step, landings } = world();
    v.spawn(-60, 0, -4, 90);
    step(sec(0.5));
    let air = -1;
    for (let i = 0; i < sec(6) && air < 0; i++) {
      step(1, { throttle: 1, steer: v.pos.x > -50 ? 1 : 0 });
      if (!v.grounded && v.speed > 4) air = i;
    }
    step(sec(0.3), { throttle: 1, steer: 1 });
    step(sec(2.5));
    const big = landings.find((l) => l.airTime > 0.5);
    expect(big?.quality).toBe('clean');
  });

  it('planter gap: full throttle clears the planter and lands on the table', () => {
    const { v, step, landings } = world();
    v.spawn(-6, 0, 30, 90);
    step(sec(0.5));
    step(sec(5), { throttle: 1 });
    const big = landings.find((l) => l.airTime > 0.8);
    expect(big?.quality).toBe('clean'); // it used to fly into the landing table's back wall (slam)
    expect(big!.normal.y).toBeGreaterThan(0.9);
  });

  it('a spin let go of early finishes itself to a straight or fakie landing', () => {
    const { v, step, landings } = world();
    v.spawn(-6, 0, 30, 90);
    step(sec(0.5));
    let air = false;
    for (let i = 0; i < sec(6) && !air; i++) {
      step(1, { throttle: 1 });
      air = !v.grounded && v.speed > 4 && v.pos.x > 10;
    }
    let yaw = 0;
    const log = v.onLanding!;
    v.onLanding = (e) => {
      if (e.airTime > 0.8) yaw = v.airYaw;
      log(e);
    };
    step(sec(0.3), { steer: -1 }); // ~180° worth, released well before landing
    step(sec(2));
    const big = landings.find((l) => l.airTime > 0.8);
    expect(big?.quality).toBe('clean');
    expect(big!.fakie).toBe(true);
    expect(Math.abs(Math.abs(yaw) - Math.PI)).toBeLessThan(0.5); // scored as a 180
  });

  it('vert on a tight 3 m perimeter quarterpipe too (not a launch out of the park)', () => {
    const { v, step, landings } = world();
    v.spawn(28, 0, -8, 90); // east wall, full speed
    step(sec(0.5));
    let vert = false;
    v.onAirborne = (isVert) => (vert = vert || isVert);
    for (let i = 0; i < sec(5) && !vert; i++) step(1, { throttle: 1 });
    expect(vert).toBe(true);
    step(sec(3.5));
    const back = landings.find((l) => l.airTime > 1);
    expect(back?.quality).toBe('clean');
    expect(back!.fakie).toBe(true);
    expect(v.pos.x).toBeLessThan(62); // came back into the park, not over the deck
  });

  it('vert: launch off the Overcommit lip, come straight back into the ramp', () => {
    const { v, step, landings } = world();
    v.spawn(30, 0, -14, 0); // facing north, straight at the big quarterpipe
    step(sec(0.5));
    let vert = false;
    v.onAirborne = (isVert) => (vert = vert || isVert);
    for (let i = 0; i < sec(6) && !vert; i++) step(1, { throttle: 1 });
    expect(vert).toBe(true);
    const maxY = { y: 0 };
    for (let i = 0; i < sec(4); i++) {
      step(1);
      maxY.y = Math.max(maxY.y, v.pos.y);
    }
    const back = landings.find((l) => l.airTime > 0.6);
    expect(back).toBeTruthy();
    expect(back!.quality).toBe('clean'); // straight up and down = a legit fakie landing
    expect(back!.fakie).toBe(true);
    expect(back!.normal.y).toBeLessThan(0.97); // landed back on the transition, not the flat deck
    expect(maxY.y).toBeGreaterThan(5); // real air above a 4.6 m wall
  });
});
