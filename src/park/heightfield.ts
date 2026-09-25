// The flowing concrete (bowls, quarterpipes, banks, hips, funboxes) is one height function
// composed from simple shape formulas, then sampled onto a grid that is both the render mesh
// and a Rapier heightfield collider. Vertical-faced things (ledges, stairs, plazas) are boxes.

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export type Feature =
  | { type: 'bowl'; id: string; lobes: (Circle & { depth: number })[]; trans: number; blend: number }
  | {
      type: 'qp';
      id: string;
      x: number; // foot centre
      z: number;
      dirDeg: number; // direction you travel going UP the ramp (0 = -Z/north, 90 = +X/east)
      width: number;
      height: number;
      radius: number;
      deck: number;
      backDeg: number; // back slope angle; 90 = drop (clamped steep)
      wingDeg: number;
    }
  | {
      type: 'bank';
      id: string;
      x: number;
      z: number;
      dirDeg: number;
      width: number;
      height: number;
      angleDeg: number;
      deck: number;
      backDeg: number;
      wingDeg?: number;
    }
  | { type: 'pyramid'; id: string; x: number; z: number; yawDeg: number; hw: number; hd: number; height: number; angleDeg: number }
  | { type: 'mound'; id: string; x: number; z: number; r: number; height: number };

export const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Round the crease where a straight ramp meets the ground (real ramps have a curved toe).
 * `h` is the un-clamped linear height; k is the half-width of the fillet in metres of height.
 */
function toe(h: number, k: number) {
  if (h <= -k) return 0;
  if (h >= k) return h;
  return ((h + k) * (h + k)) / (4 * k);
}

/** Direction vector for a compass-ish angle: 0 = -Z (north), 90 = +X (east). */
export function dirVec(deg: number): [number, number] {
  const a = rad(deg);
  return [Math.sin(a), -Math.cos(a)];
}

/**
 * Smooth min for *sunken* heights: only blends where both inputs are below deck level,
 * so flat deck (0 vs 0) is never pulled down. Blending overlapping lobes rounds the ridge
 * between them into a rideable hip.
 */
function sminSunken(a: number, b: number, k: number) {
  const m = Math.min(a, b);
  if (k <= 0) return m;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  const both = -Math.max(a, b); // depth of the shallower one
  const s = both <= 0 ? 0 : both >= 0.6 ? 1 : (both / 0.6) * (both / 0.6) * (3 - 2 * (both / 0.6));
  return m - h * h * k * 0.25 * s;
}

/** Bowl wall profile: d = distance inside the lip (>=0). Circle-arc transition into a flat floor. */
export function bowlProfile(d: number, depth: number, R: number) {
  const Rr = Math.max(R, depth + 0.05);
  const c = Rr - depth; // arc centre height above the floor... measured from lip level
  const d0 = Rr - Math.sqrt(Rr * Rr - c * c);
  const s = d + d0;
  if (s >= Rr) return -depth;
  const q = Rr - s;
  return -depth + Rr - Math.sqrt(Math.max(0, Rr * Rr - q * q));
}

/** Width of the transition (lip to floor) for a given depth/radius. */
export function bowlTransWidth(depth: number, R: number) {
  const Rr = Math.max(R, depth + 0.05);
  const c = Rr - depth;
  return Rr - (Rr - Math.sqrt(Rr * Rr - c * c));
}

function qpProfile(u: number, H: number, R: number, deck: number, backDeg: number) {
  if (u <= 0) return 0;
  const Rr = Math.max(R, H + 0.02);
  const uTop = Math.sqrt(Rr * Rr - (Rr - H) * (Rr - H));
  if (u <= uTop) return Rr - Math.sqrt(Math.max(0, Rr * Rr - u * u));
  if (u <= uTop + deck) return H;
  const back = Math.tan(rad(Math.min(backDeg, 84)));
  return Math.max(0, H - (u - uTop - deck) * back);
}

