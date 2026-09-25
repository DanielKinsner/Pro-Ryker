import { SESSION } from '../config/tuning';

// Tony Hawk-style combo: sum of trick values × (number of tricks), capped.
// Repeating the same trick inside one combo is worth less each time.
// Continuous tricks (manual, grind, face manual, held grabs) grow while you hold them.

export interface ComboEntry {
  id: string;
  name: string;
  base: number; // current points (grows for continuous tricks)
  factor: number; // repeat depreciation
  live: boolean; // still accruing
}

export const REPEAT = [1, 0.75, 0.5, 0.25, 0.1];

export class Combo {
  entries: ComboEntry[] = [];
  private counts = new Map<string, number>();
  /** Quality multiplier applied on bank (sketchy landing = 0.5). */
  quality = 1;

  get active() {
    return this.entries.length > 0;
  }

  get tricks() {
    return this.entries.length;
  }

  get multiplier() {
    return Math.max(1, Math.min(SESSION.multiplierCap, this.entries.length));
  }

  get base() {
    let s = 0;
    for (const e of this.entries) s += e.base * e.factor;
    return Math.round(s);
  }

  get total() {
    return Math.round(this.base * this.multiplier * this.quality);
  }

  add(id: string, name: string, base: number, live = false): ComboEntry {
    const n = this.counts.get(id) ?? 0;
    this.counts.set(id, n + 1);
    const e: ComboEntry = { id, name, base, factor: REPEAT[Math.min(n, REPEAT.length - 1)], live };
    this.entries.push(e);
    return e;
  }

  /** Grow the most recent live entry with this id. */
  grow(id: string, points: number) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      if (e.id === id && e.live) {
        e.base += points;
        return e;
      }
    }
    return null;
  }

  end(id: string) {
    for (const e of this.entries) if (e.id === id) e.live = false;
  }

  /** Rename the last entry (e.g. "KICKFLIP" → "360 KICKFLIP" once the spin is known). */
  last() {
    return this.entries[this.entries.length - 1] ?? null;
  }

  names() {
    return this.entries.map((e) => (e.factor < 1 && e.factor > 0 ? `${e.name}` : e.name));
  }

  bank(): { score: number; tricks: number; multiplier: number; names: string[] } {
    const out = { score: this.total, tricks: this.tricks, multiplier: this.multiplier, names: this.names() };
    this.clear();
    return out;
  }

  clear() {
    this.entries = [];
    this.counts.clear();
    this.quality = 1;
  }
}

/** Spin label for accumulated yaw (radians, signed). Rounded to the nearest 180 within tolerance. */
export function spinLabel(yawRad: number): { deg: number; label: string } {
  const deg = Math.abs((yawRad * 180) / Math.PI);
  const halves = Math.floor((deg + 35) / 180); // within 35° counts
  const d = halves * 180;
  return { deg: d, label: d >= 180 ? `${d}` : '' };
}
