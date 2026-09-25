import type { AudioEngine } from './audio';
import type { Game } from '../game/game';
import { LINES, BARKS, RIDER_BARKS, VOICES, lineFile, lineText, type Line } from '../data/comedy';
import { SFX_IDS } from './sfxList';

// Game state + truthful events → sound. Physics tells the joke first; sound and voice only react
// to what actually happened (never the other way round).

const SPEAKER_NAME: Record<string, string> = {
  witness: 'THE WITNESS',
  kid: 'SKATER KID',
  employee: 'PARK EMPLOYEE',
  filmer: 'PHONE FILMER',
  rider: 'THE RIDER',
};

export class SoundDirector {
  private rpm = 1300;
  private lastGrindKind = '';
  constructor(
    private audio: AudioEngine,
    private game: Game,
  ) {
    const ev = game.events;
    const a = audio;
    ev.on('ollie', (e) => a.play('sfx/ollie.mp3', { vol: 0.7 + e.charge * 0.3, rate: 1.05 - e.charge * 0.1 }));
    ev.on('trick_started', (e) => {
      if (e.kind !== 'grab') a.play('sfx/whoosh.mp3', { vol: 0.55, rate: 0.9 + Math.random() * 0.2 });
    });
    ev.on('landed', (e) => {
      if (e.quality === 'slam') return;
      const hard = e.impact > 7 || e.quality !== 'clean';
      a.play(hard ? 'sfx/land-hard.mp3' : 'sfx/land-soft.mp3', { vol: Math.min(1, 0.35 + e.impact * 0.07) });
      if (e.quality === 'clean' && e.airTime > 1.4) a.play('sfx/crowd-ooh.mp3', { vol: 0.5, delay: 0.1 });
      if (e.quality === 'bad') a.play('sfx/glove-creak.mp3', { vol: 0.9 });
    });
    ev.on('hang_entered', () => {
      a.play('sfx/glove-creak.mp3', { vol: 0.9 });
      a.play('sfx/crowd-gasp.mp3', { vol: 0.5, delay: 0.15 });
    });
    ev.on('rider_recovered', () => {
      a.play('sfx/crowd-cheer.mp3', { vol: 0.45 });
      a.play('sfx/board-tap.mp3', { vol: 0.7, delay: 0.5 });
    });
    ev.on('rider_detached', (e) => {
      a.play('sfx/slam.mp3', { vol: 0.9 });
      a.play('sfx/body-thud-1.mp3', { vol: 0.9, delay: 0.12 });
      a.play('sfx/body-thud-2.mp3', { vol: 0.7, delay: 0.45 });
      if (e.vehicleMoving && e.speed > 8) a.play('sfx/record-scratch.mp3', { vol: 0.55, delay: 0.05 });
      a.play('sfx/crowd-laugh.mp3', { vol: 0.35, delay: 1.1 });
    });
    ev.on('helmet_off', () => a.play('sfx/helmet-bounce.mp3', { vol: 0.8, delay: 0.35 }));
    ev.on('prop_hit', (e) => {
      const file = e.kind === 'cone' || e.kind === 'barrier' || e.kind === 'cutout' ? 'cone-hit' : e.kind === 'bin' ? 'bin-hit' : 'chair-clink';
      a.play(`sfx/${file}.mp3`, { vol: Math.min(1, 0.4 + e.speed * 0.06), rate: 0.92 + Math.random() * 0.16 });
    });
    ev.on('letter', () => a.play('sfx/letter.mp3', { vol: 0.9 }));
    ev.on('goal_complete', () => a.play('sfx/goal.mp3', { vol: 0.85 }));
    ev.on('combo_banked', (e) => {
      if (e.score >= 400) a.play('sfx/combo.mp3', { vol: Math.min(1, 0.5 + e.score / 20000) });
      if (e.score >= 6000) a.play('sfx/crowd-cheer.mp3', { vol: Math.min(0.9, 0.4 + e.score / 40000), delay: 0.1 });
      else if (e.score >= 2500) a.play('sfx/crowd-ooh.mp3', { vol: 0.45, delay: 0.1 });
    });
    ev.on('combo_lost', (e) => {
      if (e.score > 1500) a.play('sfx/crowd-gasp.mp3', { vol: 0.45 });
    });
    ev.on('special_ready', () => a.play('sfx/special.mp3', { vol: 0.7 }));
    ev.on('grind_start', (e) => (this.lastGrindKind = e.kind));
    ev.on('run_reset', () => this.audio.stopVoice());
  }

  preload() {
    return this.audio.preload(SFX_IDS.map((id) => [`sfx/${id}.mp3`, id.startsWith('engine') ? 'engine' : LOOPS.has(id) ? 'loop' : id.startsWith('ui') ? 'ui' : 'oneshot'] as [string, 'engine' | 'loop' | 'oneshot' | 'ui']));
  }

