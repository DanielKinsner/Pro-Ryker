import type { Game } from './game';
import { SPAWNS } from '../park/layout';
import { EW, NS, HWY, CITY_LIMIT } from '../park/city';

// Secrets: easter eggs for leaving the park (there's no fence). Each pays out and gets its voice line
// once per run, and is remembered forever in the save (Goals screen: SECRETS FOUND). Also the safety
// net: anything that ends up below the world is put back at the start.

export interface SecretDef {
  id: string;
  name: string;
  /** Toast subtitle. */
  sub: string;
  points: number;
}

export const SECRETS: SecretDef[] = [
  { id: 'jaywalker', name: 'JAYWALKER', sub: 'You left the skatepark. There was no fence.', points: 250 },
  { id: 'bridge', name: 'UNDER THE BRIDGE', sub: 'Troll toll waived.', points: 400 },
  { id: 'interstate', name: 'WRONG WAY ON THE INTERSTATE', sub: 'The on-ramp was a suggestion.', points: 1500 },
  { id: 'insurance', name: 'INSURANCE CLAIM', sub: 'It was parked.', points: 0 },
  { id: 'apartment', name: 'APARTMENT HUNTING', sub: 'Found one. With your face.', points: 0 },
  { id: 'returned', name: 'RETURNED TO SENDER', sub: 'Found at the county line and driven back to the park.', points: 0 },
];

/** Below this you've fallen out of the world. */
export const FLOOR_Y = -25;

/** The riding secret at this spot, if any (vehicle position). Pure, so it's testable. */
export function zoneSecret(x: number, y: number, z: number): 'jaywalker' | 'bridge' | 'interstate' | null {
  const alongDeck = Math.abs(z - HWY.z) < HWY.half - 0.5;
  if (alongDeck && y > HWY.top - 1) return 'interstate';
  if (alongDeck && y < 4) return 'bridge';
  const onStreet = (z > EW.z0 && z < EW.z1) || (x > NS.x0 && x < NS.x1);
  if (onStreet && y < 1.5) return 'jaywalker';
  return null;
}

export function beyondCityLimit(x: number, z: number) {
  return Math.hypot(x, z) > CITY_LIMIT;
}

export class Explore {
  private found = new Set<string>(); // this run
  private recentSpeed = 0;
  private touching = new Set<string>();
  onSecret: ((def: SecretDef, first: boolean) => void) | null = null;

  constructor(private game: Game) {}

  reset() {
    this.found.clear();
  }

  step(dt: number) {
    const g = this.game;
    const v = g.vehicle;
    const r = g.rider;
    const p = v.pos;
    if (p.y < FLOOR_Y) {
      g.events.emit('fell_off_map', {});
      this.sendHome();
      return;
    }
    if (g.demo) return;
    const riding = r.attached || r.hanging;
    if (riding && beyondCityLimit(p.x, p.z)) {
      this.find('returned');
      this.sendHome();
      return;
    }
    if (riding && v.grounded) {
      const id = zoneSecret(p.x, p.y, p.z);
      if (id) this.find(id);
    }
    // Crashes into the city: judged on the speed of the last moment (the hit itself kills it).
    this.recentSpeed = Math.max(v.speed, this.recentSpeed - dt * 15);
    if (this.recentSpeed > 5) {
      this.touching.clear();
      v.staticContactTags(this.touching);
      if (this.touching.has('car')) this.find('insurance');
      if (this.touching.has('building')) this.find('apartment');
    }
  }

  private sendHome() {
    const s = SPAWNS[0];
    this.game.respawn(s.x, s.z, s.yawDeg);
  }

  private find(id: string) {
    if (this.found.has(id)) return;
    this.found.add(id);
    const def = SECRETS.find((s) => s.id === id);
    if (!def) return;
    const g = this.game;
    const first = !g.save.secrets.includes(id);
    if (first && g.recordsEnabled) {
      g.save.secrets.push(id);
      g.persist();
    }
    if (def.points && g.rider.attached) g.tricks.combo.add(`secret:${id}`, def.name, def.points);
    g.events.emit('secret', { id, name: def.name, points: def.points, first });
    this.onSecret?.(def, first);
  }
}
