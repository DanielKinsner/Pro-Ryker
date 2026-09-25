import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bowlProfile, bowlTransWidth, featureHeight, sampleHeights, contours } from '../src/park/heightfield';
import { FEATURES, BOUNDS, RAILS } from '../src/park/layout';
import { GrindRail } from '../src/park/rails';

describe('park heightfield', () => {
  it('bowl profile starts at deck level and reaches the floor', () => {
    expect(bowlProfile(0, 2.8, 3.4)).toBeCloseTo(0, 5);
    expect(bowlProfile(bowlTransWidth(2.8, 3.4) + 1, 2.8, 3.4)).toBeCloseTo(-2.8, 5);
  });
  it('bowl profile is monotonic (no lumps in the transition)', () => {
    let prev = 1;
    for (let d = 0; d < 5; d += 0.05) {
      const h = bowlProfile(d, 3, 3.4);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });
  it('flat deck between features is exactly level (no smooth-min sag)', () => {
    const g = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, 1);
    for (const [x, z] of [
      [-58, -4],
      [-60, 33],
      [30, -8],
      [34, 4],
    ]) {
      const ix = Math.round((x - g.minX) / g.cell);
      const iz = Math.round((z - g.minZ) / g.cell);
      expect(Math.abs(g.h[iz * g.nx + ix])).toBeLessThan(1e-6);
    }
  });
  it('the clover bowl is one connected bowl (one coping loop)', () => {
    const g = sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, 0.5);
    const loops = contours(g, -0.04).filter((l) => l.length > 20);
    expect(loops.length).toBe(1);
  });
  it('quarterpipes reach their authored height', () => {
    const qp = FEATURES.find((f) => f.id === 'overcommit')!;
    if (qp.type !== 'qp') throw new Error('expected qp');
    expect(featureHeight(qp, qp.x, qp.z - 7)).toBeCloseTo(qp.height, 1);
  });
});

describe('grind rails', () => {
  it('closest point and arc length', () => {
    const r = new GrindRail('t', 'T', 'rail', [new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 1, 0)]);
    const c = r.closestXZ(new THREE.Vector3(4, 2, 0.5));
    expect(c.s).toBeCloseTo(4, 5);
    expect(c.dxz).toBeCloseTo(0.5, 5);
    expect(r.isEnd(0)).toBe(true);
    expect(r.isEnd(5)).toBe(false);
  });
  it('every authored rail has length', () => {
    for (const d of RAILS) {
      const r = new GrindRail(d.id, d.name, d.kind, d.points.map((p) => new THREE.Vector3(...p)));
      expect(r.total).toBeGreaterThan(2);
    }
  });
});