  /** Continuous beds, called every render frame. */
  update(dt: number, inRun: boolean) {
    const g = this.game;
    const v = g.vehicle;
    const r = g.rider;
    const a = this.audio;
    if (!inRun) {
      a.engine(1300, 0, 0.35);
      a.loop('sfx/ambience.mp3', 0.5);
      for (const l of ['wind', 'tire-squeal', 'grind-metal', 'grind-concrete', 'drag-scrape']) a.loop(`sfx/${l}.mp3`, 0);
      return;
    }
    // Engine: grounded → vehicle's own RPM estimate; airborne → revs flare with the throttle.
    const thr = Math.max(v.ctl.throttle, v.ctl.forcedThrottle);
    const target = v.grounded ? v.rpm : 1500 + thr * 6800;
    this.rpm += (target - this.rpm) * Math.min(1, dt * (v.grounded ? 8 : 5));
    a.engine(this.rpm, thr, 1);
    const speed = v.speed;
    a.loop('sfx/wind.mp3', Math.min(0.7, Math.max(0, (speed - 7) / 22) * 0.55 + (v.grounded ? 0 : 0.2)), 0.85 + Math.min(0.4, speed / 60));
    const squeal = v.grounded && !g.tricks.grind && v.slip > 3.5 ? Math.min(0.55, (v.slip - 3.5) / 7) : 0;
    a.loop('sfx/tire-squeal.mp3', squeal, 0.95 + Math.min(0.15, v.slip / 60));
    const grinding = !!g.tricks.grind;
    const metal = grinding && !/LEDGE|BENCH/.test(this.lastGrindKind);
    a.loop('sfx/grind-metal.mp3', grinding && metal ? 0.65 : 0, 0.85 + Math.min(0.35, speed / 40));
    a.loop('sfx/grind-concrete.mp3', grinding && !metal ? 0.7 : 0, 0.85 + Math.min(0.35, speed / 40));
    let drag = 0;
    if (r.state === 'hanging' && speed > 1.5) drag = Math.min(0.9, speed / 14);
    else if (r.state === 'detached' && r.ragdoll.active) drag = Math.min(0.7, Math.max(0, r.ragdoll.maxSpeed() - 2) / 12);
    a.loop('sfx/drag-scrape.mp3', drag, 0.9 + Math.min(0.3, speed / 40));
    a.loop('sfx/ambience.mp3', 0.45);
  }
}

const LOOPS = new Set(['wind', 'tire-squeal', 'grind-metal', 'grind-concrete', 'drag-scrape', 'ambience']);

// ---------------------------------------------------------------------------- comedy

export class ComedyDirector {
  private usedThisRun = new Set<string>();
  private lastUsed = new Map<string, number>();
  private spoken = 0;
  private lastSpectator = -99;
  private lastRider = -99;
  private recentBails: number[] = [];
  private sessionFirstFlip = false;
  private sessionFirstRun = false;
  private hangLongSaid = false;
  private speedingSaid = false;
  private conesSaid = false;
  language: 'clean' | 'salty' = 'salty';
  onCaption: ((speaker: string, text: string) => void) | null = null;
  enabled = true;

  constructor(
    private audio: AudioEngine,
    private game: Game,
  ) {
    const ev = game.events;
    ev.on('run_start', () => {
      this.usedThisRun.clear();
      this.spoken = 0;
      if (!this.sessionFirstRun) {
        this.sessionFirstRun = true;
        this.bark('run_start', 1.5);
      }
    });
    ev.on('run_reset', () => {
      this.hangLongSaid = false;
      this.speedingSaid = false;
    });
    ev.on('trick_completed', (e) => {
      if (e.kind === 'flip' && (e.id === 'kickflip' || e.id === 'heelflip') && !this.sessionFirstFlip) {
        this.sessionFirstFlip = true;
        this.bark('first_flip');
      } else if (e.kind === 'flip' && (e.id === 'backflip' || e.id === 'frontflip')) this.bark('backflip');
      else if (e.kind === 'special') this.bark('special');
    });
    ev.on('trick_started', (e) => {
      if (e.id === 'selfie') this.bark('selfie');
    });
    ev.on('landed', (e) => {
      if (e.quality === 'clean' && e.airTime > 1.7) this.bark('big_air');
      else if (e.quality === 'clean' && game.tricks.combo.active) this.bark('clean_trick_land');
      if (e.quality === 'sketchy') this.riderSay('sketchy');
      if (e.quality === 'clean' && e.airTime > 1.9) this.riderSay('big_air', 0.35);
    });
    ev.on('grind_start', (e) => this.bark(/BENCH/.test(e.kind) ? 'bench' : 'grind'));
    ev.on('manual_start', (e) => this.bark(e.nose ? 'nose_manual' : 'rear_manual'));
    ev.on('combo_banked', (e) => {
      if (e.score >= 8000) this.bark('big_combo');
    });
    ev.on('special_ready', () => this.bark('special_ready'));
    ev.on('hang_entered', () => {
      this.hangLongSaid = false;
      this.speedingSaid = false;
      this.riderSay('hang');
      this.bark('hang', 0.35);
    });
    ev.on('grip_lost', () => this.bark('grip_lost'));
    ev.on('rider_recovered', (e) => {
      this.riderSay('recovered');
      this.bark(e.fromOneHand ? 'recovered_one_hand' : 'recovered', 0.9);
    });
    ev.on('rider_detached', (e) => {
      const now = performance.now();
      this.recentBails = this.recentBails.filter((t) => now - t < 30000);
      this.recentBails.push(now);
      this.riderSay('detached', 1, 0.7);
      this.bark(e.vehicleMoving ? 'detached_moving' : 'detached', 1.0);
    });
    ev.on('helmet_off', () => this.bark('helmet', 1.4));
    ev.on('ragdoll_settled', () => this.bark('settled'));
    ev.on('empty_bike_settled', (e) => {
      if (e.inParkingBay && e.upright) this.bark('valet');
      else this.bark('empty_settled');
    });
    ev.on('prop_hit', (e) => {
      if (e.kind === 'cutout') this.bark('cutout', 0.4);
      if (e.kind === 'cone' && game.conesDown.size >= 3 && !this.conesSaid) {
        this.conesSaid = true;
        this.bark('cones');
      }
    });
  }

