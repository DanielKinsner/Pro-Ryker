import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, type PhysicsWorld } from '../physics/world';
import { asphaltTexture, concreteTexture, grassTexture } from '../render/textures';

// The world beyond the skate area, after the clip: an ordinary sunny autumn afternoon.
// Sidewalk ring → lawns full of red maples → two streets with parked cars → an elevated highway
// to the south, mid-rise apartment blocks all round and a hazy downtown skyline to the north.
// All static: geometry is merged per material or instanced (~27 meshes, ~160k triangles), textures
// are painted on canvases, and only things you can actually hit from the park get colliders.
// Axes: +X east, +Z south, y up. The park is x∈[-64,64], z∈[-52,52]; nothing here goes inside it.

const PARK = { x0: -64, x1: 64, z0: -52, z1: 52 };
const RING = 5; // concrete sidewalk band hugging the park
const GROUND_R = 1100; // grass disc radius (inside the camera's far plane; fog is total well before)
const RUN = 1000; // streets and the highway run out into the fog
const CURB = 0.1; // street sidewalks sit a kerb above the asphalt (visual only)
const EW = { z0: 64, z1: 76 }; // south street asphalt: parking lane + 2 lanes + parking lane
const NS = { x0: 76, x1: 88 }; // east street asphalt
const HWY = { z: 95, half: 7, top: 9 };
const NEAR = 15; // within this of the park: casts shadows and gets colliders

type Rand = () => number;
type Tint = THREE.ColorRepresentation | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.ColorRepresentation);
type Inst = { m: THREE.Matrix4; c: THREE.Color };
type Ctx = CanvasRenderingContext2D;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
const UP = V(0, 1, 0);
const ONE = V(1, 1, 1);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const range = (r: Rand, a: number, b: number) => a + (b - a) * r();
const pick = <T>(r: Rand, a: T[]) => a[Math.floor(r() * a.length)];

function rng(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from (x,z) to the park rectangle (0 inside). */
function parkDist(x: number, z: number) {
  const dx = Math.max(PARK.x0 - x, 0, x - PARK.x1);
  const dz = Math.max(PARK.z0 - z, 0, z - PARK.z1);
  return Math.hypot(dx, dz);
}

/** Matrix for something standing at (x,y,z), turned `yaw` radians about +Y (local +X → world (cos, 0, -sin)). */
function place(x: number, y: number, z: number, yaw = 0, s: THREE.Vector3 = ONE) {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), s);
}

/**
 * Collects many small geometries (already transformed + vertex-coloured) into one mesh.
 * uvTile > 0 replaces UVs with a world-space box projection (tile size in metres), so
 * concrete/asphalt/grass line up across pieces without any per-piece UV work.
 */
class Batch {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private uvTile = 0) {}

  add(src: THREE.BufferGeometry, m: THREE.Matrix4 | null, tint: Tint = '#ffffff') {
    const g = src.index ? src.toNonIndexed() : src.clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.clearGroups();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const fn = typeof tint === 'function' ? tint : null;
    const fixed = fn ? null : new THREE.Color(tint as THREE.ColorRepresentation);
    const p = V();
    const q = V();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (fn) {
        p.fromBufferAttribute(pos, i);
        q.fromBufferAttribute(nrm, i);
        c.set(fn(p, q));
      } else c.copy(fixed!);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.uvTile > 0 || !g.getAttribute('uv')) {
      const uv = new Float32Array(n * 2);
      const t = this.uvTile || 1;
      const a = V();
      const b = V();
      const e = V();
      for (let i = 0; i + 2 < n; i += 3) {
        // Project by the face normal so a whole triangle uses one plane (no smeared seams).
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1).sub(a);
        e.fromBufferAttribute(pos, i + 2).sub(a);
        b.cross(e);
        const ax = Math.abs(b.x);
        const ay = Math.abs(b.y);
        const az = Math.abs(b.z);
        for (let j = i; j < i + 3; j++) {
          p.fromBufferAttribute(pos, j);
          if (ay >= ax && ay >= az) uv.set([p.x / t, p.z / t], j * 2);
          else if (ax >= az) uv.set([p.z / t, p.y / t], j * 2);
          else uv.set([p.x / t, p.y / t], j * 2);
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    this.parts.push(g);
  }

  mesh(mat: THREE.Material, name: string, cast = false, receive = true) {
    const geo = (this.parts.length ? mergeGeometries(this.parts, false) : null) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    return m;
  }
}

// ---------- Geometry helpers

/** Flat horizontal rectangle, normal up. */
function rect(x0: number, x1: number, z0: number, z1: number, y = 0) {
  return new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** Axis-aligned box from min/max corners. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Box of size (sx,sy,sz) centred at (x,y,z). */
function cube(sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
}

/** Tapered open cylinder from a to b (branches, poles). */
function limb(b: Batch, a: THREE.Vector3, c: THREE.Vector3, ra: number, rc: number, segs: number, tint: Tint) {
  const d = V().subVectors(c, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(rc, ra, len, segs, 1, true).translate(0, len / 2, 0);
  b.add(g, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), ONE), tint);
}

/** Square-section beam from a to b (window pillars). */
function beam(b: Batch, a: THREE.Vector3, c: THREE.Vector3, t: number, m: THREE.Matrix4, tint: Tint) {
  const d = V().subVectors(c, a);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t).translate(0, len / 2, 0);
  const local = new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), ONE);
  b.add(g, m.clone().multiply(local), tint);
}

/** Vertical wall quad a→b (outward normal is to the left of travel seen from above), with explicit UVs. */
function quad(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1], 2));
  g.computeVertexNormals();
  return g;
}

// ---------- Canvas textures

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, srgb: boolean, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** Tileable value noise, 0..1. */
function valueNoise(size: number, cells: number, seed: number) {
  const r = rng(seed);
  const lat = Array.from({ length: cells * cells }, () => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const L = (i: number, j: number) => lat[(j % cells) * cells + (i % cells)];
      out[y * size + x] = (L(x0, y0) * (1 - sx) + L(x0 + 1, y0) * sx) * (1 - sy) + (L(x0, y0 + 1) * (1 - sx) + L(x0 + 1, y0 + 1) * sx) * sy;
    }
  }
  return out;
}

/** Low-frequency RGB noise for breaking up tiling over hundreds of metres (linear data). */
function macroNoise(seed: number) {
  const S = 256;
  const c = canvas(S);
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const a = valueNoise(S, 4, seed);
  const b = valueNoise(S, 9, seed + 7);
  const d = valueNoise(S, 23, seed + 13);
  for (let i = 0; i < S * S; i++) {
    img.data[i * 4] = (a[i] * 0.65 + d[i] * 0.35) * 255;
    img.data[i * 4 + 1] = (b[i] * 0.7 + d[i] * 0.3) * 255;
    img.data[i * 4 + 2] = (a[i] * 0.5 + b[i] * 0.5) * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, 1);
}

/** Light grey sidewalk concrete with scored joints every 1.5 m (tile = 3 m). */
function pavingTexture() {
  const t = concreteTexture(23, 512);
  const g = (t.image as HTMLCanvasElement).getContext('2d')!;
  for (const k of [0, 256]) {
    g.fillStyle = 'rgba(58,54,50,0.55)';
    g.fillRect(0, k, 512, 3);
    g.fillRect(k, 0, 3, 512);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(0, k + 3, 512, 1);
    g.fillRect(k + 3, 0, 1, 512);
  }
  t.needsUpdate = true;
  return t;
}

/** Highway concrete: the park's concrete noise plus rain streaks running down from edges. */
function weatheredTexture() {
  const t = concreteTexture(41, 512);
  const g = (t.image as HTMLCanvasElement).getContext('2d')!;
  const r = rng(41);
  for (let i = 0; i < 90; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const len = 60 + r() * 240;
    const w = 2 + r() * 12;
    const a = 0.08 + r() * 0.14;
    for (const oy of [0, -512]) {
      const grd = g.createLinearGradient(0, y + oy, 0, y + oy + len);
      grd.addColorStop(0, `rgba(52,47,42,${a})`);
      grd.addColorStop(1, 'rgba(52,47,42,0)');
      g.fillStyle = grd;
      g.fillRect(x, y + oy, w, len);
    }
  }
  t.needsUpdate = true;
  return t;
}

