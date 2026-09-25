import * as THREE from 'three';

export type RailKind = 'rail' | 'ledge' | 'coping' | 'bench' | 'roof' | 'sculpture';

/** A grindable polyline (rail, ledge edge, coping). Points are the contact line (top surface). */
export class GrindRail {
  pts: THREE.Vector3[];
  cum: number[] = [0];
  total = 0;
  closed: boolean;
  constructor(public id: string, public name: string, public kind: RailKind, pts: THREE.Vector3[], closed = false) {
    this.pts = pts.slice();
    this.closed = closed;
    if (closed && pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) > 1e-3) this.pts.push(pts[0].clone());
    for (let i = 1; i < this.pts.length; i++) {
      this.total += this.pts[i].distanceTo(this.pts[i - 1]);
      this.cum.push(this.total);
    }
  }

  /** Closest point on the rail to p: returns arc length s and distance. */
  closest(p: THREE.Vector3) {
    let best = { s: 0, d: Infinity, seg: 0 };
    const a = new THREE.Vector3();
    const ab = new THREE.Vector3();
    for (let i = 0; i < this.pts.length - 1; i++) {
      a.copy(this.pts[i]);
      ab.subVectors(this.pts[i + 1], a);
      const L2 = ab.lengthSq();
      let t = L2 > 0 ? (p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z : 0;
      t = Math.max(0, Math.min(1, t / (L2 || 1)));
      const qx = a.x + ab.x * t - p.x;
      const qy = a.y + ab.y * t - p.y;
      const qz = a.z + ab.z * t - p.z;
      const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (d < best.d) best = { s: this.cum[i] + Math.sqrt(L2) * t, d, seg: i };
    }
    return best;
  }

  /** Closest point measured horizontally (XZ) — used for capture from above. */
  closestXZ(p: THREE.Vector3) {
    let best = { s: 0, dxz: Infinity, y: 0, seg: 0 };
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const L2 = abx * abx + abz * abz;
      let t = L2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + abx * t - p.x;
      const qz = a.z + abz * t - p.z;
      const d = Math.hypot(qx, qz);
      if (d < best.dxz) best = { s: this.cum[i] + a.distanceTo(b) * t, dxz: d, y: a.y + (b.y - a.y) * t, seg: i };
    }
    return best;
  }

  /** Point and unit tangent at arc length s (clamped, or wrapped when closed). */
  at(s: number, outP = new THREE.Vector3(), outT = new THREE.Vector3()) {
    if (this.closed) s = ((s % this.total) + this.total) % this.total;
    else s = Math.max(0, Math.min(this.total, s));
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const L = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / L;
    outP.lerpVectors(a, b, t);
    outT.subVectors(b, a).normalize();
    return { p: outP, t: outT };
  }

  isEnd(s: number) {
    return !this.closed && (s <= 0.001 || s >= this.total - 0.001);
  }
}
