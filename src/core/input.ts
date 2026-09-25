// Keyboard + gamepad → game actions. Sampled once per fixed tick.
// Edges ("pressed this tick") are counted between ticks so quick taps are never lost.

export type Dir = 'up' | 'down' | 'left' | 'right' | 'none';
export type Btn = 'ollie' | 'flip' | 'grab' | 'grind' | 'revert' | 'restart' | 'pause' | 'letgo' | 'confirm' | 'back' | 'horn';

const KEYMAP: Record<string, Btn | 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'ollie',
  KeyJ: 'flip',
  KeyK: 'grab',
  KeyL: 'grind',
  ShiftLeft: 'revert',
  ShiftRight: 'revert',
  KeyR: 'restart',
  Escape: 'pause',
  KeyP: 'pause',
  KeyX: 'letgo',
  Enter: 'confirm',
  Backspace: 'back',
  KeyH: 'horn',
};

export interface InputFrame {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 left .. 1 right
  pitch: number; // -1 (S/back) .. 1 (W/forward)
  held: Record<Btn, boolean>;
  pressed: Record<Btn, number>; // edge count since last tick
  released: Record<Btn, number>;
  dir: Dir; // current held direction (dominant)
  /** Direction taps within the last ~0.35s, newest last (for special combos like ↑↓+J). */
  recentDirs: Dir[];
  device: 'keyboard' | 'gamepad';
}

const BTNS: Btn[] = ['ollie', 'flip', 'grab', 'grind', 'revert', 'restart', 'pause', 'letgo', 'confirm', 'back', 'horn'];
const zero = () => Object.fromEntries(BTNS.map((b) => [b, 0])) as Record<Btn, number>;
const off = () => Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;

