// Local save (records, goals, gaps, cheats, settings). Malformed/foreign data is sanitised, and
// storage failures (private mode, blocked) never break the game.

export interface Settings {
  music: number;
  sfx: number;
  voice: number;
  language: 'clean' | 'salty';
  shake: boolean;
  showControls: boolean;
  quality: 'high' | 'low';
}

export interface Cheats {
  bigHead: boolean;
  moonGravity: boolean;
  perfectBalance: boolean;
  slomo: boolean;
  slingmodsParts: boolean;
  specialAlways: boolean;
}

export interface SaveData {
  version: 1;
  best: number;
  bestFree: number;
  bestCombo: number;
  goals: string[];
  gaps: string[];
  cheatsUnlocked: (keyof Cheats)[];
  cheats: Cheats;
  settings: Settings;
  runs: number;
  bails: number;
  dragMetres: number;
  introCompleted: boolean;
}

const KEY = 'pro-ryker-v1';

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  best: 0,
  bestFree: 0,
  bestCombo: 0,
  goals: [],
  gaps: [],
  cheatsUnlocked: [],
  cheats: { bigHead: false, moonGravity: false, perfectBalance: false, slomo: false, slingmodsParts: false, specialAlways: false },
  settings: { music: 0.7, sfx: 0.9, voice: 0.9, language: 'salty', shake: true, showControls: true, quality: 'high' },
  runs: 0,
  bails: 0,
  dragMetres: 0,
  introCompleted: false,
};

const num = (v: unknown, d: number, lo = 0, hi = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function sanitize(raw: unknown): SaveData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const c = (r.cheats ?? {}) as Record<string, unknown>;
  const d = DEFAULT_SAVE;
  const cheatKeys = Object.keys(d.cheats) as (keyof Cheats)[];
  return {
    version: 1,
    best: num(r.best, 0),
    bestFree: num(r.bestFree, 0),
    bestCombo: num(r.bestCombo, 0),
    goals: strs(r.goals),
    gaps: strs(r.gaps),
    cheatsUnlocked: strs(r.cheatsUnlocked).filter((k): k is keyof Cheats => (cheatKeys as string[]).includes(k)),
    cheats: Object.fromEntries(cheatKeys.map((k) => [k, bool(c[k], false)])) as unknown as Cheats,
    settings: {
      music: num(s.music, d.settings.music, 0, 1),
      sfx: num(s.sfx, d.settings.sfx, 0, 1),
      voice: num(s.voice, d.settings.voice, 0, 1),
      language: s.language === 'clean' ? 'clean' : 'salty',
      shake: bool(s.shake, true),
      showControls: bool(s.showControls, true),
      quality: s.quality === 'low' ? 'low' : 'high',
    },
    runs: num(r.runs, 0),
    bails: num(r.bails, 0),
    dragMetres: num(r.dragMetres, 0),
    introCompleted: bool(r.introCompleted, false),
  };
}

export function loadSave(): SaveData {
  try {
    const t = localStorage.getItem(KEY);
    return sanitize(t ? JSON.parse(t) : {});
  } catch {
    return sanitize({});
  }
}

export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
