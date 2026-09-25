import type { Feature } from './heightfield';

// "MUNICIPAL LIABILITY" — a fictional pink-concrete autumn park, *inspired by* the clip's setting
// (clover bowl, flat bars, upper plaza with pavilion + rusty sculpture, cones, overpass).
// Vehicle scale: the Ryker is 2.35 m long and does 25 m/s, so everything is big.
// Axes: +X east, +Z south, y up. dirDeg: 0 = north (-Z), 90 = east (+X).

export interface BoxDef {
  id: string;
  kind: 'ledge' | 'plaza' | 'stair' | 'planter' | 'pad' | 'bench' | 'wall' | 'table';
  x: number;
  z: number;
  y?: number; // bottom (default 0)
  sx: number; // size along local x
  sz: number;
  h: number;
  yawDeg?: number;
  /** Top edges you can grind (long sides). */
  grind?: 'long' | 'all' | 'none';
  name?: string;
}

export interface RailDef {
  id: string;
  name: string;
  kind: 'rail' | 'ledge' | 'coping' | 'bench' | 'roof' | 'sculpture';
  points: [number, number, number][];
  /** Draw a steel pipe with posts. */
  visual?: boolean;
}

export interface StairDef {
  id: string;
  x: number; // top-step front edge centre
  z: number;
  dirDeg: number; // direction you travel going DOWN
  width: number;
  steps: number;
  rise: number; // total height
  run: number; // total horizontal length
  rail?: boolean;
}

export interface PropDef {
  kind: 'cone' | 'bin' | 'chair' | 'barrier';
  x: number;
  z: number;
  y?: number;
  yawDeg?: number;
}

export interface GapDef {
  id: string;
  name: string;
  points: number;
  /** Takeoff region: circle or box (x,z,hx,hz). */
  from: { x: number; z: number; hx: number; hz: number; minY?: number };
  to: { x: number; z: number; hx: number; hz: number; minY?: number };
  minAir?: number;
}

export interface Spawn {
  id: string;
  name: string;
  x: number;
  z: number;
  yawDeg: number;
}

export const BOUNDS = { minX: -64, minZ: -52, sizeX: 128, sizeZ: 104, cell: 0.25 };

export const FEATURES: Feature[] = [
  // The Commitment Bowl — clover of four lobes; the smooth blend makes hips where they meet.
  {
    type: 'bowl',
    id: 'commitment-bowl',
    trans: 3.4,
    blend: 2.2,
    lobes: [
      { x: -20, z: -6, r: 10, depth: 2.8 },
      { x: -5, z: -10, r: 9, depth: 3.3 },
      { x: -13, z: 8, r: 9, depth: 2.4 },
      { x: 0, z: 4, r: 7.5, depth: 2.0 },
      // Shallow middle where the four lobes meet (otherwise a deck-level island is left inside).
      { x: -8.5, z: -1, r: 5.5, depth: 1.5 },
    ],
  },
  // Confidence Plaza funbox — first pop.
  { type: 'pyramid', id: 'funbox', x: -44, z: -4, yawDeg: 0, hw: 4.5, hd: 5, height: 1.1, angleDeg: 24 },
  // The Overcommit — giant vert wall on the north edge.
  { type: 'qp', id: 'overcommit', x: 30, z: -38, dirDeg: 0, width: 40, height: 4.6, radius: 5.2, deck: 3.5, backDeg: 84, wingDeg: 38 },
  // East wall QP.
  { type: 'qp', id: 'east-wall', x: 57, z: 0, dirDeg: 90, width: 30, height: 2.8, radius: 3.4, deck: 3, backDeg: 84, wingDeg: 35 },
  // South wall QP.
  { type: 'qp', id: 'south-wall', x: -20, z: 42, dirDeg: 180, width: 36, height: 3.0, radius: 3.6, deck: 3, backDeg: 84, wingDeg: 35 },
  // West wall QP (behind spawn, for turning around).
  { type: 'qp', id: 'west-wall', x: -58, z: 14, dirDeg: 270, width: 22, height: 2.4, radius: 3.0, deck: 2.4, backDeg: 84, wingDeg: 35 },
  // Planter gap: kicker → table landing.
  { type: 'bank', id: 'gap-kicker', x: 12, z: 30, dirDeg: 90, width: 7, height: 1.7, angleDeg: 27, deck: 1.0, backDeg: 70 },
  { type: 'bank', id: 'gap-landing', x: 46, z: 30, dirDeg: 270, width: 9, height: 1.7, angleDeg: 17, deck: 3, backDeg: 70 },
  // Bank up to the upper plaza.
  { type: 'bank', id: 'plaza-bank', x: -47, z: -26, dirDeg: 0, width: 14, height: 1.6, angleDeg: 18, deck: 2.2, backDeg: 60 },
  // Roof kicker on the plaza (to reach the pavilion eave).
  { type: 'mound', id: 'hump', x: 38, z: -18, r: 5, height: 0.9 },
];

