import type { Game } from '../game/game';
import { LETTERS } from '../park/layout';
import './hud.css';

// THPS-flavoured HUD. DOM, updated per frame only where values changed.

const h = (tag: string, cls: string, parent?: HTMLElement, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
};

export class Hud {
  root: HTMLElement;
  guidance: HTMLElement;
  private score: HTMLElement;
  private special: HTMLElement;
  private specialFill: HTMLElement;
  private timer: HTMLElement;
  private letters: HTMLElement[] = [];
  private comboNames: HTMLElement;
  private comboTotal: HTMLElement;
  private pop: HTMLElement;
  private balance: HTMLElement;
  private needle: HTMLElement;
  private hang: HTMLElement;
  private gripFill: HTMLElement;
  private haulFill: HTMLElement;
  private hangWarn: HTMLElement;
  private stateTag: HTMLElement;
  private toasts: HTMLElement;
  private bailMsg: HTMLElement;
  private controls: HTMLElement;
  private last: Record<string, string> = {};
  private popSeen = '';

  constructor(parent: HTMLElement) {
    this.root = h('div', 'hud', parent);
    const top = h('div', 'hud-top', this.root);
    const tl = h('div', 'hud-tl', top);
    this.score = h('div', 'hud-score', tl, '0');
    this.special = h('div', 'hud-special', tl);
    this.specialFill = h('div', 'hud-special-fill', this.special);
    h('div', 'hud-special-label', this.special, 'SPECIAL');
    this.timer = h('div', 'hud-timer', top, '2:00');
    const tr = h('div', 'hud-letters', top);
    for (const l of LETTERS) this.letters.push(h('span', 'hud-letter', tr, l.letter));
    const bottom = h('div', 'hud-bottom', this.root);
    this.bailMsg = h('div', 'hud-bail', bottom);
    const bc = h('div', 'hud-combo', bottom);
    this.comboNames = h('div', 'hud-combo-names', bc);
    this.comboTotal = h('div', 'hud-combo-total', bc);
    this.pop = h('div', 'hud-pop', this.root);
    this.balance = h('div', 'hud-balance', bottom);
    h('div', 'hud-balance-arc', this.balance);
    this.needle = h('div', 'hud-needle', this.balance);
    this.guidance = h('div', 'hud-guidance', this.root);
    this.hang = h('div', 'hud-hang', this.guidance);
    h('div', 'hud-hang-title', this.hang, 'HANG ON');
    const gb = h('div', 'hud-bar', this.hang);
    h('span', 'hud-bar-label', gb, 'GRIP');
    this.gripFill = h('div', 'hud-bar-fill grip', gb);
    const hb = h('div', 'hud-bar', this.hang);
    h('span', 'hud-bar-label', hb, 'HAUL');
    this.haulFill = h('div', 'hud-bar-fill haul', hb);
    h('div', 'hud-hang-hint', this.hang, 'BRAKE + MASH SPACE TO PULL YOURSELF BACK ON');
    this.hangWarn = h('div', 'hud-hang-warn', this.hang, 'HIS WEIGHT IS ON THE THROTTLE — BRAKE!');
    const footer = h('div', 'hud-footer', bottom);
    this.stateTag = h('div', 'hud-state', footer);
    this.toasts = h('div', 'hud-toasts', this.root);
    this.controls = h('div', 'hud-controls', footer);
    this.setControls('keyboard');
  }

  private device: 'keyboard' | 'gamepad' | '' = '';
  private context = '';

  /** Show key or pad glyphs depending on what the player last touched. */
  private setControls(device: 'keyboard' | 'gamepad', context = 'ground') {
    if (device === this.device && context === this.context) return;
    this.device = device;
    this.context = context;
    const pad = device === 'gamepad';
    const help = `<b>${pad ? 'START' : 'ESC'}</b> controls`;
    this.controls.innerHTML = context === 'air'
      ? `<b>${pad ? 'X' : 'J'}</b> flip · <b>${pad ? 'B' : 'K'}</b> grab (release before landing) · ${help}`
      : context === 'manual' || context === 'grind'
        ? `<b>${pad ? (context === 'manual' ? 'STICK ↑↓' : 'STICK ←→') : (context === 'manual' ? 'W/S' : 'A/D')}</b> balance · <b>${pad ? 'A' : 'SPACE'}</b> hop off · ${help}`
        : `<b>${pad ? 'RT/LT' : 'W/S'}</b> ride · <b>${pad ? 'STICK' : 'A/D'}</b> steer · <b>${pad ? 'A' : 'SPACE'}</b> jump · ${help}`;
    const hang = this.hang.querySelector('.hud-hang-hint');
    if (hang) hang.textContent = device === 'keyboard' ? 'BRAKE + MASH SPACE TO PULL YOURSELF BACK ON' : 'BRAKE (LT) + MASH A TO PULL YOURSELF BACK ON';
  }

  private set(key: string, el: HTMLElement, text: string) {
    if (this.last[key] === text) return;
    this.last[key] = text;
    el.textContent = text;
  }

