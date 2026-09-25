import type { Game } from './game';
import type { InputFrame } from '../core/input';

// Short lessons use the normal park, controls and physics. Events only record success;
// repositioning and the clearly announced practice hang happen between physics steps.
export class FirstRide {
  active = false;
  lesson = 0;
  private elapsed = 0;
  private travelled = 0;
  private drove = false;
  private jumped = false;
  private flipped = false;
  private landedFlip = false;
  private recovered = false;
  private hangStarted = false;
  private passed = false;
  private feedback = 0;
  private failed = false;

  constructor(private game: Game, private onComplete: () => void) {
    const ev = game.events;
    ev.on('ollie', () => {
      if (this.listening && (this.lesson === 1 || this.lesson === 2)) this.jumped = true;
    });
    ev.on('trick_completed', (e) => {
      if (this.listening && this.lesson === 2 && this.jumped && e.kind === 'flip') this.flipped = true;
    });
    ev.on('landed', (e) => {
      if (!this.listening || !this.jumped || e.airTime < 0.25) return;
      if (e.quality !== 'clean' && e.quality !== 'sketchy') {
        this.clearAttempt();
        return;
      }
      if (this.lesson === 1) this.pass();
      if (this.lesson === 2 && this.flipped) this.landedFlip = true;
      this.jumped = false;
    });
    ev.on('combo_banked', () => {
      if (this.listening && this.lesson === 2 && this.landedFlip) this.pass();
    });
    ev.on('combo_lost', () => this.clearAttempt());
    ev.on('run_reset', () => this.clearAttempt());
    ev.on('rider_recovered', () => {
      if (this.listening && this.lesson === 3 && this.hangStarted) this.recovered = true;
    });
  }

  private get listening() {
    return this.active && !this.passed && !this.failed;
  }

  start() {
    this.active = true;
    this.lesson = 0;
    this.retry();
  }

  stop() {
    this.active = false;
  }

  private clearAttempt() {
    this.jumped = false;
    this.flipped = false;
    this.landedFlip = false;
  }

  retry() {
    if (!this.active) return;
    this.elapsed = 0;
    this.travelled = 0;
    this.drove = false;
    this.recovered = false;
    this.hangStarted = false;
    this.passed = false;
    this.failed = false;
    this.feedback = 0;
    this.clearAttempt();
    // Open, flat stretch between the long ledge and planter gap.
    this.game.respawn(20, 20, 90);
  }

  private pass() {
    this.passed = true;
    this.feedback = 1.35;
  }

  step(dt: number, f: InputFrame) {
    if (!this.active) return;
    if (f.pressed.restart) {
      this.retry();
      return;
    }
    this.elapsed += dt;
    if (this.passed || this.failed) {
      this.feedback -= dt;
      if (this.feedback > 0) return;
      if (this.failed) this.retry();
      else if (this.lesson < 3) {
        this.lesson++;
        this.retry();
      } else {
        this.stop();
        this.onComplete();
      }
      return;
    }
    if (!this.listening) return;
    const v = this.game.vehicle;
    const r = this.game.rider;
    if (r.state === 'detached' || (r.hanging && this.lesson !== 3)) {
      this.failed = true;
      this.feedback = 1;
      return;
    }
    if (this.lesson === 0) {
      if (f.throttle > 0.2 && v.speed > 2) this.drove = true;
      if (this.drove && v.grounded) this.travelled += v.speed * dt;
      if (this.travelled >= 8 && f.brake > 0.5 && v.speed < 1.5) this.pass();
    } else if (this.lesson === 3) {
      if (!this.hangStarted && this.elapsed >= 2) {
        this.hangStarted = true;
        r.hang('First Ride practice');
      }
      if (this.recovered && r.state === 'seated') this.pass();
    }
  }

  copy(device: 'keyboard' | 'gamepad') {
    const pad = device === 'gamepad';
    const gas = pad ? 'RT' : 'W';
    const brake = pad ? 'LT' : 'S';
    const jump = pad ? 'A' : 'SPACE';
    const flip = pad ? 'X' : 'J';
    const retry = pad ? 'BACK' : 'R';
    const titles = ['ROLL. THEN STOP.', 'YOUR FIRST JUMP', 'MAKE IT A KICKFLIP', 'HOLD ON. STILL COUNTS.'];
    const details = [
      `Hold ${gas} to ride 8 m, then hold ${brake} to stop. ${pad ? 'Left stick' : 'A / D'} steers.`,
      `Stay still. Hold ${jump} for a second, then release to jump. Land on your wheels.`,
      `Hold ${jump} for a second, release, then tap ${flip} in the air without a direction. Land and let the combo bank.`,
      `Practice hang starts in a moment. Hold ${brake} and tap ${jump} three times to climb back on.`,
    ];
    let detail = details[this.lesson];
    let status = this.lesson === 0
      ? `${Math.min(8, Math.floor(this.travelled))} / 8 m${this.travelled >= 8 ? ' — brake to a stop' : ' · no timer'}`
      : `${retry} retries this lesson · take your time`;
    if (this.lesson === 3 && this.hangStarted) {
      detail = `Hold ${brake} + tap ${jump}. His weight is on the throttle!`;
      status = this.recovered ? 'Climbing back on…' : 'Brake, then three quick taps.';
    }
    if (this.passed) {
      status = ['Nice stop. Next: a jump.', 'Wheels down. Next: a flip.', 'Combo banked. Next: the rescue.', 'Back in the seat. You saved the combo.'][this.lesson];
    } else if (this.failed) status = 'That one got away. Setting you up to try again…';
    return { title: titles[this.lesson], detail, status, success: this.passed };
  }
}
