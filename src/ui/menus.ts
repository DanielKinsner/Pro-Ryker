import './menus.css';
import type { Game, Mode } from '../game/game';
import { GOALS, CHEAT_UNLOCKS } from '../game/goals';
import type { SaveData, Cheats } from '../core/save';
import { GAPS } from '../park/layout';
import { SECRETS } from '../game/explore';

// Menus: title → main menu → run; pause; results; goals; cheats; options; the original footage.
// Keyboard (arrows/WASD + Enter/Space, Esc/Backspace), gamepad (d-pad/stick + A/B) and mouse.

export interface MenuItem {
  label: string;
  sub?: string;
  disabled?: boolean;
  value?: () => string;
  /** Left/right adjusts (options). */
  adjust?: (dir: -1 | 1) => void;
  action?: () => void;
}

export interface MenuHooks {
  startRun(mode: Mode): void;
  resume(): void;
  restart(): void;
  quitToMenu(): void;
  applySettings(): void;
  applyCheats(): void;
  sfx(name: 'select' | 'back' | 'tick'): void;
  hasFootage(): Promise<boolean>;
  onScreen(name: string): void;
}

/** The real clip on ViralHog's YouTube channel ("Man Wrecks Can-Am at Skatepark || ViralHog"). */
const FOOTAGE_YT = 'ieCOgCEtXfY';