  /** Polled situations (sustained states). */
  update() {
    const g = this.game;
    const r = g.rider;
    if (r.state === 'hanging') {
      if (!this.hangLongSaid && r.hangTime > 2.6 && g.vehicle.speed > 5) {
        this.hangLongSaid = true;
        this.bark('hang_long');
      }
      if (!this.speedingSaid && g.vehicle.speed > 13 && r.hangTime > 0.8) {
        this.speedingSaid = true;
        this.riderSay('hang_speeding');
      }
    }
    if (g.bikeLandedAlone) {
      g.bikeLandedAlone = false;
      this.bark('empty_landed');
    }
  }

  private pick(ids: string[]): Line | null {
    const fresh = ids.filter((id) => !this.usedThisRun.has(id));
    if (!fresh.length) return null;
    fresh.sort((a, b) => (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0));
    return LINES.find((l) => l.id === fresh[0]) ?? null;
  }

  bark(event: string, delaySec = 0) {
    if (!this.enabled) return;
    const b = BARKS.find((x) => x.event === event);
    if (!b) return;
    const t = performance.now() / 1000;
    const busyFail = this.recentBails.length >= 3 ? 0.5 : 1; // dial it down after repeated early failures
    if (b.chance !== undefined && Math.random() > b.chance * busyFail) return;
    if (b.chance === undefined && busyFail < 1 && Math.random() > 0.6) return;
    const gap = b.priority >= 70 ? 4 : 9;
    if (t - this.lastSpectator < gap) return;
    const budget = this.game.mode === 'career' ? 8 : 10;
    if (this.spoken >= budget && b.priority < 80) return;
    const line = this.pick(b.lines);
    if (!line) return;
    this.lastSpectator = t + delaySec;
    const go = () => {
      if (performance.now() < this.audio.voiceBusyUntil && b.priority < 75) return;
      this.speak(line);
      this.spoken++;
    };
    if (delaySec > 0) setTimeout(go, delaySec * 1000);
    else go();
  }

  riderSay(kind: string, chance = 1, delaySec = 0) {
    if (!this.enabled || Math.random() > chance) return;
    const t = performance.now() / 1000;
    if (t - this.lastRider < 3.5) return;
    const ids = RIDER_BARKS[kind];
    if (!ids) return;
    const line = this.pick(ids) ?? LINES.find((l) => l.id === ids[Math.floor(Math.random() * ids.length)]) ?? null;
    if (!line) return;
    this.lastRider = t;
    const go = () => {
      if (performance.now() < this.audio.voiceBusyUntil) return;
      this.speak(line);
    };
    if (delaySec > 0) setTimeout(go, delaySec * 1000);
    else go();
  }

  private speak(line: Line) {
    this.usedThisRun.add(line.id);
    this.lastUsed.set(line.id, performance.now());
    this.audio.say(lineFile(line, this.language), line.speaker === 'rider' ? 1 : 0.95);
    this.onCaption?.(SPEAKER_NAME[line.speaker] ?? VOICES[line.speaker].name, lineText(line, this.language));
  }

  preload() {
    const files = new Set<string>();
    for (const l of LINES) {
      files.add(lineFile(l, 'clean'));
      if (l.salty) files.add(lineFile(l, 'salty'));
    }
    return this.audio.preload([...files].map((f) => [f, 'voice']));
  }
}