/** Fallen maple leaves scattered in a disc, dense in the middle (transparent). */
function litterTexture() {
  const S = 512;
  const c = canvas(S);
  const g = c.getContext('2d')!;
  const r = rng(77);
  const cols = ['#b3261e', '#c8321f', '#d9542a', '#a8231a', '#e07b24', '#e8b530', '#8a3a1c', '#6e3a22'];
  for (let i = 0; i < 6500; i++) {
    const rad = Math.sqrt(r()) * 0.5;
    if (r() < rad * rad * 3.6) continue; // thin out towards the rim
    const a = r() * Math.PI * 2;
    g.save();
    g.translate(S / 2 + Math.cos(a) * rad * S, S / 2 + Math.sin(a) * rad * S);
    g.rotate(r() * Math.PI);
    g.globalAlpha = 0.8 + r() * 0.2;
    g.fillStyle = pick(r, cols);
    g.beginPath();
    g.ellipse(0, 0, 2.2 + r() * 2.6, 1.4 + r() * 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = tex(c, true, 8);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Bus-shelter lightbox poster: a generic civic "fall in the park" notice (no brands). */
function posterTexture() {
  const W = 256;
  const H = 400;
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#f6d98a');
  grd.addColorStop(1, '#d8602c');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // A big maple leaf (right half of the outline, mirrored), stem at the bottom.
  const half = [
    [0, -1],
    [0.18, -0.62],
    [0.34, -0.7],
    [0.3, -0.36],
    [0.62, -0.5],
    [0.9, -0.48],
    [0.72, -0.2],
    [0.82, -0.05],
    [0.42, 0.05],
    [0.55, 0.3],
    [0.2, 0.22],
    [0.08, 0.3],
    [0.03, 0.62],
  ];
  const leaf = [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y])];
  g.fillStyle = '#a3231a';
  g.beginPath();
  leaf.forEach(([x, y], i) => (i ? g.lineTo(W / 2 + x * 88, 178 + y * 88) : g.moveTo(W / 2 + x * 88, 178 + y * 88)));
  g.fill();
  g.fillStyle = '#fffaf0';
  g.textAlign = 'center';
  g.font = 'bold 54px Anton, Impact, sans-serif';
  g.fillText('FALL', W / 2, 62);
  g.font = 'bold 26px Anton, Impact, sans-serif';
  g.fillText('IN THE PARK', W / 2, 300);
  g.fillStyle = '#3b1d12';
  g.font = '15px sans-serif';
  g.fillText('Leaf pickup every Tuesday', W / 2, 340);
  g.fillText('Please keep the paths clear', W / 2, 362);
  const t = tex(c, true, 4);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft black blob for contact shadows / ambient occlusion decals. */
function aoTexture() {
  const c = canvas(128);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.65)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = tex(c, true, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft-edged band (for the highway's shadow on the ground). */
function bandTexture() {
  const c = canvas(4, 128);
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.22, 'rgba(0,0,0,1)');
  grd.addColorStop(0.7, 'rgba(0,0,0,1)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = tex(c, true, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- Building facades: one tile = 8 bays × 8 floors, colour + (roughness G, metalness B)

type Style = 'brick' | 'grey' | 'white' | 'glass';
const TILE = 8;
const WALL: Record<Style, string> = { brick: '#8c4633', grey: '#a9acad', white: '#e3dfd6', glass: '#2e3a46' };
const TRIM: Record<Style, string> = { brick: '#d6ccba', grey: '#85898c', white: '#f1eee8', glass: '#3a424b' };
const SHOP = '#2b3136';
const ROOF = '#77736d';

const orm = (rough: number, metal: number) => `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v * k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** One window pane: sky reflection, curtains, blinds or (rarely) a warm lit room. */
function pane(g: Ctx, o: Ctx, r: Rand, x: number, y: number, w: number, h: number) {
  const t = r();
  const grd = g.createLinearGradient(0, y, 0, y + h);
  let rough = 0.1;
  let metal = 0.65;
  if (t < 0.05) {
    grd.addColorStop(0, '#f3e2b8');
    grd.addColorStop(1, '#c9a874');
    rough = 0.5;
    metal = 0;
  } else if (t < 0.25) {
    grd.addColorStop(0, '#ddd3c2');
    grd.addColorStop(1, '#b3a690');
    rough = 0.85;
    metal = 0;
  } else if (t < 0.34) {
    grd.addColorStop(0, '#cdd0ce');
    grd.addColorStop(1, '#a4a8a6');
    rough = 0.7;
    metal = 0;
  } else {
    const k = 0.82 + r() * 0.36;
    grd.addColorStop(0, shade('#bccbdb', k));
    grd.addColorStop(0.5, shade('#71869b', k));
    grd.addColorStop(1, shade('#35414d', k));
  }
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  if (t >= 0.05 && t < 0.25) {
    g.fillStyle = 'rgba(90,70,50,0.14)';
    for (let xx = x + 2; xx < x + w; xx += 4) g.fillRect(xx, y, 1, h);
  } else if (t >= 0.25 && t < 0.34) {
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let yy = y + 2; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
  }
  o.fillStyle = orm(rough, metal);
  o.fillRect(x, y, w, h);
}

function facadeMaterial(style: Style, seed: number) {
  const S = 512;
  const C = S / TILE;
  const cv = canvas(S);
  const ocv = canvas(S);
  const g = cv.getContext('2d')!;
  const o = ocv.getContext('2d')!;
  const r = rng(seed);
  g.fillStyle = WALL[style];
  g.fillRect(0, 0, S, S);
  o.fillStyle = orm(0.9, 0);
  o.fillRect(0, 0, S, S);
  // Surface grain / weathering.
  for (let i = 0; i < 5000; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.05})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 2);
  }
  if (style === 'brick') {
    // Courses of individually toned bricks, running bond.
    for (let y = 0, row = 0; y < S; y += 3, row++) {
      g.fillStyle = 'rgba(230,214,192,0.16)';
      g.fillRect(0, y, S, 1);
      for (let x = (row % 2) * 3; x < S; x += 6) {
        const k = r();
        g.fillStyle = k < 0.5 ? `rgba(60,20,10,${0.05 + r() * 0.12})` : `rgba(205,125,95,${0.04 + r() * 0.1})`;
        g.fillRect(x, y + 1, 5, 2);
      }
    }
  }
  const accents = ['#6f8f8a', '#b86d4c', '#a07a55'];
  const accent = accents[seed % accents.length];
  for (let f = 0; f < TILE; f++) {
    for (let b = 0; b < TILE; b++) {
      const x = b * C;
      const y = f * C;
      if (style === 'brick') {
        const ww = C * 0.42;
        const wh = C * 0.5;
        const wx = x + (C - ww) / 2;
        const wy = y + C * 0.2;
        g.fillStyle = '#cdbfa6';
        g.fillRect(wx - 3, wy - 5, ww + 6, 5); // stone lintel
        g.fillStyle = '#d9cfbb';
        g.fillRect(wx - 4, wy + wh, ww + 8, 4); // sill
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(wx - 3, wy + wh + 4, ww + 6, 2);
        g.fillStyle = '#efece5';
        g.fillRect(wx, wy, ww, wh);
        pane(g, o, r, wx + 2, wy + 2, ww - 4, wh - 4);
        g.fillStyle = '#efece5';
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        g.fillRect(wx, wy + wh * 0.32, ww, 2);
        if (r() < 0.18) {
          // Juliet balcony railing
          g.fillStyle = '#26221f';
          g.fillRect(wx - 3, wy + wh * 0.62, ww + 6, 2);
          for (let k = wx - 2; k < wx + ww + 3; k += 3) g.fillRect(k, wy + wh * 0.62, 1, wh * 0.38);
        }
      } else if (style === 'grey') {
        g.fillStyle = 'rgba(40,40,40,0.25)';
        g.fillRect(x, y + C - 1, C, 1); // precast panel joints
        if (b % 2 === 0) g.fillRect(x, y, 1, C);
        const ww = C * 0.74;
        const wh = C * 0.5;
        const wx = x + (C - ww) / 2;
        const wy = y + C * 0.22;
        g.fillStyle = '#2d3135';
        g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        pane(g, o, r, wx, wy, ww, wh);
        g.fillStyle = '#2d3135';
        g.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
        if (b % 3 !== 1) {
          // Balcony: glass balustrade, slab edge, shadow below
          g.fillStyle = 'rgba(185,208,218,0.5)';
          g.fillRect(x + 1, y + C * 0.62, C - 2, C * 0.24);
          g.fillStyle = '#6b7075';
          g.fillRect(x + 1, y + C * 0.61, C - 2, 1);
          g.fillStyle = '#d6d8d8';
          g.fillRect(x, y + C * 0.86, C, C * 0.07);
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(x, y + C * 0.93, C, C * 0.05);
          o.fillStyle = orm(0.3, 0.2);
          o.fillRect(x + 1, y + C * 0.62, C - 2, C * 0.24);
        }
      } else if (style === 'white') {
        const acc = b % 4 === 1;
        if (acc) {
          g.fillStyle = accent;
          g.fillRect(x + C * 0.06, y + C * 0.08, C * 0.3, C * 0.8);
        }
        const wx = x + C * (acc ? 0.42 : 0.14);
        const ww = C * (acc ? 0.5 : 0.72);
        const wy = y + C * 0.1;
        const wh = C * 0.74;
        g.fillStyle = '#4f555b';
        g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        pane(g, o, r, wx, wy, ww, wh);
        g.fillStyle = '#4f555b';
        g.fillRect(wx + ww * 0.5 - 1, wy, 2, wh);
        if (b % 2 === 0) {
          g.fillStyle = 'rgba(30,32,35,0.55)';
          for (let k = x + 1; k < x + C - 1; k += 3) g.fillRect(k, y + C * 0.62, 1, C * 0.24);
          g.fillRect(x, y + C * 0.61, C, 2);
          g.fillStyle = '#f5f3ef';
          g.fillRect(x - 1, y + C * 0.86, C + 2, C * 0.07);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y + C * 0.93, C, C * 0.05);
        }
      } else {
        // Curtain wall: two panels per bay, spandrel band at each floor line.
        const sp = C * 0.22;
        for (const k of [0, 1]) {
          const px = x + (k * C) / 2;
          const v = 0.78 + r() * 0.44;
          const grd = g.createLinearGradient(0, y, 0, y + C - sp);
          grd.addColorStop(0, shade('#a9bdd0', v));
          grd.addColorStop(1, shade('#4b6077', v));
          g.fillStyle = grd;
          g.fillRect(px, y, C / 2, C - sp);
        }
        g.fillStyle = '#26303a';
        g.fillRect(x, y + C - sp, C, sp);
        g.fillStyle = '#aeb9c3';
        g.fillRect(x, y, 1, C);
        g.fillRect(x + C / 2, y, 1, C - sp);
        g.fillRect(x, y + C - sp, C, 1);
        o.fillStyle = orm(0.06, 0.85);
        o.fillRect(x, y, C, C - sp);
        o.fillStyle = orm(0.45, 0.3);
        o.fillRect(x, y + C - sp, C, sp);
      }
    }
  }
  const t = tex(ocv, false);
  return new THREE.MeshStandardMaterial({ map: tex(cv, true), roughnessMap: t, metalnessMap: t, roughness: 1, metalness: 1, vertexColors: true });
}

/** Four facade walls around a footprint; UVs map one texture cell per bay × floor. */
function facadeWalls(b: Batch, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, bay: number, floor: number, r: Rand, tint: Tint) {
  const loop: [number, number][] = [
    [x0, z1],
    [x1, z1],
    [x1, z0],
    [x0, z0],
    [x0, z1],
  ];
  const tu = bay * TILE;
  const tv = floor * TILE;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = loop[i];
    const [bx, bz] = loop[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = Math.floor(r() * TILE) / TILE;
    const v0 = Math.floor(r() * TILE) / TILE;
    b.add(quad(ax, az, bx, bz, y0, y1, u0, u0 + len / tu, v0, v0 + (y1 - y0) / tv), null, tint);
  }
}

// ---------- Materials with small shader tweaks

/** World-space macro variation (dry patches, tone blotches) so big tiled surfaces don't read as a grid. */
function macro(mat: THREE.MeshStandardMaterial, noise: THREE.Texture, key: string, scale: number, dry: THREE.Color, dryAmt: number) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.macroMap = { value: noise };
    s.uniforms.macroScale = { value: scale };
    s.uniforms.macroDry = { value: dry };
    s.uniforms.macroDryAmt = { value: dryAmt };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMacro;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacro = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vMacro;\nuniform sampler2D macroMap;\nuniform float macroScale;\nuniform vec3 macroDry;\nuniform float macroDryAmt;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  {
    vec3 mA = texture2D( macroMap, vMacro * macroScale ).rgb;
    vec3 mB = texture2D( macroMap, vMacro * macroScale * 0.23 + 0.31 ).rgb;
    diffuseColor.rgb *= mix( 0.8, 1.16, mA.r * 0.55 + mB.g * 0.45 );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * macroDry, smoothstep( 0.45, 0.8, mB.b * 0.6 + mA.g * 0.4 ) * macroDryAmt );
  }`,
      );
  };
  mat.customProgramCacheKey = () => `backdrop-${key}`;
  return mat;
}

/**
 * Leaf clusters: instance colours, a faint self-glow so sunlit autumn reds stay vivid in shade,
 * and a gentle breeze (whole clusters drift, higher ones more).
 */
function foliageMaterial(time: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  float swayPh = dot( instanceMatrix[3].xz, vec2( 0.37, 0.23 ) );
  float swayH = max( 0.0, instanceMatrix[3].y - 1.5 );
  mvPosition.x += ( sin( uTime * 1.3 + swayPh ) * 0.7 + sin( uTime * 2.9 + swayPh * 1.7 ) * 0.3 ) * 0.011 * swayH;
  mvPosition.z += sin( uTime * 1.1 + swayPh * 1.3 ) * 0.008 * swayH;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
    );
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.09;');
  };
  m.customProgramCacheKey = () => 'backdrop-foliage';
  return m;
}

