import { describe, it, expect, beforeAll } from 'vitest';
import { zoneSecret, beyondCityLimit, SECRETS } from '../src/game/explore';
import { EW, NS, HWY, ON_RAMP, CITY_LIMIT } from '../src/park/city';
import { initRapier, PhysicsWorld } from '../src/physics/world';
import { sampleHeights } from '../src/park/heightfield';
import { BOUNDS, FEATURES } from '../src/park/layout';
import { addParkColliders } from '../src/park/build';

describe('city secrets', () => {
  it('inside the park is never a secret', () => {
    expect(zoneSecret(0, 0, 0)).toBeNull();
    expect(zoneSecret(-58, 0, -4)).toBeNull();
  });
  it('on either street is JAYWALKER', () => {
    expect(zoneSecret(0, 0.05, (EW.z0 + EW.z1) / 2)).toBe('jaywalker');
    expect(zoneSecret((NS.x0 + NS.x1) / 2, 0.05, -30)).toBe('jaywalker');
  });
  it('under the highway is UNDER THE BRIDGE, on top of it is the interstate', () => {
    expect(zoneSecret(40, 0.05, HWY.z)).toBe('bridge');
    expect(zoneSecret(240, HWY.top + 0.05, HWY.z)).toBe('interstate');
  });
  it('the on-ramp itself (beside the deck, not on it) is not the interstate yet', () => {
    expect(zoneSecret(ON_RAMP.x1 + 5, ON_RAMP.top + 0.05, (ON_RAMP.z0 + ON_RAMP.z1) / 2)).toBeNull();
  });
  it('the county line is past the far city ring, and every secret has a unique id', () => {
    expect(beyondCityLimit(0, CITY_LIMIT - 1)).toBe(false);
    expect(beyondCityLimit(CITY_LIMIT, 1)).toBe(true);
    expect(new Set(SECRETS.map((s) => s.id)).size).toBe(SECRETS.length);
  });
});

describe('the world has a floor all the way out', () => {
  let phys: PhysicsWorld;
  beforeAll(async () => {
    await initRapier();
    phys = new PhysicsWorld();
    addParkColliders(phys, sampleHeights(FEATURES, BOUNDS.minX, BOUNDS.minZ, BOUNDS.sizeX, BOUNDS.sizeZ, BOUNDS.cell));
  });
  it('ground exists out to the edge of the visible grass (it used to stop at 400 m)', () => {
    for (const [x, z] of [
      [450, 0],
      [0, -1050],
      [-1050, 300],
      [760, 760],
    ])
      expect(phys.groundHeight(x, z)).toBeCloseTo(0, 3);
  });
});
