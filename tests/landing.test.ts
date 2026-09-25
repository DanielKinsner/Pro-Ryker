import { describe, it, expect } from 'vitest';
import { classifyLanding, type LandingInput } from '../src/physics/landing';

const base: LandingInput = { upDot: 1, yawErrDeg: 0, impact: 3, trickUnfinished: false, grabReleasedAgo: Infinity, grabHeld: 'none', speed: 12 };
const L = (o: Partial<LandingInput>) => classifyLanding({ ...base, ...o });
const cos = (d: number) => Math.cos((d * Math.PI) / 180);

describe('landing classification (against the real surface normal)', () => {
  it('square landing is clean', () => expect(L({}).quality).toBe('clean'));
  it('fully backwards is a legit fakie, not a bail', () => {
    const r = L({ yawErrDeg: 175 });
    expect(r.quality).toBe('clean');
    expect(r.fakie).toBe(true);
  });
  it('sideways is bad (he gets thrown and hangs on)', () => expect(L({ yawErrDeg: 90 }).quality).toBe('bad'));
  it('a bit crooked is sketchy', () => expect(L({ yawErrDeg: 45 }).quality).toBe('sketchy'));
  it('sideways after vert air (the game steers that) is only sketchy, even landing hard', () =>
    expect(L({ yawErrDeg: 90, vert: true, impact: 15 }).quality).toBe('sketchy'));
  it('upside down is a slam', () => expect(L({ upDot: -0.9 }).quality).toBe('slam'));
  it('landing mid-flip is at least sketchy', () => expect(L({ trickUnfinished: true }).quality).not.toBe('clean'));
  it('no hands on the bars at touchdown is a slam', () => expect(L({ grabHeld: 'hands' }).quality).toBe('slam'));
  it('legs still in the Superman at touchdown is bad (hang on)', () => expect(L({ grabHeld: 'legs' }).quality).toBe('bad'));
  it('a big hit makes a sketchy landing worse', () => {
    expect(L({ upDot: cos(35) }).quality).toBe('sketchy');
    expect(L({ upDot: cos(35), impact: 16 }).quality).toBe('bad');
  });
  it('speed alone never matters for a clean landing', () => expect(L({ speed: 26, impact: 2 }).quality).toBe('clean'));
  it('slow roll-in ignores yaw', () => expect(L({ speed: 1, yawErrDeg: 90 }).quality).toBe('clean'));
});
