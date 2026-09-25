// WebAudio mixer: buses (music / sfx / voice / engine), loudness-normalised buffers, seamless loops,
// an RPM-crossfaded engine, continuous beds (wind, squeal, grind, drag, ambience), voice with ducking.

const BASE = import.meta.env.BASE_URL + 'assets/audio/';

type Cat = 'engine' | 'loop' | 'oneshot' | 'voice' | 'music' | 'ui';

interface LoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  target: number;
  rate: number;
}

// Per-category loudness targets (RMS dBFS) applied on load, so generated files mix consistently.
const TARGET_RMS: Record<Cat, number> = { engine: -17, loop: -21, oneshot: -18, voice: -17, music: -17, ui: -20 };

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  voice: GainNode;
  engineBus: GainNode;
  private duck: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private loops = new Map<string, LoopVoice>();
  private engineLoops: { id: string; rpm: number; v: LoopVoice | null }[] = [
    { id: 'engine-idle', rpm: 1300, v: null },
    { id: 'engine-low', rpm: 3000, v: null },
    { id: 'engine-mid', rpm: 5600, v: null },
    { id: 'engine-high', rpm: 8200, v: null },
  ];
  private musicSrc: { src: AudioBufferSourceNode; gain: GainNode; id: string } | null = null;
  private voicePlaying: AudioBufferSourceNode | null = null;
  voiceBusyUntil = 0;
  unlocked = false;
  enabled = true;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(this.ctx.destination);
    this.duck = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.music.connect(this.duck).connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.engineBus = this.ctx.createGain();
    this.engineBus.connect(this.sfx);
    this.voice = this.ctx.createGain();
    this.voice.connect(this.master);
    const unlock = () => {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      this.unlocked = true;
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx.suspend();
      else if (this.unlocked) void this.ctx.resume();
    });
  }

  setVolumes(v: { music: number; sfx: number; voice: number }) {
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.voice.gain.setTargetAtTime(v.voice * 1.1, t, 0.05);
  }

  // ---------------------------------------------------------------- loading

  load(path: string, cat: Cat): Promise<AudioBuffer | null> {
    let p = this.loading.get(path);
    if (p) return p;
    p = fetch(BASE + path)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((a) => this.ctx.decodeAudioData(a))
      .then((buf) => {
        let b = normalize(this.ctx, buf, TARGET_RMS[cat]);
        if (cat === 'engine' || cat === 'loop') b = seamless(this.ctx, b, cat === 'engine' ? 0.12 : 0.35);
        this.buffers.set(path, b);
        return b;
      })
      .catch((e) => {
        console.warn('audio load failed', path, e);
        return null;
      });
    this.loading.set(path, p);
    return p;
  }

  async preload(list: [string, Cat][]) {
    await Promise.all(list.map(([p, c]) => this.load(p, c)));
  }

  // ---------------------------------------------------------------- one-shots

  play(path: string, opts: { vol?: number; rate?: number; pan?: number; bus?: GainNode; delay?: number } = {}) {
    if (!this.enabled) return null;
    const buf = this.buffers.get(path);
    if (!buf) {
      void this.load(path, 'oneshot');
      return null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    let node: AudioNode = src.connect(g);
    if (opts.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(opts.bus ?? this.sfx);
    src.start(this.ctx.currentTime + (opts.delay ?? 0));
    return src;
  }

  // ---------------------------------------------------------------- loops

  /** Start (once) and set the target gain of a looping bed. Gain 0 = silent (kept running). */
  loop(path: string, gain: number, rate = 1, bus?: GainNode) {
    let l = this.loops.get(path);
    if (!l) {
      const buf = this.buffers.get(path);
      if (!buf) {
        void this.load(path, 'loop');
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(bus ?? this.sfx);
      src.start(this.ctx.currentTime + Math.random() * 0.01, Math.random() * buf.duration);
      l = { src, gain: g, target: 0, rate: 1 };
      this.loops.set(path, l);
    }
    const t = this.ctx.currentTime;
    if (Math.abs(l.target - gain) > 0.004) {
      l.gain.gain.setTargetAtTime(gain, t, 0.06);
      l.target = gain;
    }
    if (Math.abs(l.rate - rate) > 0.004) {
      l.src.playbackRate.setTargetAtTime(rate, t, 0.05);
      l.rate = rate;
    }
  }

  stopLoops() {
    for (const [, l] of this.loops) {
      l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      l.target = 0;
    }
    for (const e of this.engineLoops) {
      if (e.v) {
        e.v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        e.v.target = 0;
      }
    }
  }

  /** CVT triple: crossfade four loops by RPM, pitch each toward the actual RPM. */
  engine(rpm: number, throttle: number, level: number) {
    const loops = this.engineLoops;
    for (const e of loops) {
      if (!e.v) {
        const buf = this.buffers.get(`sfx/${e.id}.mp3`);
        if (!buf) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.engineBus);
        src.start(0, Math.random() * buf.duration);
        e.v = { src, gain: g, target: 0, rate: 1 };
      }
    }
    const t = this.ctx.currentTime;
    for (let i = 0; i < loops.length; i++) {
      const e = loops[i];
      if (!e.v) continue;
      const lo = i > 0 ? loops[i - 1].rpm : 0;
      const hi = i < loops.length - 1 ? loops[i + 1].rpm : 20000;
      let w = 0;
      if (rpm <= e.rpm) w = i === 0 ? 1 : Math.max(0, (rpm - lo) / (e.rpm - lo));
      else w = i === loops.length - 1 ? 1 : Math.max(0, (hi - rpm) / (hi - e.rpm));
      w = Math.sin((w * Math.PI) / 2); // equal-power
      const load = i >= 2 ? 0.75 + 0.25 * throttle : 1;
      const g = w * load * level * 0.55;
      if (Math.abs(e.v.target - g) > 0.003) {
        e.v.gain.gain.setTargetAtTime(g, t, 0.04);
        e.v.target = g;
      }
      const rate = Math.max(0.6, Math.min(1.6, rpm / e.rpm));
      if (Math.abs(e.v.rate - rate) > 0.004) {
        e.v.src.playbackRate.setTargetAtTime(rate, t, 0.04);
        e.v.rate = rate;
      }
    }
  }

  // ---------------------------------------------------------------- voice

  /** Play one voice line (nothing else talks over it); ducks the music. Returns its duration. */
  say(path: string, vol = 1) {
    if (!this.enabled) return 0;
    const buf = this.buffers.get(path);
    if (!buf) {
      void this.load(path, 'voice');
      return 0;
    }
    this.voicePlaying?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.voice);
    const t = this.ctx.currentTime;
    src.start(t);
    this.voicePlaying = src;
    this.voiceBusyUntil = performance.now() + buf.duration * 1000;
    this.duck.gain.setTargetAtTime(0.45, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + buf.duration, 0.25);
    src.onended = () => {
      if (this.voicePlaying === src) this.voicePlaying = null;
    };
    return buf.duration;
  }

  stopVoice() {
    this.voicePlaying?.stop();
    this.voicePlaying = null;
    this.voiceBusyUntil = 0;
    this.duck.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
  }

  // ---------------------------------------------------------------- music

  async playMusic(id: string, opts: { loop?: boolean; fade?: number } = {}) {
    if (this.musicSrc?.id === id) return;
    const buf = await this.load(`music/${id}.mp3`, 'music');
    if (!buf) return;
    const t = this.ctx.currentTime;
    const fade = opts.fade ?? 1.2;
    if (this.musicSrc) {
      const old = this.musicSrc;
      old.gain.gain.setTargetAtTime(0, t, fade / 3);
      setTimeout(() => old.src.stop(), fade * 1500);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop ?? true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, t, fade / 3);
    src.connect(g).connect(this.music);
    src.start();
    this.musicSrc = { src, gain: g, id };
    src.onended = () => {
      if (this.musicSrc?.src === src) {
        this.musicSrc = null;
        this.onMusicEnded?.(id);
      }
    };
  }

  onMusicEnded: ((id: string) => void) | null = null;

  stopMusic(fade = 1) {
    if (!this.musicSrc) return;
    const m = this.musicSrc;
    m.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    setTimeout(() => m.src.stop(), fade * 1500);
    this.musicSrc = null;
  }

  get musicId() {
    return this.musicSrc?.id ?? null;
  }
}

