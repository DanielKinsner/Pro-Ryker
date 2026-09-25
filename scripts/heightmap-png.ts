// Debug: render the park height grid to a PNG (top-down) so the layout can be inspected.
import { writeFileSync } from 'node:fs';
import { sampleHeights } from '../src/park/heightfield';
import { BOUNDS, FEATURES } from '../src/park/layout';
import { deflateSync } from 'node:zlib';
const cell = 0.25;
const g = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, cell);
let lo = Infinity, hi = -Infinity;
for (const v of g.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
console.log('height range', lo.toFixed(2), hi.toFixed(2), 'grid', g.nx, g.nz);
const w = g.nx, h = g.nz;
const raw = Buffer.alloc((w * 3 + 1) * h);
for (let z = 0; z < h; z++) {
  raw[z * (w * 3 + 1)] = 0;
  for (let x = 0; x < w; x++) {
    const v = g.h[z * w + x];
    const o = z * (w * 3 + 1) + 1 + x * 3;
    // hillshade
    const vx = g.h[z * w + Math.min(w - 1, x + 1)] - v;
    const vz = g.h[Math.min(h - 1, z + 1) * w + x] - v;
    const shade = Math.max(0, Math.min(1, 0.6 - (vx + vz) * 2));
    const base = v < -0.01 ? [70, 110, 200] : v > 0.01 ? [230, 140, 90] : [200, 190, 185];
    const k = v === 0 ? 1 : 0.55 + shade * 0.6;
    const cont = Math.abs(v * 2 - Math.round(v * 2)) < 0.03 && v !== 0 ? 0.5 : 1;
    raw[o] = base[0] * k * cont; raw[o + 1] = base[1] * k * cont; raw[o + 2] = base[2] * k * cont;
  }
}
const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(process.argv[2] ?? 'heightmap.png', png);
