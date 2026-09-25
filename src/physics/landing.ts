import { LANDING } from '../config/tuning';
import type { LandingQuality } from '../core/events';

export interface LandingInput {
  /** Vehicle up · surface normal. */
  upDot: number;
  /** Angle between vehicle forward and travel direction in the surface plane, degrees 0..180. */
  yawErrDeg: number;
  /** Speed into the surface (m/s, positive = hitting it). */
  impact: number;
  /** A flip trick still mid-rotation. */
  trickUnfinished: boolean;
  /** Seconds since the grab was released (Infinity if none this air). */
  grabReleasedAgo: number;
  /** Grab currently held at touchdown. */
  grabHeld: 'none' | 'hands' | 'legs' | 'body';
  /** Travel speed along the surface. */
  speed: number;
}

export interface LandingResult {
  quality: LandingQuality;
  fakie: boolean;
  reason: string;
  strain: number; // 0..1+ added to rider strain
}

const cosd = (d: number) => Math.cos((d * Math.PI) / 180);

/**
 * Judge a touchdown against the *real* surface normal (a correct landing on a transition
 * is safer than the same speed into flat). Pure function so the rules are testable.
 */
export function classifyLanding(i: LandingInput): LandingResult {
  const slow = i.speed < 2.5;
  // Yaw: sideways is bad; fully backwards is a legit fakie landing.
  const fakie = !slow && i.yawErrDeg >= LANDING.fakieYawDeg;
  const yaw = fakie ? 180 - i.yawErrDeg : slow ? 0 : i.yawErrDeg;

  if (i.upDot < cosd(LANDING.badUpDeg)) {
    return { quality: 'slam', fakie: false, reason: i.upDot < 0 ? 'landed upside down' : 'landed on its side', strain: 2 };
  }
  if (i.impact > LANDING.slamImpact && i.upDot < cosd(LANDING.cleanUpDeg)) {
    return { quality: 'slam', fakie: false, reason: 'hit way too hard', strain: 2 };
  }
  if (i.grabHeld === 'hands') {
    return { quality: 'slam', fakie, reason: 'landed with no hands on the bars', strain: 2 };
  }
  if (i.grabHeld === 'legs' || i.grabHeld === 'body') {
    return { quality: 'bad', fakie, reason: 'landed still in the grab', strain: 0.95 };
  }

  let score = 0; // 0 clean .. 1 sketchy .. 2 bad
  let reason = 'clean';
  if (i.upDot < cosd(LANDING.sketchyUpDeg)) {
    score = Math.max(score, 2);
    reason = 'landed tilted';
  } else if (i.upDot < cosd(LANDING.cleanUpDeg)) {
    score = Math.max(score, 1);
    reason = 'landed a bit tilted';
  }
  if (yaw > LANDING.sketchyYawDeg) {
    score = Math.max(score, 2);
    reason = 'landed sideways';
  } else if (yaw > LANDING.cleanYawDeg) {
    score = Math.max(score, 1);
    if (reason === 'clean') reason = 'landed crooked';
  }
  if (i.trickUnfinished) {
    score = Math.max(score, 1);
    if (reason === 'clean') reason = 'trick not finished';
  }
  if (i.grabReleasedAgo < LANDING.grabReleaseGrace) {
    score = Math.max(score, 1);
    if (reason === 'clean') reason = 'let go of the grab late';
  }
  // Big impact makes everything one step worse.
  if (i.impact > LANDING.slamImpact * 0.72 && score > 0) score = Math.min(2, score + 1);

  const quality: LandingQuality = score === 0 ? 'clean' : score === 1 ? 'sketchy' : 'bad';
  const strain = quality === 'clean' ? 0.04 : quality === 'sketchy' ? 0.42 + Math.min(0.2, i.impact * 0.01) : 0.9;
  return { quality, fakie, reason, strain };
}