const decal = (n: number) => ({ polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -2 * n });

// ---------- Trees

/**
 * One leaf clump: a core plus a ring of jittered low-poly lobes, so the silhouette is bumpy and
 * leafy instead of a smooth balloon. Normals lean away from the clump centre (it shades as one soft
 * mass but keeps its facets); undersides and some lobes are darker (baked into vertex colour).
 * Jitter is a smooth function of position, so shared vertices can't crack apart.
 */
function clusterGeometry(seed: number, lobes: number) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const v = V();
  const n = V();
  for (let i = 0; i < lobes; i++) {
    const a = (i / (lobes - 1)) * Math.PI * 2 + range(r, -0.35, 0.35);
    const c = i === 0 ? V(0, 0.1, 0) : V(Math.cos(a) * 0.52, range(r, -0.28, 0.22), Math.sin(a) * 0.52);
    const rad = i === 0 ? 0.62 : range(r, 0.4, 0.52);
    const g = new THREE.IcosahedronGeometry(rad, 0).rotateY(r() * 6.28).rotateX(r() * 6.28);
    g.deleteAttribute('uv');
    const pos = g.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const d = 1 + 0.2 * Math.sin(v.x * 9.1 + seed + i) * Math.sin(v.y * 7.3 + i * 2) + 0.12 * Math.sin(v.z * 11.3 + v.x * 4.1 + i);
      v.multiplyScalar(d).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); // non-indexed → face normals
    const nrm = g.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const tone = range(r, 0.86, 1.08);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      n.fromBufferAttribute(nrm, k).multiplyScalar(0.5).addScaledVector(v.clone().normalize(), 0.5).normalize();
      nrm.setXYZ(k, n.x, n.y, n.z);
      const s = (0.58 + 0.5 * clamp01((v.y + 0.75) / 1.5)) * tone;
      col.set([s, s, s], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return mergeGeometries(parts, false) ?? new THREE.IcosahedronGeometry(1, 1);
}

const MAPLE_REDS = ['#b3261e', '#c8321f', '#d9542a'];
const BARK = new THREE.Color('#5d534b');
const barkTint = (p: THREE.Vector3) => BARK.clone().multiplyScalar(0.6 + 0.4 * clamp01((p.y + 0.3) / 2.5));

function mapleColour(r: Rand) {
  const t = r();
  return t < 0.66 ? pick(r, MAPLE_REDS) : t < 0.84 ? '#e07b24' : '#e8b530';
}

/**
 * A maple: trunk, forked limbs aimed into the crown, twigs, then leaf clumps on every branch tip
 * plus an evenly spread (golden-angle) shell and a few dark inner clumps so the crown reads solid.
 * `lod` < 1 thins the shell for trees you only see from far away.
 */
function maple(x: number, z: number, h: number, R: number, colour: string, r: Rand, bark: Batch, leaves: Inst[], lod = 1) {
  const forkH = h * range(r, 0.27, 0.33);
  const fork = V(x + range(r, -0.35, 0.35), forkH, z + range(r, -0.35, 0.35));
  const r0 = range(r, 0.2, 0.28) * (h / 10);
  limb(bark, V(x, -0.3, z), fork, r0 * 1.2, r0 * 0.8, 7, barkTint);
  const ry = (h - forkH) * 0.5;
  const cy = forkH + ry * 1.05;
  const centre = V(fork.x, cy, fork.z);
  const tips: THREE.Vector3[] = [];
  const nb = 4 + Math.floor(r() * 2);
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < nb; i++) {
    const a = a0 + (i / nb) * Math.PI * 2 + range(r, -0.3, 0.3);
    const tgt = V(centre.x + Math.cos(a) * R * 0.72, cy + ry * range(r, -0.15, 0.5), centre.z + Math.sin(a) * R * 0.72);
    const end = fork.clone().lerp(tgt, 0.92);
    const mid = fork.clone().lerp(end, 0.5);
    mid.y += 0.25;
    limb(bark, fork, mid, r0 * 0.62, r0 * 0.42, 6, barkTint);
    limb(bark, mid, end, r0 * 0.42, r0 * 0.14, 5, barkTint);
    tips.push(end);
    const a2 = a + range(r, -0.9, 0.9);
    const twig = V(mid.x + Math.cos(a2) * R * 0.45, mid.y + ry * range(r, 0.35, 0.8), mid.z + Math.sin(a2) * R * 0.45);
    limb(bark, mid, twig, r0 * 0.26, r0 * 0.08, 5, barkTint);
    tips.push(twig);
  }
  const top = V(centre.x + range(r, -0.4, 0.4), h - 1.3, centre.z + range(r, -0.4, 0.4));
  limb(bark, fork, top, r0 * 0.55, r0 * 0.12, 6, barkTint);
  tips.push(top);

  const base = new THREE.Color(colour);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const put = (p: THREE.Vector3, s: number) => {
    // Lower / inner clusters darker (crown self-shadowing), top / outer ones bright.
    const f = clamp01((p.y - forkH) / (h - forkH));
    const out = clamp01(Math.hypot(p.x - centre.x, p.z - centre.z) / R);
    const k = 0.66 + 0.42 * clamp01(f * 0.65 + out * 0.45);
    // Hue only drifts towards orange (drifting the other way turns maples pink).
    const c = new THREE.Color().setHSL((hsl.h + range(r, -0.004, 0.022) + 1) % 1, clamp01(hsl.s + range(r, -0.08, 0.04)), clamp01(hsl.l + range(r, -0.05, 0.05)));
    c.multiplyScalar(k);
    e.set(range(r, -0.3, 0.3), r() * Math.PI * 2, range(r, -0.3, 0.3));
    const m = new THREE.Matrix4().compose(p, q.setFromEuler(e), V(s * range(r, 0.9, 1.1), s * range(r, 0.8, 0.95), s));
    leaves.push({ m, c });
  };
  for (const t of tips) put(t, R * range(r, 0.3, 0.38));
  const shell = Math.round((14 + r() * 3) * lod);
  const off = r() * Math.PI * 2;
  for (let i = 0; i < shell; i++) {
    const y = 1 - 1.7 * ((i + 0.5) / shell); // top → a little below the equator (the underside shows branches)
    const s = Math.sqrt(Math.max(0, 1 - y * y));
    const ph = i * 2.39996 + off;
    const k = range(r, 0.74, 0.98);
    put(V(centre.x + Math.cos(ph) * s * R * k, cy + y * ry * k, centre.z + Math.sin(ph) * s * R * k), R * range(r, 0.32, 0.4));
  }
  for (let i = 0; i < 2; i++) {
    const ph = r() * Math.PI * 2;
    put(V(centre.x + Math.cos(ph) * R * 0.3, cy + ry * range(r, -0.1, 0.3), centre.z + Math.sin(ph) * R * 0.3), R * 0.4);
  }
}