export const PLAZA = { x0: -62, x1: -34, z0: -50, z1: -32, h: 1.6 };

export const BOXES: BoxDef[] = [
  // Upper plaza slab (vertical retaining walls).
  { id: 'plaza', kind: 'plaza', x: (PLAZA.x0 + PLAZA.x1) / 2, z: (PLAZA.z0 + PLAZA.z1) / 2, sx: PLAZA.x1 - PLAZA.x0, sz: PLAZA.z1 - PLAZA.z0, h: PLAZA.h, grind: 'none' },
  // Roof kicker on the plaza.
  // Flat-bar zone ("the crash site").
  { id: 'long-ledge', kind: 'ledge', x: 34, z: 10, sx: 20, sz: 1.2, h: 0.45, grind: 'long', name: 'LONG LEDGE' },
  { id: 'manual-pad', kind: 'pad', x: 50, z: -4, sx: 3.2, sz: 12, h: 0.3, grind: 'long', name: 'MANUAL PAD' },
  { id: 'pad-west', kind: 'pad', x: -52, z: 18, sx: 12, sz: 2.6, h: 0.3, grind: 'long', name: 'PLAZA PAD' },
  // Planter in the gap.
  { id: 'gap-planter', kind: 'planter', x: 29, z: 30, sx: 7, sz: 4, h: 0.7, grind: 'none' },
  // Benches
  { id: 'bench-1', kind: 'bench', x: 22, z: -14, sx: 4, sz: 0.6, h: 0.48, grind: 'long', name: 'BENCH' },
  { id: 'bench-2', kind: 'bench', x: -44, z: -36, sx: 4, sz: 0.6, h: 0.48, grind: 'long', name: 'BENCH', y: PLAZA.h },
  { id: 'table-1', kind: 'table', x: 14, z: 16, sx: 2.2, sz: 1.6, h: 0.75, grind: 'none' },
];

export const STAIRS: StairDef[] = [
  { id: 'plaza-stairs', x: -34, z: -42, dirDeg: 90, width: 8, steps: 6, rise: PLAZA.h, run: 3.3, rail: true },
];

export const RAILS: RailDef[] = [
  { id: 'flatbar-1', name: 'FLAT BAR', kind: 'rail', points: [[24, 0.5, -8], [44, 0.5, -8]], visual: true },
  { id: 'flatbar-2', name: 'LOW BAR', kind: 'rail', points: [[24, 0.36, 2], [44, 0.36, 2]], visual: true },
  { id: 'kinked', name: 'KINK RAIL', kind: 'rail', points: [[-60, 0.45, -14], [-52, 0.45, -14], [-44, 1.2, -18]], visual: true },
  // Pavilion eave (roof edge) — see scenery for the actual roof.
  { id: 'roof-front', name: 'PAVILION ROOF', kind: 'roof', points: [[-55, 4.9, -37], [-45, 4.9, -37]] },
  { id: 'roof-back', name: 'PAVILION ROOF', kind: 'roof', points: [[-45, 4.9, -47], [-55, 4.9, -47]] },
  // The rusty sculpture's top beam.
  { id: 'sculpture', name: 'PUBLIC ART', kind: 'sculpture', points: [[-40, 2.9, -48.5], [-36.5, 2.9, -44]] },
];

export const PAVILION = { x: -50, z: -42, hw: 5, hd: 5, eave: 3.3, ridge: 4.8, y: PLAZA.h };