/** Scale a buffer so its RMS (ignoring near-silence) hits `targetDb`; peak-limited to -1 dBFS. */
function normalize(ctx: AudioContext, buf: AudioBuffer, targetDb: number) {
  let sum = 0;
  let n = 0;
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a > 0.003) {
        sum += d[i] * d[i];
        n++;
      }
    }
  }
  if (!n || peak === 0) return buf;
  const rms = Math.sqrt(sum / n);
  let gain = Math.pow(10, targetDb / 20) / rms;
  gain = Math.min(gain, 0.89 / peak, 12);
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c);
    const d = out.getChannelData(c);
    for (let i = 0; i < s.length; i++) d[i] = s[i] * gain;
  }
  return out;
}

/** Trim MP3 padding silence and crossfade tail→head so AudioBufferSource looping is seamless. */
function seamless(ctx: AudioContext, buf: AudioBuffer, xfadeSec: number) {
  const ch0 = buf.getChannelData(0);
  let start = 0;
  let end = ch0.length;
  while (start < ch0.length / 4 && Math.abs(ch0[start]) < 0.001) start++;
  while (end > ch0.length * 0.75 && Math.abs(ch0[end - 1]) < 0.001) end--;
  const len = end - start;
  const x = Math.min(Math.floor(xfadeSec * buf.sampleRate), Math.floor(len / 3));
  const outLen = len - x;
  const out = ctx.createBuffer(buf.numberOfChannels, outLen, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c);
    const d = out.getChannelData(c);
    for (let i = 0; i < outLen; i++) d[i] = s[start + i];
    // Equal-power crossfade: the head fades in while the (discarded) tail fades out on top of it.
    for (let i = 0; i < x; i++) {
      const t = i / x;
      const head = s[start + i];
      const tail = s[start + outLen + i];
      d[i] = head * Math.sin((t * Math.PI) / 2) + tail * Math.cos((t * Math.PI) / 2);
    }
  }
  return out;
}
