import * as THREE from 'three';

// Procedural canvas textures (no downloads): concrete, asphalt, grass, bark, cone stripes, signs.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on an n×n lattice. */
function noiseField(size: number, cells: number, seed: number) {
  const r = rng(seed);
  const lat = new Float32Array(cells * cells).map(() => r());
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
      const a = lat[(y0 % cells) * cells + (x0 % cells)];
      const b = lat[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = lat[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = lat[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * size + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
    }
  }
  return out;
}

function fbm(size: number, seed: number, octaves: [number, number][]) {
  const out = new Float32Array(size * size);
  let total = 0;
  octaves.forEach(([cells, amp], i) => {
    const n = noiseField(size, cells, seed + i * 101);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * amp;
    total += amp;
  });
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

function toTexture(canvas: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Light grey concrete with aggregate specks, trowel mottling, hairline cracks. Tinted by material colour. */
export function concreteTexture(seed = 7, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const n = fbm(size, seed, [
    [4, 1],
    [8, 0.8],
    [32, 0.5],
    [128, 0.35],
    [256, 0.25],
  ]);
  const r = rng(seed * 3);
  for (let i = 0; i < size * size; i++) {
    let v = 0.78 + (n[i] - 0.5) * 0.22;
    const s = r();
    if (s > 0.985) v -= 0.12 * r();
    else if (s < 0.01) v += 0.08 * r();
    const k = Math.max(0, Math.min(1, v)) * 255;
    img.data[i * 4] = k;
    img.data[i * 4 + 1] = k;
    img.data[i * 4 + 2] = k;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Hairline cracks (wrap-safe by drawing at offsets).
  g.strokeStyle = 'rgba(40,30,30,0.28)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 7; k++) {
    let x = r() * size;
    let y = r() * size;
    let a = r() * Math.PI * 2;
    g.beginPath();
    for (let j = 0; j < 60; j++) {
      a += (r() - 0.5) * 0.9;
      const nx = x + Math.cos(a) * 6;
      const ny = y + Math.sin(a) * 6;
      for (const ox of [-size, 0, size])
        for (const oy of [-size, 0, size]) {
          g.moveTo(x + ox, y + oy);
          g.lineTo(nx + ox, ny + oy);
        }
      x = nx;
      y = ny;
    }
    g.stroke();
  }
  // Skid / wax stains
  for (let k = 0; k < 14; k++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 20 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(60,45,45,${0.05 + r() * 0.08})`);
    grd.addColorStop(1, 'rgba(60,45,45,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return toTexture(c);
}

export function asphaltTexture(seed = 11, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const n = fbm(size, seed, [
    [8, 1],
    [64, 0.6],
    [256, 0.8],
  ]);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    let v = 0.26 + (n[i] - 0.5) * 0.12 + (r() - 0.5) * 0.08;
    v = Math.max(0, Math.min(1, v));
    img.data[i * 4] = v * 255;
    img.data[i * 4 + 1] = v * 255;
    img.data[i * 4 + 2] = v * 262;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function grassTexture(seed = 5, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const n = fbm(size, seed, [
    [4, 1],
    [16, 0.6],
    [128, 0.5],
  ]);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = n[i];
    const t = r();
    // Autumn lawn: green with straw and a few red leaves.
    let R = 70 + v * 60 + t * 20;
    let G = 95 + v * 55 + t * 20;
    let B = 40 + v * 20;
    if (t > 0.995) {
      R = 190;
      G = 50;
      B = 30;
    } else if (t > 0.99) {
      R = 200;
      G = 140;
      B = 40;
    }
    img.data[i * 4] = R;
    img.data[i * 4 + 1] = G;
    img.data[i * 4 + 2] = B;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

export function stripeTexture(a: string, b: string, stripes = 4) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, (i * 256) / stripes, 64, 256 / stripes);
  }
  return toTexture(c);
}

/** Window-grid facade for background apartment blocks. */
export function facadeTexture(seed: number, base: string, floors: number, cols: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const r = rng(seed);
  const fh = 512 / floors;
  const cw = 512 / cols;
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < cols; k++) {
      const lit = r();
      g.fillStyle = lit > 0.85 ? '#d9c9a0' : lit > 0.4 ? '#39414d' : '#4a5563';
      g.fillRect(k * cw + cw * 0.18, f * fh + fh * 0.22, cw * 0.64, fh * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(k * cw + cw * 0.14, f * fh + fh * 0.74, cw * 0.72, fh * 0.06);
    }
  }
  return toTexture(c);
}

/** Painted sign with text. */
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; border?: string } = {}) {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg ?? '#f4f1e8';
  g.fillRect(0, 0, w, h);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = w * 0.03;
    g.strokeRect(w * 0.03, w * 0.03, w - w * 0.06, h - w * 0.06);
  }
  g.fillStyle = opts.fg ?? '#1b1b1b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = h / (lines.length + 1);
  lines.forEach((l, i) => {
    let size = lh * 0.78;
    g.font = `${size}px ${opts.font ?? 'Anton, Impact, sans-serif'}`;
    while (g.measureText(l).width > w * 0.86 && size > 8) {
      size -= 2;
      g.font = `${size}px ${opts.font ?? 'Anton, Impact, sans-serif'}`;
    }
    g.fillText(l, w / 2, lh * (i + 1));
  });
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft blob for sprites (dust, sparks, shadow). */
export function blobTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