export function qpTopDistance(H: number, R: number) {
  const Rr = Math.max(R, H + 0.02);
  return Math.sqrt(Rr * Rr - (Rr - H) * (Rr - H));
}

function bankProfile(u: number, H: number, angleDeg: number, deck: number, backDeg: number) {
  const t = Math.tan(rad(angleDeg));
  const run = H / t;
  if (u <= run) return toe(u * t, 0.12);
  if (u <= run + deck) return H;
  const back = Math.tan(rad(Math.min(backDeg, 84)));
  return Math.max(0, H - (u - run - deck) * back);
}

function withWings(h: number, v: number, hw: number, wingDeg: number) {
  const av = Math.abs(v);
  if (av <= hw) return h;
  const s = Math.tan(rad(Math.min(wingDeg, 84)));
  return Math.min(h, Math.max(0, h - (av - hw) * s));
}

export function featureHeight(f: Feature, x: number, z: number): number {
  switch (f.type) {
    case 'bowl': {
      let h = Infinity;
      for (const l of f.lobes) {
        const sd = Math.hypot(x - l.x, z - l.z) - l.r; // <0 inside
        const hi = sd >= 0 ? 0 : bowlProfile(-sd, l.depth, f.trans);
        h = h === Infinity ? hi : sminSunken(h, hi, f.blend);
      }
      return Math.min(0, h);
    }
    case 'qp': {
      const [dx, dz] = dirVec(f.dirDeg);
      const px = x - f.x;
      const pz = z - f.z;
      const u = px * dx + pz * dz;
      const v = px * -dz + pz * dx;
      if (u < -0.01) return 0;
      return withWings(qpProfile(u, f.height, f.radius, f.deck, f.backDeg), v, f.width / 2, f.wingDeg);
    }
    case 'bank': {
      const [dx, dz] = dirVec(f.dirDeg);
      const px = x - f.x;
      const pz = z - f.z;
      const u = px * dx + pz * dz;
      const v = px * -dz + pz * dx;
      if (u < -0.01) return 0;
      return withWings(bankProfile(u, f.height, f.angleDeg, f.deck, f.backDeg), v, f.width / 2, f.angleDeg);
    }
    case 'pyramid': {
      const c = Math.cos(rad(f.yawDeg));
      const s = Math.sin(rad(f.yawDeg));
      const px = x - f.x;
      const pz = z - f.z;
      const lx = px * c - pz * s;
      const lz = px * s + pz * c;
      const t = Math.tan(rad(f.angleDeg));
      const h = Math.min(f.height, (f.hw - Math.abs(lx)) * t + f.height, (f.hd - Math.abs(lz)) * t + f.height);
      return toe(h, 0.12);
    }
    case 'mound': {
      const d = Math.hypot(x - f.x, z - f.z) / f.r;
      if (d >= 1) return 0;
      const k = Math.cos(d * Math.PI) * 0.5 + 0.5;
      return f.height * k;
    }
  }
}

export interface HeightGrid {
  minX: number;
  minZ: number;
  cell: number;
  nx: number; // samples along x
  nz: number; // samples along z
  h: Float32Array; // row-major [iz * nx + ix]
}

export function sampleHeights(features: Feature[], minX: number, minZ: number, sizeX: number, sizeZ: number, cell: number): HeightGrid {
  const nx = Math.round(sizeX / cell) + 1;
  const nz = Math.round(sizeZ / cell) + 1;
  const h = new Float32Array(nx * nz);
  const raised = features.filter((f) => f.type !== 'bowl');
  const bowls = features.filter((f) => f.type === 'bowl');
  for (let iz = 0; iz < nz; iz++) {
    const z = minZ + iz * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ix * cell;
      let v = 0;
      for (const f of raised) {
        const fh = featureHeight(f, x, z);
        if (fh > v) v = fh;
      }
      for (const f of bowls) {
        const fh = featureHeight(f, x, z);
        if (fh < 0) v = Math.min(v, fh);
      }
      h[iz * nx + ix] = v;
    }
  }
  return { minX, minZ, cell, nx, nz, h };
}

