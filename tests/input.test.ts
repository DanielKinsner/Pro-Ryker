import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/core/input';
import { Menus } from '../src/ui/menus';

afterEach(() => vi.unstubAllGlobals());

describe('controller menu activation', () => {
  it.each(['pause', 'up'] as const)('does not redispatch %s when a menu callback samples input again', (action) => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    if (action === 'pause') buttons[9] = { pressed: true, value: 1 };
    vi.stubGlobal('document', new EventTarget());
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, action === 'up' ? -1 : 0], buttons }] });
    const input = new Input(new EventTarget() as unknown as Window);
    const presses: string[] = [];
    input.onPress = (b) => {
      presses.push(b);
      // Run/resume handlers drain input. Bound the recursion so a regression fails cleanly.
      if (presses.length === 1) input.sample();
    };
    input.sample();
    expect(presses).toEqual([action]);
  });

  it('one A press changes a toggle once, and holding it does not repeat', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    vi.stubGlobal('document', new EventTarget());
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0], buttons }] });
    const input = new Input(new EventTarget() as unknown as Window);
    let shake = true;
    const adjust = vi.fn(() => { shake = !shake; });
    // Exercise the real menu dispatcher without a renderer or a DOM layout engine.
    const menu = Object.assign(Object.create(Menus.prototype), {
      screen: 'options', idx: 0, items: [{ adjust }], listEl: null, hooks: { sfx: vi.fn() },
    }) as Menus;
    input.onPress = (b) => menu.press(b);
    buttons[0] = { pressed: true, value: 1 };
    expect(input.sample().pressed.ollie).toBe(1);
    expect(adjust).toHaveBeenCalledTimes(1);
    expect(shake).toBe(false);
    input.sample();
    expect(adjust).toHaveBeenCalledTimes(1);
    buttons[0] = { pressed: false, value: 0 };
    input.sample();
    buttons[0] = { pressed: true, value: 1 };
    input.sample();
    expect(adjust).toHaveBeenCalledTimes(2);
    expect(shake).toBe(true);
  });
});

it('releases a gameplay key even if focus moves onto a button before keyup', () => {
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('navigator', { getGamepads: () => [] });
  const target = new EventTarget();
  const input = new Input(target as unknown as Window);
  const down = new Event('keydown', { cancelable: true });
  Object.defineProperty(down, 'code', { value: 'Space' });
  target.dispatchEvent(down);
  expect(input.sample().held.ollie).toBe(true);
  const up = new Event('keyup', { cancelable: true });
  Object.defineProperties(up, {
    code: { value: 'Space' },
    target: { value: { closest: () => ({ tagName: 'BUTTON' }) } },
  });
  target.dispatchEvent(up);
  const frame = input.sample();
  expect(frame.held.ollie).toBe(false);
  expect(frame.released.ollie).toBe(1);
});
