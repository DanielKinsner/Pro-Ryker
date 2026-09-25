import type { Cheats } from '../core/save';

// The "MUNICIPAL LIABILITY" goal list (THPS-style, persistent across runs).

export interface GoalDef {
  id: string;
  name: string;
  desc: string;
}

export const GOALS: GoalDef[] = [
  { id: 'score1', name: 'HIGH SCORE', desc: 'Score 15,000 in one run' },
  { id: 'score2', name: 'PRO SCORE', desc: 'Score 40,000 in one run' },
  { id: 'score3', name: 'SICK SCORE', desc: 'Score 100,000 in one run' },
  { id: 'letters', name: 'R-Y-K-E-R', desc: 'Collect the letters R, Y, K, E, R' },
  { id: 'cones', name: 'CONE ZONE', desc: 'Knock over 5 traffic cones in one run' },
  { id: 'reenact', name: 'HISTORICAL REENACTMENT', desc: 'Get dragged 20 m and haul yourself back on' },
  { id: 'roof', name: 'ROOF ACCESS', desc: 'Land on the pavilion roof' },
  { id: 'planter', name: 'MIND THE PLANTER', desc: 'Clear the planter gap' },
  { id: 'stillcounts', name: 'STILL COUNTS', desc: 'Bank a 10,000-point combo with a Face Manual in it' },
  { id: 'tape', name: 'THE SECRET TAPE', desc: 'Find the tape. It is not somewhere sensible.' },
];

/** Cheats unlocked by number of goals completed (and the tape). */
export const CHEAT_UNLOCKS: { at: number; cheat: keyof Cheats; name: string; desc: string }[] = [
  { at: 2, cheat: 'bigHead', name: 'BIG HEAD MODE', desc: 'A classic. His helmet had to be special-ordered.' },
  { at: 4, cheat: 'moonGravity', name: 'MOON GRAVITY', desc: 'The Ryker was always meant to leave Earth.' },
  { at: 6, cheat: 'perfectBalance', name: 'PERFECT BALANCE', desc: 'Manuals and grinds forever. Integrity optional.' },
  { at: 8, cheat: 'slomo', name: 'SLO-MO AIR', desc: 'Every jump is the replay.' },
  { at: 10, cheat: 'slingmodsParts', name: 'SLINGMODS PARTS', desc: 'Elka shocks, performance exhaust, mod body. Looks faster standing still.' },
  { at: 10, cheat: 'specialAlways', name: 'ALWAYS SPECIAL', desc: 'Special meter permanently full. You earned it. Probably.' },
];

export const TAPE_POS = { x: 61.5, y: 3.6, z: -9 };
