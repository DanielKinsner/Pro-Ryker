import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, type Mode } from '../src/game/game';
import { EventBus } from '../src/core/events';
import { sanitize } from '../src/core/save';

afterEach(() => vi.unstubAllGlobals());

function fixture(demo: boolean, mode: Mode) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => store.set(k, v) });
  const game = Object.assign(Object.create(Game.prototype), {
    demo, mode, events: new EventBus(), vehicle: {}, rider: {},
    tricks: { score: 0, lose: vi.fn(), onRecovered: vi.fn(), combo: { active: false } },
    save: sanitize({ best: 1000, bestCombo: 500, runs: 2, bails: 1, dragMetres: 4, goals: ['score1'] }),
    runGoals: new Set(), lettersTaken: new Set(), conesDown: new Set(), collectibles: [],
    props: null, respawn: vi.fn(),
  }) as Game;
  (game as unknown as { wire(): void }).wire();
  return { game, store };
}

function performRun(game: Game) {
  game.startRun(game.mode);
  game.events.emit('rider_detached', { speed: 12, cause: 'test', vehicleMoving: true });
  game.events.emit('rider_recovered', { fromOneHand: false, dragMetres: 30 });
  game.events.emit('hang_entered', { hands: 2, speed: 10, cause: 'test' });
  game.events.emit('combo_banked', { score: 12000, tricks: 2, multiplier: 2, names: ['FACE MANUAL'] });
  game.events.emit('gap', { id: 'planter', name: 'PLANTER GAP', points: 500 });
  game.completeGoal('tape');
  game.endRun();
}

describe('player progress isolation', () => {
  it('a new run clears demo or practice special charge and stale score feedback', () => {
    const { game } = fixture(false, 'free');
    game.tricks.special = 1;
    game.tricks.specialReady = true;
    game.tricks.pop = { text: '+5,000', t: 0, kind: 'good' };
    game.startRun('career');
    expect(game.tricks.special).toBe(0);
    expect(game.tricks.specialReady).toBe(false);
    expect(game.tricks.pop.text).toBe('');
  });
  it.each([[true, 'free'], [false, 'practice']] as const)('demo=%s, mode=%s cannot leak records into a later save', (demo, mode) => {
    const { game, store } = fixture(demo, mode);
    const before = structuredClone(game.save);
    performRun(game);
    expect(game.save).toEqual(before);
    expect(game.runGoals.size).toBe(0);
    game.demo = false;
    game.mode = 'career';
    game.persist();
    expect(JSON.parse(store.get('pro-ryker-v1')!)).toEqual(before);
  });

  it('normal play still records runs, bails, recoveries, combos, gaps and goals', () => {
    const { game } = fixture(false, 'career');
    performRun(game);
    expect(game.save.runs).toBe(3);
    expect(game.save.bails).toBe(2);
    expect(game.save.dragMetres).toBe(34);
    expect(game.save.bestCombo).toBe(12000);
    expect(game.save.gaps).toContain('planter');
    expect(game.save.goals).toEqual(expect.arrayContaining(['reenact', 'stillcounts', 'planter', 'tape']));
  });
});
