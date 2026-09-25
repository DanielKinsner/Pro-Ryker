// The city around the park (drawn in backdrop.ts; the secrets in game/explore.ts read the same numbers).
// Axes: +X east, +Z south. The park is x∈[-64,64], z∈[-52,52].

export const EW = { z0: 64, z1: 76 }; // south street asphalt: parking lane + 2 lanes + parking lane
export const NS = { x0: 76, x1: 88 }; // east street asphalt
export const HWY = { z: 95, half: 7, top: 9 }; // elevated interstate, running east–west
/** The on-ramp: climbs along +X beside the highway's north edge (x0→x1), then a flat merge (x1→x2). */
export const ON_RAMP = { x0: 100, x1: 172, x2: 196, z0: 81, z1: 87.4, top: HWY.top };
/** Metres from the park centre where the county line is (you get sent back). */
export const CITY_LIMIT = 560;