const el = (tag: string, cls = '', parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

export class Menus {
  root: HTMLElement;
  screen = 'none';
  private items: MenuItem[] = [];
  private idx = 0;
  private stack: string[] = [];
  private listEl: HTMLElement | null = null;
  private footageOk = false;

  constructor(
    parent: HTMLElement,
    private game: Game,
    private hooks: MenuHooks,
  ) {
    this.root = el('div', 'menus', parent);
    void hooks.hasFootage().then((ok) => (this.footageOk = ok));
  }

  get open() {
    return this.screen !== 'none';
  }

  private get save(): SaveData {
    return this.game.save;
  }

  // ---------------------------------------------------------------- input

  press(b: string) {
    if (this.screen === 'none') return false;
    if (this.screen === 'title') {
      this.hooks.sfx('select');
      this.show('main');
      return true;
    }
    if (this.screen === 'footage') {
      if (b === 'back' || b === 'pause' || b === 'ollie' || b === 'confirm') this.back();
      return true;
    }
    if (b === 'up') this.move(-1);
    else if (b === 'down') this.move(1);
    else if (b === 'left') this.adjust(-1);
    else if (b === 'right') this.adjust(1);
    else if (b === 'confirm' || b === 'ollie') this.activate();
    else if (b === 'back' || b === 'pause' || b === 'grab') this.back();
    return true;
  }

  private move(d: number) {
    const n = this.items.length;
    if (!n) return;
    let i = this.idx;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!this.items[i].disabled) break;
    }
    if (i !== this.idx) this.hooks.sfx('tick');
    this.idx = i;
    this.highlight();
  }

  private adjust(d: -1 | 1) {
    const it = this.items[this.idx];
    if (it?.adjust) {
      it.adjust(d);
      this.hooks.sfx('tick');
      this.refreshValues();
    }
  }

  private activate() {
    const it = this.items[this.idx];
    if (!it || it.disabled) return;
    this.hooks.sfx('select');
    if (it.adjust && !it.action) it.adjust(1);
    it.action?.();
    this.refreshValues();
  }

  back() {
    this.hooks.sfx('back');
    if (this.screen === 'intro-done') {
      this.hooks.quitToMenu();
      return;
    }
    if (this.screen === 'pause') {
      this.close();
      this.hooks.resume();
      return;
    }
    const prev = this.stack.pop();
    if (prev) this.show(prev, false);
    else if (this.screen !== 'main' && this.screen !== 'results') this.show('main', false);
  }

  close() {
    this.screen = 'none';
    this.root.innerHTML = '';
    this.root.className = 'menus';
    this.stack = [];
    this.hooks.onScreen('none');
  }

  // ---------------------------------------------------------------- screens

  show(name: string, push = true) {
    if (push && this.screen !== 'none' && this.screen !== 'title' && this.screen !== name) this.stack.push(this.screen);
    this.screen = name;
    this.root.innerHTML = '';
    this.root.className = `menus on screen-${name}`;
    this.items = [];
    this.idx = 0;
    this.listEl = null;
    this.hooks.onScreen(name);
    switch (name) {
      case 'title':
        return this.title();
      case 'main':
        return this.main();
      case 'pause':
        return this.pause();
      case 'goals':
        return this.goals();
      case 'cheats':
        return this.cheats();
      case 'options':
        return this.options();
      case 'howto':
        return this.howto();
      case 'intro-done':
        return this.introDone();
      case 'footage':
        return this.footage();
    }
  }

  private panel(title: string, kicker = '') {
    const p = el('div', 'm-panel', this.root);
    if (kicker) el('div', 'm-kicker', p, kicker);
    el('h2', 'm-title', p, title);
    return p;
  }

  private list(parent: HTMLElement, items: MenuItem[]) {
    this.items = items;
    const ul = el('ul', 'm-list', parent);
    this.listEl = ul;
    items.forEach((it, i) => {
      const li = el('li', `m-item${it.disabled ? ' disabled' : ''}`, ul);
      const lab = el('span', 'm-label', li, it.label);
      void lab;
      if (it.value && it.adjust) {
        // Real ◀ ▶ buttons. (They used to be decoration: a click counted by which half of the row it
        // landed on, and both arrows sit on the right half — so ◀ turned the volume *up*.)
        const val = el('span', 'm-value', li);
        const arrow = (glyph: string, d: -1 | 1) =>
          el('span', 'm-arrow', val, glyph).addEventListener('click', (e) => {
            e.stopPropagation();
            if (it.disabled) return;
            this.idx = i;
            this.highlight();
            this.adjust(d);
          });
        arrow('&#9664;', -1);
        el('span', 'm-num', val, it.value());
        arrow('&#9654;', 1);
      } else if (it.value) el('span', 'm-value', li, it.value());
      if (it.sub) el('span', 'm-sub', li, it.sub);
      li.addEventListener('mouseenter', () => {
        if (it.disabled) return;
        if (this.idx !== i) this.hooks.sfx('tick');
        this.idx = i;
        this.highlight();
      });
      li.addEventListener('click', (e) => {
        if (it.disabled) return;
        this.idx = i;
        if (it.adjust) {
          const r = li.getBoundingClientRect();
          this.adjust(e.clientX < r.left + r.width / 2 ? -1 : 1);
        } else this.activate();
      });
    });
    this.idx = Math.max(0, items.findIndex((x) => !x.disabled));
    this.highlight();
  }

  private highlight() {
    if (!this.listEl) return;
    [...this.listEl.children].forEach((c, i) => c.classList.toggle('sel', i === this.idx));
  }

  private refreshValues() {
    if (!this.listEl) return;
    [...this.listEl.children].forEach((c, i) => {
      const v = c.querySelector('.m-num') ?? c.querySelector('.m-value');
      const it = this.items[i];
      if (v && it?.value) v.textContent = it.value();
    });
  }

  private title() {
    const t = el('div', 'm-titlecard', this.root);
    el('div', 'm-sponsor', t, 'SLINGMODS PRESENTS');
    el('h1', 'm-logo', t, '<span>PRO</span><span>RYKER</span>');
    el('div', 'm-tagline', t, 'HOLD ON. IT GETS WORSE.');
    el('div', 'm-press', t, 'PRESS ANY BUTTON');
    const best = this.save.best;
    if (best) el('div', 'm-best', t, `BEST RUN ${best.toLocaleString()}`);
    el('div', 'm-legal', this.root, 'Fictional arcade physics. A Ryker is not a skateboard. Please do not do this.');
  }

  private main() {
    const p = this.panel('MAIN MENU', 'PRO RYKER');
    const done = this.save.goals.length;
    const tapeGot = this.save.goals.includes('tape');
    this.list(p, [
      ...(!this.save.introCompleted && this.save.runs === 0 ? [{ label: 'FIRST RIDE', sub: 'Start here · drive, jump, flip, recover · skip any time', action: () => this.hooks.startRun('practice') }] : []),
      { label: 'CAREER', sub: `2-minute runs · ${done}/${GOALS.length} goals · best ${this.save.best.toLocaleString()}`, action: () => this.hooks.startRun('career') },
      { label: 'FREE SKATE', sub: 'No timer. No consequences. Some consequences.', action: () => this.hooks.startRun('free') },
      ...(this.save.introCompleted || this.save.runs > 0 ? [{ label: 'FIRST RIDE', sub: this.save.introCompleted ? 'Completed · replay the four practice lessons' : 'Four practice lessons · no timer · skip any time', action: () => this.hooks.startRun('practice') }] : []),
      { label: 'GOALS', sub: `${done}/${GOALS.length} complete · gaps ${this.save.gaps.length}/${GAPS.length}`, action: () => this.show('goals') },
      { label: 'CHEATS', sub: `${this.save.cheatsUnlocked.length} unlocked`, action: () => this.show('cheats') },
      { label: 'OPTIONS', action: () => this.show('options') },
      { label: 'HOW TO PLAY', action: () => this.show('howto') },
      {
        label: tapeGot ? 'BASED ON TRUE EVENTS' : '??? ??? ??? ???',
        sub: tapeGot ? 'The original footage.' : 'Find the secret tape.',
        disabled: !tapeGot,
        action: () => this.show('footage'),
      },
    ]);
  }

  private pause() {
    const practice = this.game.mode === 'practice';
    const p = this.panel('PAUSED', practice ? 'FIRST RIDE' : this.game.mode === 'career' ? 'CAREER' : 'FREE SKATE');
    this.list(p, [
      { label: 'RESUME', action: () => (this.close(), this.hooks.resume()) },
      { label: practice ? 'RESTART FIRST RIDE' : 'RESTART RUN', action: () => this.hooks.restart() },
      ...(practice ? [{ label: 'SKIP TO FREE SKATE', action: () => this.hooks.startRun('free') }] : []),
      { label: 'GOALS', action: () => this.show('goals') },
      { label: 'OPTIONS', action: () => this.show('options') },
      { label: 'HOW TO PLAY', action: () => this.show('howto') },
      { label: 'QUIT TO MENU', action: () => this.hooks.quitToMenu() },
    ]);
  }

  private goals() {
    const p = this.panel('GOALS', 'MUNICIPAL LIABILITY');
    const grid = el('div', 'm-goals', p);
    for (const g of GOALS) {
      const got = this.save.goals.includes(g.id);
      const row = el('div', `m-goal${got ? ' got' : ''}`, grid);
      el('span', 'm-check', row, got ? '✓' : '');
      const txt = el('div', 'm-goal-txt', row);
      el('div', 'm-goal-name', txt, g.name);
      el('div', 'm-goal-desc', txt, g.desc);
    }
    el('div', 'm-kicker', p, `GAPS FOUND ${this.save.gaps.length}/${GAPS.length}`);
    const gaps = el('div', 'm-gaps', p);
    for (const g of GAPS) el('span', `m-gap${this.save.gaps.includes(g.id) ? ' got' : ''}`, gaps, this.save.gaps.includes(g.id) ? g.name : '???');
    const found = SECRETS.filter((s) => this.save.secrets.includes(s.id));
    el('div', 'm-kicker', p, `SECRETS FOUND ${found.length}/${SECRETS.length}${found.length ? '' : ' · THERE IS NO FENCE'}`);
    const secrets = el('div', 'm-gaps', p);
    for (const s of SECRETS) el('span', `m-gap${this.save.secrets.includes(s.id) ? ' got' : ''}`, secrets, this.save.secrets.includes(s.id) ? s.name : '???');
    this.list(p, [{ label: 'BACK', action: () => this.back() }]);
  }

  private cheats() {
    const p = this.panel('CHEATS', `${this.save.cheatsUnlocked.length}/${CHEAT_UNLOCKS.length} UNLOCKED`);
    const items: MenuItem[] = CHEAT_UNLOCKS.map((u) => {
      const unlocked = this.save.cheatsUnlocked.includes(u.cheat);
      return {
        label: unlocked ? u.name : '???',
        sub: unlocked ? u.desc : `Complete ${u.at} goals`,
        disabled: !unlocked,
        value: () => (unlocked ? (this.save.cheats[u.cheat as keyof Cheats] ? 'ON' : 'OFF') : 'LOCKED'),
        adjust: () => {
          if (!unlocked) return;
          this.save.cheats[u.cheat] = !this.save.cheats[u.cheat];
          this.hooks.applyCheats();
        },
      };
    });
    items.push({ label: 'BACK', action: () => this.back() });
    this.list(p, items);
  }

  private options() {
    const s = this.save.settings;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const vol = (k: 'music' | 'sfx' | 'voice') => (d: -1 | 1) => {
      s[k] = Math.max(0, Math.min(1, Math.round((s[k] + d * 0.1) * 10) / 10));
      this.hooks.applySettings();
    };
    const p = this.panel('OPTIONS');
    this.list(p, [
      { label: 'MUSIC', value: () => pct(s.music), adjust: vol('music') },
      { label: 'SOUND FX', value: () => pct(s.sfx), adjust: vol('sfx') },
      { label: 'VOICES', value: () => pct(s.voice), adjust: vol('voice') },
      {
        label: 'LANGUAGE',
        sub: 'Salty = the director’s cut',
        value: () => (s.language === 'salty' ? 'SALTY' : 'CLEAN'),
        adjust: () => {
          s.language = s.language === 'salty' ? 'clean' : 'salty';
          this.hooks.applySettings();
        },
      },
      {
        label: 'CAMERA SHAKE',
        value: () => (s.shake ? 'ON' : 'OFF'),
        adjust: () => {
          s.shake = !s.shake;
          this.hooks.applySettings();
        },
      },
      {
        label: 'GRAPHICS',
        sub: 'LOW = sharper frame rate on laptops',
        value: () => (s.quality === 'high' ? 'HIGH' : 'LOW'),
        adjust: () => {
          s.quality = s.quality === 'high' ? 'low' : 'high';
          this.hooks.applySettings();
        },
      },
      {
        label: 'CONTROLS HINT',
        value: () => (s.showControls ? 'ON' : 'OFF'),
        adjust: () => {
          s.showControls = !s.showControls;
          this.hooks.applySettings();
        },
      },
      { label: 'BACK', action: () => this.back() },
    ]);
  }

  private howto() {
    const p = this.panel('HOW TO PLAY', 'IT IS A SKATEBOARD NOW');
    el(
      'div',
      'm-howto',
      p,
      `<div><b>W / S</b> gas · brake (hold S to reverse)</div>
       <div><b>A / D</b> steer · spin in the air (press it once you're up — steering onto the ramp won't spin you; let go and it finishes the rotation)</div>
       <div><b>SPACE</b> hold to crouch, release to ollie · pop off lips for big air</div>
       <div><b>J</b> + direction — flip tricks (the whole Ryker flips)</div>
       <div><b>K</b> + direction — hold a grab (let go before you land!)</div>
       <div><b>L</b> near a rail or ledge — grind · on the ground — manual (W/S balances)</div>
       <div><b>SHIFT</b> right after landing — revert · with steering — powerslide</div>
       <div><b>HANG ON:</b> thrown off? He's still holding the bars and his weight is on the throttle. <b>BRAKE</b> and <b>MASH SPACE</b> to haul him back on. Pull it off and the whole combo still counts.</div>
       <div><b>SPECIAL:</b> fill the meter, then double-tap directions: ↑↓+J · ←→+J · ↓↑+J · ↑↑+K · ←→+K</div>
       <div><b>R</b> reset · <b>X</b> let go on purpose · <b>ESC</b> pause · <b>H</b> horn</div>
       <div class="m-pad">GAMEPAD: RT/LT gas/brake · A ollie · X flip · B grab · Y grind/manual · RB revert · LB let go · Back reset</div>`,
    );
    this.list(p, [{ label: 'BACK', action: () => this.back() }]);
  }

  private introDone() {
    const p = this.panel('STILL COUNTS.', 'FIRST RIDE COMPLETE');
    el('p', 'm-intro-copy', p, 'You can ride, land a flip, and haul yourself back on. The park is yours.');
    el('p', 'm-intro-copy', p, 'Try a 2-minute career run, or keep practicing without a timer.');
    this.list(p, [
      { label: 'START CAREER', sub: '10 goals. One very questionable vehicle.', action: () => this.hooks.startRun('career') },
      { label: 'FREE SKATE', action: () => this.hooks.startRun('free') },
      { label: 'MAIN MENU', action: () => this.hooks.quitToMenu() },
    ]);
  }

  private footage() {
    const wrap = el('div', 'm-footage', this.root);
    el('div', 'm-kicker', wrap, 'HISTORICAL REENACTMENT');
    el('h2', 'm-title', wrap, 'BASED ON TRUE EVENTS');
    // ViralHog's own YouTube upload (they license the clip; embedding is allowed and they get the views).
    // A local copy (git-ignored, never deployed) only plays when offline.
    const local = this.footageOk && !navigator.onLine;
    const phone = el('div', `m-phone${local ? '' : ' landscape'}`, wrap);
    if (local) {
      const v = document.createElement('video');
      v.src = `${import.meta.env.BASE_URL}media/original.mp4`;
      v.autoplay = true;
      v.controls = true;
      v.playsInline = true;
      phone.appendChild(v);
    } else {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${FOOTAGE_YT}?autoplay=1&rel=0&playsinline=1`;
      f.title = 'Man Wrecks Can-Am at Skatepark || ViralHog';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube refuses embeds that send no referrer
      phone.appendChild(f);
    }
    el('div', 'm-legal', wrap, 'Original footage via ViralHog, played from their YouTube channel.');
    // Once you click into the video, keys go to YouTube, not the game — so a real button.
    el('button', 'm-back', wrap, '&#9664; BACK').addEventListener('click', () => this.back());
    el('div', 'm-press small', wrap, 'ESC TO GO BACK');
  }

  // ---------------------------------------------------------------- results

  results(score: number, stats: { best: number; newBest: boolean; goals: string[]; letters: string; drag: number; bails: number; combo: number }) {
    this.screen = 'results';
    this.stack = [];
    this.root.innerHTML = '';
    this.root.className = 'menus on screen-results';
    this.hooks.onScreen('results');
    const p = this.panel('RUN COMPLETE', 'MUNICIPAL LIABILITY');
    const big = el('div', 'm-score', p, score.toLocaleString());
    if (stats.newBest) el('div', 'm-newbest', big, 'NEW BEST!');
    const s = el('div', 'm-stats', p);
    const row = (k: string, v: string) => {
      const r = el('div', 'm-stat', s);
      el('span', '', r, k);
      el('b', '', r, v);
    };
    row('BEST', stats.best.toLocaleString());
    row('BEST COMBO', stats.combo.toLocaleString());
    row('LETTERS', stats.letters);
    row('METRES DRAGGED', `${stats.drag.toFixed(1)} m`);
    row('TIMES HE LEFT THE VEHICLE', String(stats.bails));
    if (stats.goals.length) el('div', 'm-kicker', p, `GOALS: ${stats.goals.join(' · ')}`);
    this.list(p, [
      { label: 'RUN AGAIN', action: () => this.hooks.startRun('career') },
      { label: 'FREE SKATE', action: () => this.hooks.startRun('free') },
      { label: 'MAIN MENU', action: () => this.hooks.quitToMenu() },
    ]);
  }
}