/** Evergreen: short trunk + ragged stacked cones (flat shaded). */
function pine(x: number, z: number, h: number, R: number, r: Rand, needles: Batch, bark: Batch) {
  limb(bark, V(x, -0.3, z), V(x, h * 0.4, z), 0.22, 0.12, 6, barkTint);
  const seed = r() * 10;
  const dark = new THREE.Color('#29452d');
  const light = new THREE.Color('#4f6d3d');
  for (let k = 0; k < 4; k++) {
    const t = k / 4;
    const rad = R * (1 - t * 0.7);
    const ch = h * (0.36 - t * 0.04);
    const y0 = h * 0.16 + t * h * 0.6;
    const cone = new THREE.ConeGeometry(rad, ch, 9, 2).translate(0, ch / 2, 0);
    const pos = cone.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const rr = Math.hypot(px, pz);
      if (rr < 1e-4) continue;
      const a = Math.atan2(pz, px);
      const j = 1 + 0.16 * Math.sin(a * 5 + seed + k) + 0.08 * Math.sin(a * 11 + seed * 2);
      pos.setXYZ(i, px * j, py - (rr / rad) * 0.3 * Math.max(0, j - 0.85), pz * j);
    }
    cone.computeVertexNormals();
    const tier = 0.82 + 0.25 * t;
    needles.add(cone, place(x, y0, z, r() * Math.PI * 2), (p) =>
      dark
        .clone()
        .lerp(light, clamp01(Math.hypot(p.x - x, p.z - z) / rad))
        .multiplyScalar(tier),
    );
  }
}

// ---------- Cars (local: +X forward, length along X, width along Z, wheels on y=0)

interface CarKit {
  L: number;
  W: number;
  H: number;
  body: THREE.BufferGeometry[]; // painted
  glass: THREE.BufferGeometry;
  fixed: [THREE.BufferGeometry, string][]; // lights, grille, plates, trim
  pillars: [THREE.Vector3, THREE.Vector3, number][];
  pillarColour: string | null; // null = body colour
  wheels: { x: number; z: number; r: number; w: number }[];
}

/** Squeeze a cabin inwards with height (tumblehome) so it doesn't look like a box on a box. */
function tumble(g: THREE.BufferGeometry, y0: number, y1: number, k: number) {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * (1 - k * clamp01((pos.getY(i) - y0) / (y1 - y0))));
  g.computeVertexNormals();
  return g;
}

function sideShape(pts: [number, number][], arches: [number, number, number][], bottom: number) {
  // Bottom edge runs rear → front with wheel arches cut in, then the given upper profile front → rear.
  const s = new THREE.Shape();
  s.moveTo(pts[pts.length - 1][0], bottom);
  for (const [ax, ay, ar] of arches) {
    s.lineTo(ax - ar, bottom);
    s.absarc(ax, ay, ar, Math.PI, 0, true);
  }
  for (const [x, y] of pts) s.lineTo(x, y);
  return s;
}

function sedanKit(): CarKit {
  const body = new THREE.ExtrudeGeometry(
    sideShape(
      [
        [2.3, 0.3],
        [2.36, 0.56],
        [2.26, 0.78],
        [1.0, 0.92],
        [-1.55, 0.95],
        [-2.24, 0.92],
        [-2.34, 0.62],
        [-2.3, 0.3],
      ],
      [
        [-1.38, 0.3, 0.42],
        [1.38, 0.3, 0.42],
      ],
      0.3,
    ),
    { depth: 1.7, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 },
  ).translate(0, 0, -0.85);
  const cabin = tumble(
    new THREE.ExtrudeGeometry(new THREE.Shape([V2(1.02, 0.9), V2(0.22, 1.38), V2(-0.9, 1.4), V2(-1.62, 0.93)]), { depth: 1.52, bevelEnabled: false }).translate(0, 0, -0.76),
    0.9,
    1.4,
    0.13,
  );
  const hz = 0.74;
  const tz = 0.66;
  return {
    L: 4.7,
    W: 1.8,
    H: 1.45,
    body: [body, cube(1.22, 0.05, 1.36, -0.34, 1.415, 0), cube(0.16, 0.1, 0.12, 0.92, 0.98, 0.93), cube(0.16, 0.1, 0.12, 0.92, 0.98, -0.93)],
    glass: cabin,
    fixed: [
      [cube(0.06, 0.1, 0.36, 2.3, 0.68, 0.58), '#f3f1e8'],
      [cube(0.06, 0.1, 0.36, 2.3, 0.68, -0.58), '#f3f1e8'],
      [cube(0.05, 0.14, 0.7, 2.34, 0.5, 0), '#191b1e'],
      [cube(0.06, 0.11, 0.42, -2.31, 0.76, 0.56), '#9a1b1b'],
      [cube(0.06, 0.11, 0.42, -2.31, 0.76, -0.56), '#9a1b1b'],
      [cube(0.03, 0.12, 0.36, 2.37, 0.4, 0), '#e6e6e0'],
      [cube(0.03, 0.12, 0.36, -2.35, 0.45, 0), '#e6e6e0'],
      [cube(0.1, 0.1, 1.72, 2.33, 0.34, 0), '#232528'],
      [cube(0.1, 0.1, 1.72, -2.33, 0.36, 0), '#232528'],
    ],
    pillars: [
      [V(1.02, 0.9, hz), V(0.22, 1.39, tz), 0.07],
      [V(1.02, 0.9, -hz), V(0.22, 1.39, -tz), 0.07],
      [V(-0.9, 1.4, tz), V(-1.62, 0.93, hz), 0.09],
      [V(-0.9, 1.4, -tz), V(-1.62, 0.93, -hz), 0.09],
      [V(-0.32, 0.93, hz + 0.01), V(-0.32, 1.39, tz + 0.01), 0.08],
      [V(-0.32, 0.93, -hz - 0.01), V(-0.32, 1.39, -tz - 0.01), 0.08],
    ],
    pillarColour: null,
    wheels: [-1.38, 1.38].flatMap((x) => [0.8, -0.8].map((z) => ({ x, z, r: 0.34, w: 0.22 }))),
  };
}

function suvKit(): CarKit {
  const body = new THREE.ExtrudeGeometry(
    sideShape(
      [
        [2.4, 0.42],
        [2.45, 0.78],
        [2.36, 1.02],
        [1.22, 1.12],
        [-2.3, 1.14],
        [-2.42, 1.08],
        [-2.44, 0.5],
        [-2.4, 0.42],
      ],
      [
        [-1.46, 0.42, 0.46],
        [1.46, 0.42, 0.46],
      ],
      0.42,
    ),
    { depth: 1.82, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6 },
  ).translate(0, 0, -0.91);
  const cabin = tumble(
    new THREE.ExtrudeGeometry(new THREE.Shape([V2(1.22, 1.1), V2(0.52, 1.7), V2(-2.12, 1.72), V2(-2.3, 1.12)]), { depth: 1.64, bevelEnabled: false }).translate(0, 0, -0.82),
    1.1,
    1.72,
    0.1,
  );
  const hz = 0.8;
  const tz = 0.74;
  return {
    L: 4.9,
    W: 1.92,
    H: 1.8,
    body: [body, cube(2.74, 0.06, 1.52, -0.8, 1.73, 0), cube(0.18, 0.12, 0.13, 1.1, 1.2, 0.99), cube(0.18, 0.12, 0.13, 1.1, 1.2, -0.99)],
    glass: cabin,
    fixed: [
      [cube(0.06, 0.12, 0.42, 2.38, 0.92, 0.62), '#f3f1e8'],
      [cube(0.06, 0.12, 0.42, 2.38, 0.92, -0.62), '#f3f1e8'],
      [cube(0.05, 0.3, 0.9, 2.44, 0.7, 0), '#1b1d20'],
      [cube(0.06, 0.24, 0.2, -2.42, 0.96, 0.7), '#9a1b1b'],
      [cube(0.06, 0.24, 0.2, -2.42, 0.96, -0.7), '#9a1b1b'],
      [cube(0.03, 0.12, 0.36, 2.47, 0.52, 0), '#e6e6e0'],
      [cube(0.03, 0.12, 0.36, -2.46, 0.66, 0), '#e6e6e0'],
      [cube(0.14, 0.2, 1.86, 2.42, 0.5, 0), '#2a2c2f'],
      [cube(0.14, 0.2, 1.86, -2.43, 0.52, 0), '#2a2c2f'],
      [cube(2.3, 0.05, 0.05, -0.8, 1.81, 0.62), '#2a2c2f'],
      [cube(2.3, 0.05, 0.05, -0.8, 1.81, -0.62), '#2a2c2f'],
    ],
    pillars: [
      [V(1.22, 1.1, hz), V(0.52, 1.71, tz), 0.08],
      [V(1.22, 1.1, -hz), V(0.52, 1.71, -tz), 0.08],
      [V(-0.42, 1.12, hz + 0.01), V(-0.42, 1.71, tz + 0.01), 0.09],
      [V(-0.42, 1.12, -hz - 0.01), V(-0.42, 1.71, -tz - 0.01), 0.09],
      [V(-1.5, 1.12, hz + 0.01), V(-1.5, 1.71, tz + 0.01), 0.12],
      [V(-1.5, 1.12, -hz - 0.01), V(-1.5, 1.71, -tz - 0.01), 0.12],
      [V(-2.12, 1.72, tz), V(-2.3, 1.13, hz), 0.12],
      [V(-2.12, 1.72, -tz), V(-2.3, 1.13, -hz), 0.12],
    ],
    pillarColour: '#1d1f22',
    wheels: [-1.46, 1.46].flatMap((x) => [0.84, -0.84].map((z) => ({ x, z, r: 0.39, w: 0.26 }))),
  };
}

// ---------- Layout data

interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floors: number;
  style: Style;
}