  private cls(key: string, el: HTMLElement, name: string, on: boolean) {
    const k = `${key}:${name}`;
    const v = on ? '1' : '0';
    if (this.last[k] === v) return;
    this.last[k] = v;
    el.classList.toggle(name, on);
  }

  toast(title: string, sub = '', kind: 'goal' | 'cheat' | 'info' | 'secret' = 'goal') {
    const t = h('div', `hud-toast ${kind}`, this.toasts);
    h('div', 'hud-toast-title', t, title);
    if (sub) h('div', 'hud-toast-sub', t, sub);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  toggleControls() {
    this.controls.classList.toggle('hidden');
  }

  reset() {
    this.pop.className = 'hud-pop';
    this.pop.textContent = '';
    this.popSeen = '';
    this.toasts.replaceChildren();
    this.last = {};
  }

  update(g: Game) {
    this.setControls(g.input.device, g.tricks.manual ? 'manual' : g.tricks.grind ? 'grind' : !g.vehicle.grounded ? 'air' : 'ground');
    this.root.classList.toggle('practice', g.mode === 'practice');
    this.root.classList.toggle('rescue', g.rider.hanging || g.rider.state === 'detached');
    const tr = g.tricks;
    this.set('score', this.score, (tr.score + (g.runOver ? 0 : 0)).toLocaleString());
    const sp = Math.min(1, tr.special);
    this.specialFill.style.transform = `scaleX(${sp.toFixed(3)})`;
    this.cls('sp', this.special, 'ready', tr.specialReady);
    if (g.mode === 'career') {
      const t = Math.max(0, Math.ceil(g.timeLeft));
      this.set('timer', this.timer, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      this.cls('timer', this.timer, 'low', t <= 10);
    } else {
      this.set('timer', this.timer, g.mode === 'practice' ? 'FIRST RIDE' : 'FREE SKATE');
      this.cls('timer', this.timer, 'low', false);
    }
    this.letters.forEach((el, i) => this.cls(`l${i}`, el, 'got', g.lettersTaken.has(i)));

    // Combo string
    const c = tr.combo;
    if (c.active) {
      const names = c.entries.map((e) => e.name);
      const shown = names.length > 3 ? ['…', ...names.slice(-3)] : names;
      this.set('cn', this.comboNames, shown.join(' + '));
      this.set('ct', this.comboTotal, `${c.base.toLocaleString()} × ${c.multiplier}${c.quality < 1 ? '  SKETCHY' : ''}`);
      this.cls('combo', this.comboNames.parentElement!, 'on', true);
    } else {
      this.cls('combo', this.comboNames.parentElement!, 'on', false);
    }

    // Pop text
    const key = `${tr.pop.text}@${tr.pop.kind}`;
    if (tr.pop.t < 0.05 && key !== this.popSeen && tr.pop.text) {
      this.popSeen = key;
      this.pop.textContent = tr.pop.text;
      this.pop.className = `hud-pop ${tr.pop.kind}`;
      void this.pop.offsetWidth;
      this.pop.classList.add('show');
    }
    if (tr.pop.t > 0.05) this.popSeen = '';

    // Balance meter (manual / grind)
    const bal = tr.manual ? tr.manual.balance : tr.grind ? tr.grind.balance : null;
    this.cls('bal', this.balance, 'on', bal !== null);
    if (bal !== null) {
      this.needle.style.transform = `rotate(${Math.max(-1.1, Math.min(1.1, bal)) * 70}deg)`;
      this.cls('bal', this.needle, 'danger', Math.abs(bal) > 0.7);
    }

    // Hanging on
    const r = g.rider;
    this.cls('hang', this.hang, 'on', r.state === 'hanging');
    if (r.state === 'hanging') {
      this.gripFill.style.width = `${Math.max(0, r.grip) * 100}%`;
      this.haulFill.style.width = `${Math.max(0, r.haul) * 100}%`;
      this.cls('hand', this.hang, 'onehand', r.hands === 1);
      this.cls('warn', this.hangWarn, 'flash', g.vehicle.speed > 6);
    }
    const tag = r.state === 'seated' ? 'SEATED' : r.state === 'unsettled' ? 'WOBBLY' : r.state === 'hanging' ? (r.hands === 2 ? 'HANGING ON' : 'ONE HAND') : r.state === 'recovering' ? 'CLIMBING BACK' : 'RIDER DISCONNECTED';
    this.set('state', this.stateTag, tag);
    this.stateTag.dataset.state = r.state;

    // After a bail
    const bail = r.state === 'detached';
    this.cls('bail', this.bailMsg, 'on', bail);
    if (bail) {
      const moving = g.vehicle.speed > 2;
      const retry = g.input.device === 'gamepad' ? 'A TO RETRY' : 'SPACE TO RETRY';
      this.set('bailmsg', this.bailMsg, moving ? `RIDER DISCONNECTED. VEHICLE UNAFFECTED. — ${retry}` : `${r.detachCause ? r.detachCause.toUpperCase() + ' — ' : ''}${retry}`);
    }
  }
}