/** Bilinear height lookup on the grid (for spawning and props). */
export function gridHeight(g: HeightGrid, x: number, z: number) {
  const fx = (x - g.minX) / g.cell;
  const fz = (z - g.minZ) / g.cell;
  const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const iz = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const a = g.h[iz * g.nx + ix];
  const b = g.h[iz * g.nx + ix + 1];
  const c = g.h[(iz + 1) * g.nx + ix];
  const d = g.h[(iz + 1) * g.nx + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/**
 * Marching squares: polylines where the grid crosses `iso`, restricted to cells where `mask` passes.
 * Used to find bowl lips (for coping pipes and grindable edges).
 */
export function contours(g: HeightGrid, iso: number): [number, number][][] {
  const segs: [number, number, number, number][] = [];
  const { nx, nz, h, cell, minX, minZ } = g;
  const lerp = (a: number, b: number) => (iso - a) / (b - a);
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = h[iz * nx + ix]; // (0,0)
      const b = h[iz * nx + ix + 1]; // (1,0)
      const c = h[(iz + 1) * nx + ix + 1]; // (1,1)
      const d = h[(iz + 1) * nx + ix]; // (0,1)
      let code = 0;
      if (a < iso) code |= 1;
      if (b < iso) code |= 2;
      if (c < iso) code |= 4;
      if (d < iso) code |= 8;
      if (code === 0 || code === 15) continue;
      const x0 = minX + ix * cell;
      const z0 = minZ + iz * cell;
      const e = [
        [x0 + lerp(a, b) * cell, z0], // bottom (a-b)
        [x0 + cell, z0 + lerp(b, c) * cell], // right (b-c)
        [x0 + lerp(d, c) * cell, z0 + cell], // top (d-c)
        [x0, z0 + lerp(a, d) * cell], // left (a-d)
      ];
      const add = (i: number, j: number) => segs.push([e[i][0], e[i][1], e[j][0], e[j][1]]);
      switch (code) {
        case 1: case 14: add(3, 0); break;
        case 2: case 13: add(0, 1); break;
        case 3: case 12: add(3, 1); break;
        case 4: case 11: add(1, 2); break;
        case 6: case 9: add(0, 2); break;
        case 7: case 8: add(3, 2); break;
        case 5: add(3, 0); add(1, 2); break;
        case 10: add(0, 1); add(2, 3); break;
      }
    }
  }
  // Chain segments into polylines.
  const key = (x: number, z: number) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
  const byStart = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      let arr = byStart.get(k);
      if (!arr) byStart.set(k, (arr = []));
      arr.push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const lines: [number, number][][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: [number, number][] = [
      [segs[i][0], segs[i][1]],
      [segs[i][2], segs[i][3]],
    ];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? line[line.length - 1] : line[0];
        const cand = byStart.get(key(end[0], end[1])) ?? [];
        const j = cand.find((c) => !used[c]);
        if (j === undefined) break;
        used[j] = 1;
        const s = segs[j];
        const sameStart = key(s[0], s[1]) === key(end[0], end[1]);
        const next: [number, number] = sameStart ? [s[2], s[3]] : [s[0], s[1]];
        if (forward) line.push(next);
        else line.unshift(next);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Douglas–Peucker-ish resample: keep points at least `step` apart. */
export function resample(line: [number, number][], step: number): [number, number][] {
  if (line.length < 2) return line;
  const out: [number, number][] = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const [px, pz] = line[i - 1];
    const [x, z] = line[i];
    acc += Math.hypot(x - px, z - pz);
    if (acc >= step) {
      out.push(line[i]);
      acc = 0;
    }
  }
  const last = line[line.length - 1];
  const o = out[out.length - 1];
  if (o[0] !== last[0] || o[1] !== last[1]) out.push(last);
  return out;
}