// Mid-rise apartment blocks: north (behind the vert wall), east (across the street), a few west/south.
const BLOCKS: Block[] = [
  { x0: -140, x1: -104, z0: -122, z1: -104, floors: 7, style: 'brick' },
  { x0: -84, x1: -51, z0: -114, z1: -99, floors: 6, style: 'grey' },
  { x0: -36, x1: 0, z0: -130, z1: -112, floors: 9, style: 'white' },
  { x0: 12, x1: 48, z0: -111, z1: -96, floors: 5, style: 'brick' },
  { x0: 63, x1: 93, z0: -128, z1: -107, floors: 8, style: 'grey' },
  { x0: -66, x1: -39, z0: -165, z1: -147, floors: 8, style: 'brick' },
  { x0: 111, x1: 129, z0: -84, z1: -51, floors: 6, style: 'white' },
  { x0: 111, x1: 129, z0: -30, z1: 6, floors: 8, style: 'brick' },
  { x0: 111, x1: 126, z0: 24, z1: 57, floors: 5, style: 'grey' },
  { x0: 150, x1: 171, z0: -54, z1: -18, floors: 9, style: 'grey' },
  { x0: -171, x1: -141, z0: -63, z1: -42, floors: 5, style: 'brick' },
  { x0: -165, x1: -147, z0: 18, z1: 54, floors: 6, style: 'white' },
  { x0: -84, x1: -51, z0: 130, z1: 148, floors: 6, style: 'grey' },
  { x0: 18, x1: 48, z0: 136, z1: 157, floors: 7, style: 'brick' },
];

interface Tower {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tiers: number;
  style: Style;
  spire?: number;
}

// Downtown, far to the north: it sits against the sun and deep in the haze, so it reads as a skyline.
const TOWERS: Tower[] = [
  { x: -170, z: -520, w: 30, d: 30, h: 120, tiers: 2, style: 'glass' },
  { x: -80, z: -585, w: 36, d: 28, h: 178, tiers: 3, style: 'glass', spire: 28 },
  { x: -5, z: -500, w: 28, d: 26, h: 100, tiers: 1, style: 'grey' },
  { x: 75, z: -560, w: 32, d: 32, h: 152, tiers: 3, style: 'glass' },
  { x: 160, z: -510, w: 24, d: 34, h: 96, tiers: 2, style: 'white' },
  { x: -265, z: -600, w: 28, d: 28, h: 112, tiers: 2, style: 'glass' },
  { x: 250, z: -620, w: 30, d: 30, h: 136, tiers: 2, style: 'glass', spire: 18 },
  { x: 10, z: -660, w: 32, d: 32, h: 128, tiers: 2, style: 'grey' },
  { x: -160, z: -690, w: 30, d: 30, h: 104, tiers: 1, style: 'glass' },
];

const CAR_COLOURS = ['#2e3238', '#8a929a', '#3b4b63', '#6e2228', '#c7c0b2', '#18191b', '#55614f', '#9aa3ab', '#a8412f', '#dcd6c8', '#4c5257'];

