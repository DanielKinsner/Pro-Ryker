import RAPIER from '@dimforge/rapier3d-compat';
import { SIM } from '../config/tuning';

export { RAPIER };
export type R = typeof RAPIER;

// Collision membership bits.
export const G = {
  STATIC: 0x0001,
  VEHICLE: 0x0002,
  RIDER: 0x0004,
  PROP: 0x0008,
  HELMET: 0x0010,
  SENSOR: 0x0020,
};
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const COL = {
  static: groups(G.STATIC, 0xffff),
  vehicle: groups(G.VEHICLE, G.STATIC | G.PROP | G.HELMET),
  vehicleEmpty: groups(G.VEHICLE, G.STATIC | G.PROP | G.HELMET | G.RIDER),
  rider: groups(G.RIDER, G.STATIC | G.PROP | G.HELMET),
  riderFree: groups(G.RIDER, G.STATIC | G.PROP | G.HELMET | G.VEHICLE),
  prop: groups(G.PROP, 0xffff),
  helmet: groups(G.HELMET, 0xffff),
  /** Ray filter: things wheels can stand on. */
  ground: groups(0xffff, G.STATIC),
};

let ready: Promise<void> | null = null;
export function initRapier() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export class PhysicsWorld {
  world: RAPIER.World;
  /** Collider handle → gameplay tag (surface kind, rail id, prop id...). */
  tags = new Map<number, { kind: string; id?: string | number }>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: SIM.gravity, z: 0 });
    this.world.timestep = SIM.dt;
    this.world.numSolverIterations = SIM.solverIterations;
  }

  step() {
    this.world.step();
  }

  addStatic(desc: RAPIER.ColliderDesc, tag = 'concrete') {
    desc.setCollisionGroups(COL.static).setFriction(0.8).setRestitution(0.05);
    const c = this.world.createCollider(desc);
    this.tags.set(c.handle, { kind: tag });
    return c;
  }

  /** Ray against static ground only. Returns distance, point and normal. */
  rayGround(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number) {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, COL.ground);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      dist: t,
      px: ox + dx * t,
      py: oy + dy * t,
      pz: oz + dz * t,
      nx: hit.normal.x,
      ny: hit.normal.y,
      nz: hit.normal.z,
      collider: hit.collider,
    };
  }

  /** Height of the ground straight below (or null). */
  groundHeight(x: number, z: number, fromY = 60) {
    const h = this.rayGround(x, fromY, z, 0, -1, 0, 200);
    return h ? h.py : null;
  }
}