export class Input {
  private keys = new Set<string>();
  private kHeld = off();
  private pressedCount = zero();
  private releasedCount = zero();
  private dirTaps: { d: Dir; t: number }[] = [];
  private padPrev: boolean[] = [];
  private padBtnHeld = off();
  device: 'keyboard' | 'gamepad' = 'keyboard';
  enabled = true;
  /** UI listeners (menus) get raw button presses too. */
  onPress: ((b: Btn | 'up' | 'down' | 'left' | 'right') => void) | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.key(e, true));
    target.addEventListener('keyup', (e) => this.key(e, false));
    target.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  private key(e: KeyboardEvent, down: boolean) {
    const a = KEYMAP[e.code];
    if (!a) return;
    // Never steal browser shortcuts.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    this.device = 'keyboard';
    if (down) {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edge(a, true);
    } else {
      this.keys.delete(e.code);
      this.edge(a, false);
    }
  }

  private edge(a: Btn | 'up' | 'down' | 'left' | 'right', down: boolean) {
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
      if (down) {
        this.dirTaps.push({ d: a, t: performance.now() });
        if (this.dirTaps.length > 6) this.dirTaps.shift();
        this.onPress?.(a);
      }
      return;
    }
    if (down) {
      this.pressedCount[a]++;
      this.onPress?.(a);
    } else this.releasedCount[a]++;
  }

  releaseAll() {
    this.keys.clear();
    for (const b of BTNS) {
      if (this.kHeld[b] || this.padBtnHeld[b]) this.releasedCount[b]++;
      this.padBtnHeld[b] = false;
    }
  }

  private kd(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  sample(): InputFrame {
    let up = this.kd('KeyW', 'ArrowUp') ? 1 : 0;
    let down = this.kd('KeyS', 'ArrowDown') ? 1 : 0;
    let left = this.kd('KeyA', 'ArrowLeft') ? 1 : 0;
    let right = this.kd('KeyD', 'ArrowRight') ? 1 : 0;
    const held = off();
    for (const [code, a] of Object.entries(KEYMAP)) {
      if (this.keys.has(code) && a in held) held[a as Btn] = true;
    }
    let throttle = up;
    let brake = down;
    let steer = right - left;
    let pitch = up - down;

    // Gamepad (standard mapping)
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const lx = dz(p.axes[0] ?? 0);
      const ly = dz(p.axes[1] ?? 0);
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      const any = Math.abs(lx) + Math.abs(ly) + rt + lt + p.buttons.reduce((s, b) => s + (b.pressed ? 1 : 0), 0);
      if (any > 0.15) this.device = 'gamepad';
      const dUp = p.buttons[12]?.pressed ? 1 : 0;
      const dDown = p.buttons[13]?.pressed ? 1 : 0;
      const dLeft = p.buttons[14]?.pressed ? 1 : 0;
      const dRight = p.buttons[15]?.pressed ? 1 : 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      steer = clamp(steer + lx + dRight - dLeft, -1, 1);
      pitch = clamp(pitch - ly + dUp - dDown, -1, 1);
      up = Math.max(up, ly < -0.5 ? 1 : 0, dUp);
      down = Math.max(down, ly > 0.5 ? 1 : 0, dDown);
      left = Math.max(left, lx < -0.5 ? 1 : 0, dLeft);
      right = Math.max(right, lx > 0.5 ? 1 : 0, dRight);
      const map: [number, Btn][] = [
        [0, 'ollie'],
        [2, 'flip'],
        [1, 'grab'],
        [3, 'grind'],
        [5, 'revert'],
        [8, 'restart'],
        [9, 'pause'],
        [4, 'letgo'],
      ];
      for (const [i, b] of map) {
        const now = !!p.buttons[i]?.pressed;
        const was = !!this.padPrev[i];
        if (now) held[b] = true;
        if (now && !was) {
          this.pressedCount[b]++;
          this.onPress?.(b);
          if (b === 'ollie') this.onPress?.('confirm');
        }
        if (!now && was) this.releasedCount[b]++;
        this.padBtnHeld[b] = now;
      }
      // Stick flicks count as direction taps for special combos.
      for (const [i, d, v] of [
        [12, 'up', ly < -0.6],
        [13, 'down', ly > 0.6],
        [14, 'left', lx < -0.6],
        [15, 'right', lx > 0.6],
      ] as [number, Dir, boolean][]) {
        const now = v || !!p.buttons[i]?.pressed;
        const key = 20 + i;
        if (now && !this.padPrev[key]) {
          this.dirTaps.push({ d, t: performance.now() });
          this.onPress?.(d as 'up');
        }
        this.padPrev[key] = now;
      }
      p.buttons.forEach((b, i) => (this.padPrev[i] = b.pressed));
      break; // first connected pad only
    }

    const now = performance.now();
    this.dirTaps = this.dirTaps.filter((t) => now - t.t < 380);
    let dir: Dir = 'none';
    const ax = right - left;
    const ay = up - down;
    if (Math.abs(ax) > 0 || Math.abs(ay) > 0) dir = Math.abs(ay) >= Math.abs(ax) ? (ay > 0 ? 'up' : 'down') : ax > 0 ? 'right' : 'left';

    this.kHeld = held;
    const frame: InputFrame = {
      throttle: this.enabled ? throttle : 0,
      brake: this.enabled ? brake : 0,
      steer: this.enabled ? steer : 0,
      pitch: this.enabled ? pitch : 0,
      held: this.enabled ? held : off(),
      pressed: this.enabled ? this.pressedCount : zero(),
      released: this.releasedCount,
      dir: this.enabled ? dir : 'none',
      recentDirs: this.dirTaps.map((t) => t.d),
      device: this.device,
    };
    this.pressedCount = zero();
    this.releasedCount = zero();
    return frame;
  }

  consumeDirTaps() {
    this.dirTaps = [];
  }
}

function dz(v: number) {
  const d = 0.16;
  if (Math.abs(v) < d) return 0;
  return (Math.sign(v) * (Math.abs(v) - d)) / (1 - d);
}
export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
