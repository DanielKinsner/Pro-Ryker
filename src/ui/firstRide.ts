import type { FirstRide } from '../game/firstRide';
import type { Game } from '../game/game';
import './firstRide.css';

export class FirstRideView {
  private root: HTMLElement;
  private step: HTMLElement;
  private title: HTMLElement;
  private detail: HTMLElement;
  private status: HTMLElement;

  constructor(parent: HTMLElement, private lesson: FirstRide, skip: () => void) {
    this.root = document.createElement('section');
    this.root.className = 'first-ride';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'First Ride lesson');
    this.root.innerHTML = `<div class="lesson-step"></div><h2 class="lesson-title"></h2>
      <p class="lesson-detail"></p><p class="lesson-status" role="status"></p>
      <div class="lesson-actions"><button type="button" class="lesson-retry">Retry lesson</button>
      <button type="button" class="lesson-skip">Skip to Free Skate →</button></div>`;
    this.step = this.root.querySelector('.lesson-step')!;
    this.title = this.root.querySelector('.lesson-title')!;
    this.detail = this.root.querySelector('.lesson-detail')!;
    this.status = this.root.querySelector('.lesson-status')!;
    this.root.querySelector<HTMLButtonElement>('.lesson-retry')!.onclick = (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      lesson.retry();
    };
    this.root.querySelector<HTMLButtonElement>('.lesson-skip')!.onclick = (e) => {
      (e.currentTarget as HTMLButtonElement).blur();
      skip();
    };
    parent.appendChild(this.root);
  }

  update(game: Game) {
    this.root.hidden = !this.lesson.active || game.paused;
    if (this.root.hidden) return;
    const copy = this.lesson.copy(game.input.device);
    const set = (el: HTMLElement, value: string) => {
      if (el.textContent !== value) el.textContent = value;
    };
    set(this.step, `FIRST RIDE · ${this.lesson.lesson + 1} / 4`);
    set(this.title, copy.title);
    set(this.detail, copy.detail);
    set(this.status, copy.status);
    this.root.classList.toggle('success', copy.success);
    this.root.classList.toggle('rescue', game.rider.hanging);
  }
}
