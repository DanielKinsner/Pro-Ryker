// Semantic game events. Scoring, comedy, audio, replay and goals all *observe* these;
// none of them are allowed to move physics bodies in response.

export type LandingQuality = 'clean' | 'sketchy' | 'bad' | 'slam';

export interface GameEvents {
  run_start: { mode: 'career' | 'free' | 'practice' };
  run_reset: {};
  run_end: { score: number };
  airborne: { vert: boolean; speed: number };
  ollie: { charge: number };
  trick_started: { id: string; name: string; kind: 'flip' | 'grab' | 'special' };
  trick_completed: { id: string; name: string; points: number; kind: 'flip' | 'grab' | 'special' | 'spin' };
  landed: { quality: LandingQuality; airTime: number; fakie: boolean; impact: number; reason: string };
  grind_start: { rail: string; kind: string };
  grind_end: { rail: string; kind: string; distance: number; fellOff: boolean };
  manual_start: { nose: boolean };
  manual_end: { nose: boolean; distance: number; loopedOut: boolean; slammed: boolean };
  revert: {};
  powerslide: {};
  rider_state: { from: string; to: string };
  hang_entered: { hands: number; speed: number; cause: string };
  grip_lost: { handsLeft: number };
  rider_recovered: { fromOneHand: boolean; dragMetres: number };
  rider_detached: { speed: number; cause: string; vehicleMoving: boolean };
  ragdoll_settled: { distanceFromBike: number };
  empty_bike_settled: { upright: boolean; inParkingBay: boolean };
  helmet_off: {};
  combo_banked: { score: number; tricks: number; multiplier: number; names: string[] };
  combo_lost: { score: number; reason: string };
  gap: { id: string; name: string; points: number };
  /** An easter egg out in the city (explore.ts). `first` = never found on this save before. */
  secret: { id: string; name: string; points: number; first: boolean };
  /** Safety net: something dropped below the world and was put back. */
  fell_off_map: {};
  letter: { letter: string; index: number };
  prop_hit: { kind: string; id: number; speed: number };
  goal_complete: { id: string; name: string };
  special_ready: {};
  impact: { speed: number; where: 'chassis' | 'wheel' | 'rider' };
}

type Handler<K extends keyof GameEvents> = (e: GameEvents[K] & { t: number }) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<any>>>();
  simTime = 0;
  log: { k: keyof GameEvents; e: any }[] = [];

  on<K extends keyof GameEvents>(k: K, h: Handler<K>) {
    let s = this.handlers.get(k);
    if (!s) this.handlers.set(k, (s = new Set()));
    s.add(h);
    return () => s!.delete(h);
  }

  emit<K extends keyof GameEvents>(k: K, e: GameEvents[K]) {
    const ev = { ...e, t: this.simTime };
    this.log.push({ k, e: ev });
    if (this.log.length > 400) this.log.shift();
    const s = this.handlers.get(k);
    if (s) for (const h of s) h(ev);
  }
}