export function buildBackdrop(scene: THREE.Scene, phys: PhysicsWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  group.matrixAutoUpdate = false;
  scene.add(group);
  const r = rng(20260925);
  const collide = (desc: ReturnType<typeof RAPIER.ColliderDesc.cuboid>) => phys.addStatic(desc, 'scenery');
  const yawQ = (yaw: number) => new THREE.Quaternion().setFromAxisAngle(UP, yaw);

  // ---------- Materials (shared)
  const noise = macroNoise(9);
  // Tinted towards olive/straw: a late-season lawn, not a golf course.
  const grassMat = macro(
    new THREE.MeshStandardMaterial({ map: grassTexture(5, 512), color: '#cfc9a0', roughness: 0.97 }),
    noise,
    'grass',
    1 / 60,
    new THREE.Color(1.35, 1.1, 0.62),
    0.7,
  );
  const asphaltMat = macro(
    new THREE.MeshStandardMaterial({ map: asphaltTexture(11, 512), roughness: 0.9, ...decal(1) }),
    noise,
    'asphalt',
    1 / 45,
    new THREE.Color(1.25, 1.24, 1.2),
    0.5,
  );
  const pavingMat = macro(
    new THREE.MeshStandardMaterial({ map: pavingTexture(), color: '#d3d0ca', roughness: 0.88, vertexColors: true, ...decal(1) }),
    noise,
    'paving',
    1 / 40,
    new THREE.Color(0.9, 0.88, 0.84),
    0.5,
  );
  const concreteMat = new THREE.MeshStandardMaterial({ map: weatheredTexture(), color: '#bab5ad', roughness: 0.93, vertexColors: true });
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, ...decal(3) });
  const propsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const paintMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const carGlassMat = new THREE.MeshStandardMaterial({ color: '#1c2229', roughness: 0.05, metalness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#d6e6ec', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  const sway = { value: 0 };
  const leafMat = foliageMaterial(sway);
  const litterMat = new THREE.MeshStandardMaterial({ map: litterTexture(), transparent: true, alphaTest: 0.35, depthWrite: false, roughness: 0.9, ...decal(4) });
  const ao = aoTexture();
  const aoSoftMat = new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, opacity: 0.3, ...decal(3) });
  const aoHardMat = new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, opacity: 0.6, ...decal(3) });
  const bandMat = new THREE.MeshBasicMaterial({ map: bandTexture(), transparent: true, depthWrite: false, opacity: 0.45, ...decal(3) });
  const facadeMats: Record<Style, THREE.MeshStandardMaterial> = {
    brick: facadeMaterial('brick', 3),
    grey: facadeMaterial('grey', 5),
    white: facadeMaterial('white', 7),
    glass: facadeMaterial('glass', 11),
  };

  const B = {
    grass: new Batch(5),
    paving: new Batch(3),
    asphalt: new Batch(6),
    marks: new Batch(),
    concrete: new Batch(6),
    props: new Batch(),
    propsFar: new Batch(),
    barkNear: new Batch(),
    barkFar: new Batch(),
    pines: new Batch(),
    paint: new Batch(),
    carGlass: new Batch(),
    glass: new Batch(),
    posters: new Batch(),
    trim: new Batch(),
    litter: new Batch(),
    aoSoft: new Batch(),
    aoHard: new Batch(),
    facade: { brick: new Batch(), grey: new Batch(), white: new Batch(), glass: new Batch() } as Record<Style, Batch>,
  };
  const leavesNear: Inst[] = [];
  const leavesFar: Inst[] = [];
  const clumps: Inst[] = [];

  // ---------- Ground: a grass disc with the park cut out, a concrete ring hugging the park
  const disc = new THREE.Shape();
  disc.absarc(0, 0, GROUND_R, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.moveTo(PARK.x0, PARK.z0).lineTo(PARK.x1, PARK.z0).lineTo(PARK.x1, PARK.z1).lineTo(PARK.x0, PARK.z1).lineTo(PARK.x0, PARK.z0);
  disc.holes.push(hole);
  B.grass.add(new THREE.ShapeGeometry(disc, 48).rotateX(-Math.PI / 2).translate(0, -0.02, 0), null);

  const { x0: px0, x1: px1, z0: pz0, z1: pz1 } = PARK;
  B.paving.add(rect(px0 - RING, px1 + RING, pz0 - RING, pz0), null);
  B.paving.add(rect(px0 - RING, px1 + RING, pz1, pz1 + RING), null);
  B.paving.add(rect(px0 - RING, px0, pz0, pz1), null);
  B.paving.add(rect(px1, px1 + RING, pz0, pz1), null);
  // Footpaths across the lawns + short connectors from the ring to the street sidewalks.
  const PATH = '#e8e5df';
  B.paving.add(rect(-RUN, px0 - RING, -1.5, 1.5), null, PATH);
  B.paving.add(rect(-RUN, NS.x0 - 3, -88, -85), null, PATH);
  for (const x of [-30, 30]) B.paving.add(rect(x - 1, x + 1, pz1 + RING, EW.z0 - 3), null, PATH);
  for (const z of [-20, 20]) B.paving.add(rect(px1 + RING, NS.x0 - 3, z - 1, z + 1), null, PATH);

  // ---------- Streets: asphalt, raised sidewalks with a pale kerb stone, markings
  B.asphalt.add(rect(-RUN, RUN, EW.z0, EW.z1), null);
  B.asphalt.add(rect(NS.x0, NS.x1, -RUN, EW.z0), null);
  B.asphalt.add(rect(NS.x0, NS.x1, EW.z1, RUN), null);
  const WALK = '#e2dfd9';
  const KERB = '#ffffff';
  for (const [a, b] of [
    [-RUN, NS.x0],
    [NS.x1, RUN],
  ]) {
    B.paving.add(box(a, b, -0.03, CURB, EW.z0 - 3, EW.z0 - 0.25), null, WALK);
    B.paving.add(box(a, b, -0.03, CURB, EW.z0 - 0.25, EW.z0), null, KERB);
    B.paving.add(box(a, b, -0.03, CURB, EW.z1, EW.z1 + 0.25), null, KERB);
    B.paving.add(box(a, b, -0.03, CURB, EW.z1 + 0.25, EW.z1 + 3), null, WALK);
  }
  for (const [a, b] of [
    [-RUN, EW.z0 - 3],
    [EW.z1 + 3, RUN],
  ]) {
    B.paving.add(box(NS.x0 - 3, NS.x0 - 0.25, -0.03, CURB, a, b), null, WALK);
    B.paving.add(box(NS.x0 - 0.25, NS.x0, -0.03, CURB, a, b), null, KERB);
    B.paving.add(box(NS.x1, NS.x1 + 0.25, -0.03, CURB, a, b), null, KERB);
    B.paving.add(box(NS.x1 + 0.25, NS.x1 + 3, -0.03, CURB, a, b), null, WALK);
  }
  const WHITE = '#e9e7e0';
  const YELLOW = '#dcb440';
  const mark = (x0: number, x1: number, z0: number, z1: number, c: string) => B.marks.add(rect(x0, x1, z0, z1, 0.006), null, new THREE.Color(c).multiplyScalar(range(r, 0.8, 1)));
  const ewMid = (EW.z0 + EW.z1) / 2;
  const nsMid = (NS.x0 + NS.x1) / 2;
  for (let x = -RUN; x < RUN; x += 9) if (x + 3 < NS.x0 - 5 || x > NS.x1 + 5) mark(x, x + 3, ewMid - 0.07, ewMid + 0.07, YELLOW);
  for (let z = -RUN; z < RUN; z += 9) if (z + 3 < EW.z0 - 7 || z > EW.z1 + 7) mark(nsMid - 0.07, nsMid + 0.07, z, z + 3, YELLOW);
  for (const z of [EW.z0 + 2.5, EW.z1 - 2.5]) {
    mark(-RUN, NS.x0 - 4, z - 0.06, z + 0.06, WHITE);
    mark(NS.x1 + 4, RUN, z - 0.06, z + 0.06, WHITE);
  }
  for (const x of [NS.x0 + 2.5, NS.x1 - 2.5]) {
    mark(x - 0.06, x + 0.06, -RUN, EW.z0 - 7, WHITE);
    mark(x - 0.06, x + 0.06, EW.z1 + 7, RUN, WHITE);
  }
  // Zebra crossings on all four arms of the junction.
  for (let z = EW.z0 + 0.5; z < EW.z1 - 0.3; z += 1.1) {
    mark(NS.x0 - 2.8, NS.x0 - 0.2, z, z + 0.55, WHITE);
    mark(NS.x1 + 0.2, NS.x1 + 2.8, z, z + 0.55, WHITE);
  }
  for (let x = NS.x0 + 0.5; x < NS.x1 - 0.3; x += 1.1) {
    mark(x, x + 0.55, EW.z0 - 2.8, EW.z0 - 0.2, WHITE);
    mark(x, x + 0.55, EW.z1 + 0.2, EW.z1 + 2.8, WHITE);
  }

  // ---------- Elevated highway (south): deck, box girders, jersey parapets, hammerhead piers
  const deckBot = HWY.top - 0.55;
  const girderBot = deckBot - 1.3;
  B.concrete.add(box(-RUN, RUN, deckBot, HWY.top, HWY.z - HWY.half, HWY.z + HWY.half), null, '#dedbd5');
  for (const dz of [-3.9, 3.9]) B.concrete.add(box(-RUN, RUN, girderBot, deckBot, HWY.z + dz - 1.3, HWY.z + dz + 1.3), null, '#bab6af');
  const jersey = new THREE.Shape([V2(-0.3, 0), V2(0.3, 0), V2(0.3, 0.08), V2(0.18, 0.3), V2(0.12, 1.05), V2(-0.12, 1.05), V2(-0.18, 0.3), V2(-0.3, 0.08)]);
  const parapet = new THREE.ExtrudeGeometry(jersey, { depth: 2 * RUN, bevelEnabled: false });
  for (const s of [-1, 1]) B.concrete.add(parapet, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-RUN, HWY.top, HWY.z + s * (HWY.half - 0.32)), '#e4e1db');
  const column = new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateY(Math.PI / 8);
  const cap = new THREE.ExtrudeGeometry(new THREE.Shape([V2(-1.7, 0), V2(1.7, 0), V2(5.9, 1.0), V2(5.9, 1.45), V2(-5.9, 1.45), V2(-5.9, 1.0)]), {
    depth: 1.8,
    bevelEnabled: false,
  })
    .translate(0, 0, -0.9)
    .rotateY(Math.PI / 2);
  const pierBase = new THREE.Color('#d2cec7');
  const pierTint = (p: THREE.Vector3) => pierBase.clone().multiplyScalar(0.62 + 0.38 * clamp01((p.y + 0.3) / 3));
  const colTop = girderBot - 1.45;
  for (let x = -RUN + 25; x < RUN; x += 25) {
    if (Math.abs(x - nsMid) < 12) continue; // leave the east street clear
    B.concrete.add(column, new THREE.Matrix4().compose(V(x, (colTop - 0.3) / 2, HWY.z), new THREE.Quaternion(), V(0.85, colTop + 0.3, 1.4)), pierTint);
    B.concrete.add(cap, place(x, colTop, HWY.z), '#d6d3cd');
  }

  // ---------- Buildings
  for (const b of BLOCKS) {
    const PL = 4.2;
    const H = PL + b.floors * 3;
    const T = TRIM[b.style];
    const tone = new THREE.Color(range(r, 0.94, 1.06), range(r, 0.95, 1.04), range(r, 0.93, 1.03));
    facadeWalls(B.facade[b.style], b.x0, b.x1, b.z0, b.z1, PL, H, 3, 3, r, (p) => tone.clone().multiplyScalar(0.82 + 0.18 * clamp01((p.y - PL) / 15)));
    // Ground floor: dark shop glazing, fascia band above, piers every ~6 m.
    const o = 0.12;
    B.trim.add(box(b.x0 - o, b.x1 + o, -0.05, 3.3, b.z0 - o, b.z1 + o), null, (_p, n) => (n.y > 0.5 ? T : SHOP));
    B.trim.add(box(b.x0 - o - 0.08, b.x1 + o + 0.08, 3.3, PL, b.z0 - o - 0.08, b.z1 + o + 0.08), null, T);
    for (let x = b.x0 + 3; x < b.x1 - 1; x += 6) for (const z of [b.z0 - o - 0.1, b.z1 + o]) B.trim.add(box(x - 0.25, x + 0.25, -0.05, 3.3, z, z + 0.1), null, T);
    for (let z = b.z0 + 3; z < b.z1 - 1; z += 6) for (const x of [b.x0 - o - 0.1, b.x1 + o]) B.trim.add(box(x, x + 0.1, -0.05, 3.3, z - 0.25, z + 0.25), null, T);
    // Cornice + flat roof with plant rooms.
    B.trim.add(box(b.x0 - 0.3, b.x1 + 0.3, H, H + 0.9, b.z0 - 0.3, b.z1 + 0.3), null, (_p, n) => (n.y > 0.5 ? ROOF : T));
    const rx = range(r, b.x0 + 4, b.x1 - 8);
    const rz = range(r, b.z0 + 3, b.z1 - 7);
    B.trim.add(box(rx, rx + 4.5, H + 0.9, H + 3.6, rz, rz + 4.5), null, T);
    for (let k = 0; k < 3; k++) {
      const ux = range(r, b.x0 + 2, b.x1 - 4);
      const uz = range(r, b.z0 + 2, b.z1 - 3);
      B.trim.add(box(ux, ux + 2.2, H + 0.9, H + 2.2, uz, uz + 1.6), null, '#b4b8bb');
    }
  }
  for (const t of TOWERS) {
    const bay = t.style === 'glass' ? 4 : 3;
    const steps = t.tiers === 1 ? [[1, 1]] : t.tiers === 2 ? [[1, 0.7], [0.72, 1]] : [[1, 0.55], [0.8, 0.82], [0.58, 1]];
    let y = 0;
    for (const [f, hf] of steps) {
      const hw = (t.w * f) / 2;
      const hd = (t.d * f) / 2;
      const top = t.h * hf;
      facadeWalls(B.facade[t.style], t.x - hw, t.x + hw, t.z - hd, t.z + hd, y, top, bay, bay, r, '#ffffff');
      B.trim.add(box(t.x - hw - 0.3, t.x + hw + 0.3, top, top + 1.4, t.z - hd - 0.3, t.z + hd + 0.3), null, (_p, n) => (n.y > 0.5 ? ROOF : TRIM[t.style]));
      y = top + 1.4;
    }
    if (t.spire) B.trim.add(new THREE.CylinderGeometry(0.12, 0.7, t.spire, 6).translate(t.x, y + t.spire / 2, t.z), null, '#9aa2aa');
  }
  // A ring of simple far blocks so the horizon reads as city, not a lawn that stops.
  const styles: Style[] = ['brick', 'grey', 'white', 'grey'];
  const far: [number, number, number, number][] = [];
  for (let tries = 0; far.length < 96 && tries < 4000; tries++) {
    const a = r() * Math.PI * 2;
    const rad = range(r, 270, 780);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (Math.abs(z - HWY.z) < 30 || Math.abs(x - nsMid) < 22 || Math.abs(z - ewMid) < 22) continue;
    if (TOWERS.some((t) => Math.hypot(t.x - x, t.z - z) < 50)) continue;
    const w = 3 * Math.round(range(r, 6, 13));
    const d = 3 * Math.round(range(r, 5, 10));
    if (far.some(([fx, fz, fw, fd]) => Math.abs(fx - x) < (fw + w) / 2 + 8 && Math.abs(fz - z) < (fd + d) / 2 + 8)) continue;
    far.push([x, z, w, d]);
    const st = pick(r, styles);
    const H = 3 * Math.round(range(r, 4, 13));
    facadeWalls(B.facade[st], x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, H, 3, 3, r, '#ffffff');
    B.trim.add(box(x - w / 2 - 0.3, x + w / 2 + 0.3, H, H + 0.9, z - d / 2 - 0.3, z + d / 2 + 0.3), null, (_p, n) => (n.y > 0.5 ? ROOF : TRIM[st]));
  }

  // ---------- Street furniture: lamps, benches, planters, bus shelters
  const lamp = (x: number, y: number, z: number, dx: number, dz: number) => {
    const h = 8;
    const m = place(x, y, z, Math.atan2(-dz, dx));
    const P = '#434a4e';
    const near = parkDist(x, z) < NEAR;
    const b = near ? B.props : B.propsFar; // far lamps stay out of the shadow pass
    b.add(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 10).translate(0, 0.3, 0), m, P);
    b.add(new THREE.CylinderGeometry(0.075, 0.12, h, 10, 1, true).translate(0, h / 2, 0), m, P);
    b.add(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 10).translate(0, h, 0), m, P);
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6, 1, true).rotateZ(-Math.PI / 2 + 0.12).translate(0.85, h - 0.2, 0), m, P);
    b.add(cube(0.95, 0.16, 0.42, 1.68, h - 0.02, 0), m, P);
    b.add(cube(0.75, 0.03, 0.3, 1.68, h - 0.11, 0), m, '#f3efe0');
    if (near) collide(RAPIER.ColliderDesc.cylinder(h / 2, 0.16).setTranslation(x, y + h / 2, z));
  };
  const lampSpots: [number, number, number, number, number][] = [
    [-45, 0, pz1 + 4.3, 0, -1],
    [0, 0, pz1 + 4.3, 0, -1],
    [45, 0, pz1 + 4.3, 0, -1],
    [-25, 0, pz0 - 4.3, 0, 1],
    [15, 0, pz0 - 4.3, 0, 1],
    [50, 0, pz0 - 4.3, 0, 1],
    [px1 + 4.3, 0, -33, -1, 0],
    [px1 + 4.3, 0, 33, -1, 0],
    [px0 - 4.3, 0, -30, 1, 0],
    [px0 - 4.3, 0, 30, 1, 0],
    [-100, CURB, EW.z1 + 2.2, 0, -1],
    [-40, CURB, EW.z1 + 2.2, 0, -1],
    [20, CURB, EW.z1 + 2.2, 0, -1],
    [NS.x1 + 2.2, CURB, -60, -1, 0],
    [NS.x1 + 2.2, CURB, 0, -1, 0],
    [NS.x1 + 2.2, CURB, 40, -1, 0],
  ];
  for (const [x, y, z, dx, dz] of lampSpots) lamp(x, y, z, dx, dz);
  // Highway: steel handrail on both parapets and tall lamps along the deck, alternating sides.
  for (const s of [-1, 1]) {
    const z = HWY.z + s * (HWY.half - 0.32);
    B.propsFar.add(box(-RUN, RUN, HWY.top + 1.1, HWY.top + 1.18, z - 0.04, z + 0.04), null, '#6d7479');
  }
  for (let x = -480, k = 0; x <= 480; x += 60, k++) {
    const s = k % 2 ? 1 : -1;
    lamp(x, HWY.top, HWY.z + s * (HWY.half - 0.8), 0, -s);
  }

  const bench = (x: number, z: number, yaw: number) => {
    const m = place(x, 0, z, yaw);
    const WOOD = '#8d5f3d';
    const IRON = '#2f3438';
    for (const bz of [-0.14, 0, 0.14]) B.props.add(cube(1.8, 0.04, 0.12, 0, 0.45, bz), m, WOOD);
    for (const by of [0.62, 0.78]) B.props.add(cube(1.8, 0.11, 0.035, 0, by, 0.25), m, WOOD);
    for (const bx of [-0.72, 0.72]) {
      B.props.add(cube(0.06, 0.43, 0.06, bx, 0.215, -0.16), m, IRON);
      B.props.add(cube(0.06, 0.86, 0.06, bx, 0.43, 0.23), m, IRON);
      B.props.add(cube(0.06, 0.05, 0.46, bx, 0.41, 0.03), m, IRON);
    }
    B.aoHard.add(new THREE.PlaneGeometry(2.3, 1.1).rotateX(-Math.PI / 2).translate(0, 0.012, 0.05), m);
    collide(RAPIER.ColliderDesc.cuboid(0.92, 0.45, 0.33).setTranslation(x, 0.45, z).setRotation(yawQ(yaw)));
  };
  // Benches on the ring face the park (sitter faces local -Z).
  bench(-22, pz1 + 2.8, 0);
  bench(22, pz1 + 2.8, 0);
  bench(-5, pz0 - 2.8, Math.PI);
  bench(33, pz0 - 2.8, Math.PI);
  bench(px1 + 2.8, -8, Math.PI / 2);
  bench(px0 - 2.8, -15, -Math.PI / 2);

  const planter = (x: number, z: number) => {
    const s = 1.3;
    const t = 0.18;
    const C = '#dedad3';
    B.concrete.add(box(x - s, x + s, -0.05, 0.6, z - s, z - s + t), null, C);
    B.concrete.add(box(x - s, x + s, -0.05, 0.6, z + s - t, z + s), null, C);
    B.concrete.add(box(x - s, x - s + t, -0.05, 0.6, z - s + t, z + s - t), null, C);
    B.concrete.add(box(x + s - t, x + s, -0.05, 0.6, z - s + t, z + s - t), null, C);
    B.props.add(rect(x - s + t, x + s - t, z - s + t, z + s - t, 0.48), null, '#3b2c22');
    for (let k = 0; k < 6; k++) {
      const sc = range(r, 0.45, 0.7);
      const c = new THREE.Color(k === 0 ? '#b3301f' : pick(r, ['#557a3a', '#4b6e33', '#62803f'])).multiplyScalar(range(r, 0.85, 1.05));
      const p = V(x + range(r, -0.7, 0.7), 0.55 + sc * 0.5, z + range(r, -0.7, 0.7));
      leavesNear.push({ m: new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), V(sc, sc * 0.85, sc)), c });
    }
    collide(RAPIER.ColliderDesc.cuboid(s, 0.3, s).setTranslation(x, 0.3, z));
  };
  planter(px1 + 2.5, pz0 - 2.5);
  planter(px1 + 2.5, pz1 + 2.5);
  planter(px0 - 2.5, pz1 + 2.5);

  const shelter = (x: number, z: number, yaw: number) => {
    // Local: long along X, glass back wall at +Z, open to the street at -Z.
    const m = place(x, CURB, z, yaw);
    const DARK = '#3c4247';
    for (const [sx, sz] of [
      [-2.2, -0.75],
      [2.2, -0.75],
      [-2.2, 0.75],
      [2.2, 0.75],
    ])
      B.props.add(cube(0.09, 2.5, 0.09, sx, 1.25, sz), m, DARK);
    B.props.add(cube(4.8, 0.12, 1.9, 0, 2.56, -0.05), m, '#cfd3d6');
    B.props.add(cube(4.8, 0.22, 0.06, 0, 2.5, -1.0), m, DARK);
    B.props.add(cube(0.2, 2.05, 1.36, 2.2, 1.28, 0.05), m, DARK);
    B.props.add(cube(0.22, 1.8, 1.16, 2.2, 1.28, 0.05), m, '#e8eef2');
    for (const s of [-1, 1]) B.posters.add(new THREE.PlaneGeometry(1.1, 1.72).rotateY((s * Math.PI) / 2).translate(2.2 + s * 0.112, 1.28, 0.05), m);
    B.props.add(cube(2.2, 0.05, 0.4, -0.4, 0.46, 0.5), m, '#9aa0a6');
    for (const bx of [-1.4, 0.6]) B.props.add(cube(0.05, 0.44, 0.35, bx, 0.22, 0.5), m, DARK);
    B.glass.add(cube(4.3, 2.0, 0.02, 0, 1.3, 0.75), m);
    B.glass.add(cube(0.02, 2.0, 1.3, -2.2, 1.3, 0.05), m);
    B.aoHard.add(new THREE.PlaneGeometry(5.2, 2.4).rotateX(-Math.PI / 2).translate(0, 0.012, 0), m);
    collide(RAPIER.ColliderDesc.cuboid(2.35, 1.35, 0.9).setTranslation(x, CURB + 1.35, z).setRotation(yawQ(yaw)));
  };
  shelter(-26, EW.z0 - 1.6, Math.PI);
  shelter(NS.x0 - 1.4, -5, -Math.PI / 2);

  // ---------- Parked cars along the kerbs (right-hand traffic: north kerb faces west, etc.)
  const kits = { sedan: sedanKit(), suv: suvKit() };
  const cars: [number, number, number, 'sedan' | 'suv', string][] = [
    [-52, EW.z0 + 1.25, Math.PI, 'sedan', CAR_COLOURS[0]],
    [-44.4, EW.z0 + 1.25, Math.PI, 'suv', CAR_COLOURS[2]],
    [-12, EW.z0 + 1.25, Math.PI, 'sedan', CAR_COLOURS[1]],
    [-4.6, EW.z0 + 1.25, Math.PI, 'sedan', CAR_COLOURS[3]],
    [21, EW.z0 + 1.25, Math.PI, 'suv', '#ecebe7'],
    [28.6, EW.z0 + 1.25, Math.PI, 'sedan', CAR_COLOURS[4]],
    [50, EW.z0 + 1.25, Math.PI, 'sedan', CAR_COLOURS[5]],
    [-20, EW.z1 - 1.25, 0, 'sedan', CAR_COLOURS[6]],
    [35, EW.z1 - 1.25, 0, 'suv', CAR_COLOURS[7]],
    [NS.x0 + 1.25, -35, -Math.PI / 2, 'sedan', CAR_COLOURS[8]],
    [NS.x0 + 1.25, -27.4, -Math.PI / 2, 'suv', CAR_COLOURS[10]],
    [NS.x0 + 1.25, 14, -Math.PI / 2, 'sedan', CAR_COLOURS[9]],
    [NS.x1 - 1.25, 30, Math.PI / 2, 'sedan', CAR_COLOURS[1]],
  ];
  for (const [x, z, yaw0, kind, colour] of cars) {
    const k = kits[kind];
    const yaw = yaw0 + range(r, -0.025, 0.025);
    const m = place(x, 0, z, yaw);
    for (const g of k.body) B.paint.add(g, m, colour);
    for (const [g, c] of k.fixed) B.paint.add(g, m, c);
    for (const [a, b, t] of k.pillars) beam(B.paint, a, b, t, m, k.pillarColour ?? colour);
    B.carGlass.add(k.glass, m);
    for (const w of k.wheels) {
      B.props.add(new THREE.CylinderGeometry(w.r, w.r, w.w, 16).rotateX(Math.PI / 2).translate(w.x, w.r, w.z), m, '#1a1a1c');
      B.props.add(new THREE.CylinderGeometry(w.r * 0.62, w.r * 0.62, w.w + 0.012, 12).rotateX(Math.PI / 2).translate(w.x, w.r, w.z), m, '#b5b9bd');
    }
    B.aoHard.add(new THREE.PlaneGeometry(k.L * 1.12, k.W * 1.45).rotateX(-Math.PI / 2).translate(0, 0.01, 0), m);
    collide(RAPIER.ColliderDesc.cuboid(k.L / 2, k.H / 2, k.W / 2).setTranslation(x, k.H / 2, z).setRotation(yawQ(yaw)));
  }

  // ---------- Trees
  // Keep-out rectangles for trunks: park + ring, streets, under the highway, paths, buildings.
  const keep: [number, number, number, number][] = [
    [px0 - RING - 1, px1 + RING + 1, pz0 - RING - 1, pz1 + RING + 1],
    [-Infinity, Infinity, EW.z0 - 3.8, EW.z1 + 3.8],
    [NS.x0 - 3.8, NS.x1 + 3.8, -Infinity, Infinity],
    [-Infinity, Infinity, HWY.z - 11, HWY.z + 11],
    [-Infinity, NS.x0, -89, -84],
    [-Infinity, px0, -2.5, 2.5],
    ...BLOCKS.map((b): [number, number, number, number] => [b.x0 - 5, b.x1 + 5, b.z0 - 5, b.z1 + 5]),
    ...far.map(([x, z, w, d]): [number, number, number, number] => [x - w / 2 - 5, x + w / 2 + 5, z - d / 2 - 5, z + d / 2 + 5]),
  ];
  const spots: { x: number; z: number; pine: boolean; scale: number }[] = [];
  const free = (x: number, z: number, gap: number) =>
    !keep.some(([a, b, c, d]) => x > a && x < b && z > c && z < d) &&
    !spots.some((s) => Math.hypot(s.x - x, s.z - z) < gap) &&
    !lampSpots.some(([lx, , lz]) => Math.hypot(lx - x, lz - z) < 4.5);
  const addRow = (pts: [number, number][], scale: number) => {
    for (const [x, z] of pts) if (free(x, z, 5)) spots.push({ x, z, pine: false, scale });
  };
  const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, gap: number, pines: number, scale: number) => {
    let placed = 0;
    for (let tries = 0; placed < n && tries < 600; tries++) {
      const x = range(r, x0, x1);
      const z = range(r, z0, z1);
      if (!free(x, z, gap)) continue;
      spots.push({ x, z, pine: placed < pines, scale });
      placed++;
    }
  };
  // Street trees in the verges (smaller), then groves on the lawns.
  addRow([-105, -91, -77, -63, -49, -35, -21, -7, 7, 21, 35, 49, 63].map((x): [number, number] => [x + range(r, -1, 1), pz1 + RING + 2]), 0.85);
  addRow([-46, -24, -11, 2, 13, 26, 46].map((z): [number, number] => [px1 + RING + 2, z + range(r, -1, 1)]), 0.85);
  addRow([-110, -80, -50, -20, 10, 40].map((x): [number, number] => [x + range(r, -2, 2), EW.z1 + 5.5]), 0.9);
  addRow([-110, -85, -40, -15, 10, 32, 56].map((z): [number, number] => [NS.x1 + 6.5, z + range(r, -2, 2)]), 0.9);
  scatter(15, -95, 95, -82, -61, 7.5, 3, 1);
  scatter(9, -125, -72, -50, 55, 8, 2, 1);
  scatter(10, -260, 260, -260, 260, 14, 2, 1.05);

  for (const s of spots) {
    const near = parkDist(s.x, s.z) < NEAR;
    const bark = near ? B.barkNear : B.barkFar;
    let R: number;
    if (s.pine) {
      const h = range(r, 9, 13) * s.scale;
      R = range(r, 2.6, 3.4) * s.scale;
      pine(s.x, s.z, h, R, r, B.pines, bark);
    } else {
      const h = range(r, 8.5, 12.5) * s.scale;
      R = range(r, 3.4, 4.6) * s.scale;
      const d = parkDist(s.x, s.z);
      maple(s.x, s.z, h, R, mapleColour(r), r, bark, near ? leavesNear : leavesFar, d < 25 ? 1 : d < 80 ? 0.75 : 0.55);
      // Fallen leaves around the trunk (never spilling into the park).
      const lr = Math.min(R * 1.35, parkDist(s.x, s.z) - 0.3);
      B.litter.add(new THREE.PlaneGeometry(lr * 2, lr * 2).rotateX(-Math.PI / 2).rotateY(r() * Math.PI * 2).translate(s.x, 0.014, s.z), null);
    }
    const ar = Math.min(R * 1.25, parkDist(s.x, s.z) - 0.3);
    B.aoSoft.add(new THREE.PlaneGeometry(ar * 2, ar * 2).rotateX(-Math.PI / 2).translate(s.x, 0.008, s.z), null);
    if (near) collide(RAPIER.ColliderDesc.cylinder(2.5, s.pine ? 0.24 : 0.3).setTranslation(s.x, 2.5, s.z));
  }

  // Distant trees filling the gaps between far blocks: a bare trunk under a few big low-poly clumps.
  const CLUMP = ['#8e2a1f', '#a4401f', '#9c7a2a', '#4d5c36', '#7f2a22', '#b0561f'];
  for (let tries = 0, n = 0; n < 72 && tries < 2000; tries++) {
    const a = r() * Math.PI * 2;
    const rad = range(r, 230, 760);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (Math.abs(z - HWY.z) < 16 || Math.abs(x - nsMid) < 12 || Math.abs(z - ewMid) < 12) continue;
    if (far.some(([fx, fz, fw, fd]) => Math.abs(fx - x) < fw / 2 + 8 && Math.abs(fz - z) < fd / 2 + 8)) continue;
    if (TOWERS.some((t) => Math.hypot(t.x - x, t.z - z) < 40)) continue;
    n++;
    const base = new THREE.Color(pick(r, CLUMP));
    const h = range(r, 7, 12);
    const s = h * range(r, 0.3, 0.4);
    limb(B.barkFar, V(x, -0.3, z), V(x, h - s * 0.6, z), 0.35, 0.2, 5, barkTint);
    for (let k = 0; k < 3; k++) {
      const p = V(x + range(r, -0.5, 0.5) * s, h - s * 0.45 + range(r, -0.2, 0.25) * s, z + range(r, -0.5, 0.5) * s);
      clumps.push({
        m: new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), V(s, s * 0.8, s)),
        c: base.clone().multiplyScalar(range(r, 0.75, 1.05)),
      });
    }
  }

  // ---------- Assemble (merged meshes + instanced foliage)
  const add = (m: THREE.Object3D) => {
    group.add(m);
    return m;
  };
  add(B.grass.mesh(grassMat, 'bd-grass'));
  add(B.paving.mesh(pavingMat, 'bd-paving'));
  add(B.asphalt.mesh(asphaltMat, 'bd-asphalt'));
  add(B.marks.mesh(markMat, 'bd-markings'));
  add(B.concrete.mesh(concreteMat, 'bd-concrete', false, false));
  add(B.props.mesh(propsMat, 'bd-props', true));
  add(B.propsFar.mesh(propsMat, 'bd-props-far'));
  add(B.barkNear.mesh(barkMat, 'bd-bark-near', true));
  add(B.barkFar.mesh(barkMat, 'bd-bark-far'));
  add(B.pines.mesh(pineMat, 'bd-pines'));
  add(B.paint.mesh(paintMat, 'bd-car-paint', true));
  add(B.carGlass.mesh(carGlassMat, 'bd-car-glass', true));
  add(B.glass.mesh(glassMat, 'bd-shelter-glass', false, false));
  const poster = posterTexture();
  add(B.posters.mesh(new THREE.MeshStandardMaterial({ map: poster, emissiveMap: poster, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.3 }), 'bd-posters'));
  add(B.trim.mesh(trimMat, 'bd-building-trim', false, false));
  for (const st of Object.keys(B.facade) as Style[]) add(B.facade[st].mesh(facadeMats[st], `bd-facade-${st}`, false, false));
  const decals = [
    [B.aoSoft.mesh(aoSoftMat, 'bd-ao-soft'), 1],
    [B.aoHard.mesh(aoHardMat, 'bd-ao-hard'), 1],
    [B.litter.mesh(litterMat, 'bd-leaf-litter'), 2],
  ] as const;
  for (const [m, order] of decals) {
    m.renderOrder = order;
    add(m);
  }
  // The highway is too far for the shadow map, so paint its shadow where the scene's sun puts it.
  const sunLight = scene.children.find((o): o is THREE.DirectionalLight => (o as THREE.DirectionalLight).isDirectionalLight === true);
  const sd = sunLight ? sunLight.position.clone().sub(sunLight.target.position).normalize() : V(-0.44, 0.64, -0.63);
  const kz = -sd.z / Math.max(0.2, sd.y); // ground shift along z per metre of height
  const e0 = HWY.z - HWY.half + girderBot * kz;
  const e1 = HWY.z + HWY.half + (HWY.top + 1.05) * kz;
  const band = new THREE.Mesh(new THREE.PlaneGeometry(2 * RUN, Math.abs(e1 - e0) + 6).rotateX(-Math.PI / 2).translate(0, 0.11, (e0 + e1) / 2), bandMat);
  band.name = 'bd-highway-shadow';
  band.renderOrder = 1;
  band.receiveShadow = false;
  add(band);

  const leafGeo = clusterGeometry(3, 4);
  const instanced = (geo: THREE.BufferGeometry, list: Inst[], name: string, cast: boolean) => {
    const m = new THREE.InstancedMesh(geo, leafMat, Math.max(1, list.length));
    list.forEach((it, i) => {
      m.setMatrixAt(i, it.m);
      m.setColorAt(i, it.c);
    });
    m.count = list.length;
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.onBeforeRender = () => {
      sway.value = performance.now() / 1000;
    };
    return add(m);
  };
  const leafGeoLow = clusterGeometry(5, 3); // 3 lobes: for trees you never see up close
  instanced(leafGeo, leavesNear, 'bd-leaves-near', true);
  instanced(leafGeoLow, leavesFar, 'bd-leaves-far', false);
  instanced(leafGeoLow, clumps, 'bd-far-clumps', false);

  group.updateMatrixWorld(true);
  return group;
}
