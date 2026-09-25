import { describe, it, expect } from 'vitest';
import { sanitize, DEFAULT_SAVE } from '../src/core/save';

describe('save sanitising', () => {
  it('garbage becomes defaults', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SAVE);
    expect(sanitize('nope')).toEqual(DEFAULT_SAVE);
  });
  it('keeps valid values and clamps bad ones', () => {
    const s = sanitize({ best: 1234, goals: ['roof', 7, null], settings: { music: 5, language: 'klingon' }, cheatsUnlocked: ['bigHead', 'godMode'] });
    expect(s.best).toBe(1234);
    expect(s.goals).toEqual(['roof']);
    expect(s.settings.music).toBe(1);
    expect(s.settings.language).toBe('salty');
    expect(s.cheatsUnlocked).toEqual(['bigHead']);
  });
  it('NaN and negative numbers are rejected', () => {
    const s = sanitize({ best: NaN, runs: -4 });
    expect(s.best).toBe(0);
    expect(s.runs).toBe(0);
  });
});
