import { describe, it, expect } from 'vitest';
import { Combo, REPEAT, spinLabel } from '../src/game/combo';

describe('combo scoring (THPS rules)', () => {
  it('multiplier is the trick count', () => {
    const c = new Combo();
    c.add('kickflip', 'KICKFLIP', 250);
    c.add('grind:A', 'CHASSIS GRIND', 150);
    c.add('manual', 'MANUAL', 80);
    expect(c.multiplier).toBe(3);
    expect(c.total).toBe((250 + 150 + 80) * 3);
  });

  it('repeating a trick in one combo depreciates it', () => {
    const c = new Combo();
    for (let i = 0; i < 5; i++) c.add('kickflip', 'KICKFLIP', 100);
    const expected = REPEAT.reduce((s, f) => s + 100 * f, 0);
    expect(c.base).toBe(Math.round(expected));
  });

  it('continuous tricks grow only while live', () => {
    const c = new Combo();
    c.add('manual', 'MANUAL', 80, true);
    c.grow('manual', 20);
    c.end('manual');
    c.grow('manual', 1000);
    expect(c.base).toBe(100);
  });

  it('sketchy landings halve the banked value', () => {
    const c = new Combo();
    c.add('kickflip', 'KICKFLIP', 200);
    c.quality = 0.5;
    const r = c.bank();
    expect(r.score).toBe(100);
    expect(c.active).toBe(false);
  });

  it('multiplier is capped', () => {
    const c = new Combo();
    for (let i = 0; i < 40; i++) c.add(`t${i}`, 'T', 10);
    expect(c.multiplier).toBe(20);
  });

  it('spin labels round to the nearest 180 within tolerance', () => {
    expect(spinLabel(0).label).toBe('');
    expect(spinLabel(Math.PI * 0.85).label).toBe('180');
    expect(spinLabel(-Math.PI * 2.05).label).toBe('360');
    expect(spinLabel(Math.PI * 1.5).label).toBe('180');
  });
});