export const PROPS: PropDef[] = [
  // Cones on the plaza (the clip's cone)
  { kind: 'cone', x: -40, z: -38, y: PLAZA.h },
  { kind: 'cone', x: -38.5, z: -39.5, y: PLAZA.h },
  { kind: 'cone', x: -42, z: -45, y: PLAZA.h },
  { kind: 'cone', x: -57, z: -34.5, y: PLAZA.h },
  { kind: 'cone', x: -59, z: -48, y: PLAZA.h },
  // Cones around the flat bars
  { kind: 'cone', x: 46.5, z: -10.5 },
  { kind: 'cone', x: 46.5, z: 4.5 },
  { kind: 'cone', x: 21, z: -11.5 },
  { kind: 'cone', x: 34, z: -2.6 },
  { kind: 'cone', x: -30, z: 24 },
  { kind: 'cone', x: -52, z: 6 },
  { kind: 'cone', x: -48, z: 8 },
  { kind: 'bin', x: 20, z: -16 },
  { kind: 'bin', x: -36.5, z: -34, y: PLAZA.h },
  { kind: 'bin', x: 52, z: 22 },
  { kind: 'chair', x: 16.5, z: 17.2, yawDeg: 200 },
  { kind: 'chair', x: 12, z: 15, yawDeg: 20 },
  { kind: 'barrier', x: 56, z: 36, yawDeg: 90 },
];

export const LETTERS: { letter: string; x: number; y: number; z: number }[] = [
  { letter: 'R', x: -44, y: 3.4, z: -4 },
  { letter: 'Y', x: -12.5, y: 1.2, z: 0 },
  { letter: 'K', x: 30, y: 10.5, z: -43 },
  { letter: 'E', x: 29, y: 4.2, z: 30 },
  { letter: 'R', x: -50, y: 6.6, z: -42 },
];

export const GAPS: GapDef[] = [
  { id: 'planter', name: 'PLANTER GAP', points: 500, from: { x: 16, z: 30, hx: 3.5, hz: 4 }, to: { x: 40, z: 30, hx: 5, hz: 5 } },
  { id: 'stairs', name: 'MUNICIPAL STAIR SET', points: 250, from: { x: -36, z: -42, hx: 2.5, hz: 4.5, minY: 1.2 }, to: { x: -24, z: -42, hx: 8, hz: 8 } },
  { id: 'roof', name: 'ROOF ACCESS', points: 1000, from: { x: -50, z: -42, hx: 20, hz: 20 }, to: { x: -50, z: -42, hx: 5.2, hz: 5.2, minY: 4 } },
  { id: 'hip', name: 'HIP TRANSFER', points: 300, from: { x: -20, z: -8, hx: 7, hz: 7 }, to: { x: -14, z: 10, hx: 7, hz: 7 } },
  { id: 'hip2', name: 'DEEP END TRANSFER', points: 400, from: { x: -14, z: 10, hx: 7, hz: 7 }, to: { x: -3, z: -12, hx: 6, hz: 6 } },
  { id: 'funbox', name: 'OVER THE FUNBOX', points: 150, from: { x: -52, z: -4, hx: 3, hz: 5 }, to: { x: -36, z: -4, hx: 3.5, hz: 6 } },
  { id: 'pad', name: 'PAD HOP', points: 100, from: { x: 44, z: -4, hx: 3, hz: 8 }, to: { x: 56, z: -4, hx: 3, hz: 8 } },
];

export const SPAWNS: Spawn[] = [
  { id: 'start', name: 'Confidence Plaza', x: -58, z: -4, yawDeg: 90 },
  { id: 'bowl', name: 'The Commitment Bowl', x: -30, z: 22, yawDeg: 45 },
  { id: 'plaza', name: 'Upper Plaza', x: -58, z: -40, yawDeg: 90 },
  { id: 'bars', name: 'The Crash Site', x: 18, z: -2, yawDeg: 90 },
  { id: 'overcommit', name: 'The Overcommit', x: 30, z: -14, yawDeg: 0 },
];

/** Service bays for the VALET PARKING incident. */
export const PARKING_BAYS = [
  { x: 60, z: 46, hx: 1.6, hz: 3 },
  { x: 55.5, z: 46, hx: 1.6, hz: 3 },
];
