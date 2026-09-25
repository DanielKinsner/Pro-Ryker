// Generates SFX, voice lines and music via ElevenLabs into public/assets/audio/.
// The key is read from ELEVENLABS_API_KEY (or .env.local) and never written anywhere else.
// Usage: npm run gen-audio -- [sfx|vo|music|all]   (existing files are skipped)
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { LINES, VOICES, lineText } from '../src/data/comedy';
import { SFX, MUSIC } from './audioPrompts';

function envKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/ELEVENLABS_API_KEY=(\S+)/);
    if (m) return m[1];
  }
  throw new Error('ELEVENLABS_API_KEY not set (env or .env.local)');
}
const KEY = envKey();
const what = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'all';
const OUT = 'public/assets/audio';
const provPath = `${OUT}/provenance.json`;
mkdirSync(OUT, { recursive: true });
const prov: Record<string, unknown> = existsSync(provPath) ? JSON.parse(readFileSync(provPath, 'utf8')) : {};
const save = () => writeFileSync(provPath, JSON.stringify(prov, null, 2));

async function post(url: string, body: unknown): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const t = await r.text();
    console.warn(`  ${r.status} ${t.slice(0, 300)}`);
    if (r.status === 429 || r.status >= 500) await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
    else throw Object.assign(new Error(`${r.status}`), { status: r.status, body: t });
  }
  throw new Error('retries exhausted');
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = items.slice();
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (q.length) {
        const it = q.shift()!;
        try {
          await fn(it);
        } catch (e) {
          console.warn('FAILED', (e as Error).message);
        }
      }
    }),
  );
}

if (what === 'sfx' || what === 'all') {
  mkdirSync(`${OUT}/sfx`, { recursive: true });
  await pool(SFX, 3, async (s) => {
    const f = `${OUT}/sfx/${s.id}.mp3`;
    if (existsSync(f)) return;
    const body: Record<string, unknown> = { text: s.prompt, duration_seconds: s.dur, prompt_influence: s.influence ?? 0.5 };
    if (s.loop) body.loop = true;
    let buf: Buffer;
    try {
      buf = await post('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', body);
    } catch (e) {
      if ((e as { status?: number }).status === 400 && s.loop) {
        delete body.loop;
        buf = await post('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', body);
      } else throw e;
    }
    writeFileSync(f, buf);
    prov[`sfx/${s.id}.mp3`] = { source: 'ElevenLabs sound-generation', prompt: s.prompt, loop: !!s.loop, created: new Date().toISOString() };
    save();
    console.log('sfx', s.id, buf.length);
  });
}

if (what === 'vo' || what === 'all') {
  mkdirSync(`${OUT}/vo`, { recursive: true });
  const jobs: { file: string; text: string; speaker: keyof typeof VOICES; tags?: string }[] = [];
  for (const l of LINES) {
    jobs.push({ file: `${OUT}/vo/${l.id}.mp3`, text: lineText(l, 'clean'), speaker: l.speaker, tags: l.tags });
    if (l.salty) jobs.push({ file: `${OUT}/vo/${l.id}.salty.mp3`, text: lineText(l, 'salty'), speaker: l.speaker, tags: l.tags });
  }
  let model = 'eleven_v3';
  await pool(jobs, 3, async (j) => {
    if (existsSync(j.file)) return;
    const v = VOICES[j.speaker];
    const text = model === 'eleven_v3' && j.tags ? `${j.tags} ${j.text}` : j.text;
    const body = (m: string, t: string) => ({
      text: t,
      model_id: m,
      voice_settings: { stability: m === 'eleven_v3' ? Math.max(0, Math.min(1, v.stability < 0.4 ? 0 : v.stability < 0.6 ? 0.5 : 1)) : v.stability, similarity_boost: 0.8, style: v.style, use_speaker_boost: true },
    });
    let buf: Buffer;
    try {
      buf = await post(`https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`, body(model, text));
    } catch (e) {
      if ((e as { status?: number }).status === 400 || (e as { status?: number }).status === 422) {
        console.warn('  falling back to eleven_multilingual_v2');
        model = 'eleven_multilingual_v2';
        buf = await post(`https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`, body(model, j.text));
      } else throw e;
    }
    writeFileSync(j.file, buf);
    prov[j.file.replace(`${OUT}/`, '')] = { source: `ElevenLabs TTS ${model} (${v.name})`, text: j.text, created: new Date().toISOString() };
    save();
    console.log('vo', j.file, buf.length);
  });
}

if (what === 'music' || what === 'all') {
  mkdirSync(`${OUT}/music`, { recursive: true });
  await pool(MUSIC, 2, async (m) => {
    const f = `${OUT}/music/${m.id}.mp3`;
    if (existsSync(f)) return;
    const buf = await post('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', { prompt: m.prompt, music_length_ms: m.ms });
    writeFileSync(f, buf);
    prov[`music/${m.id}.mp3`] = { source: 'ElevenLabs music', prompt: m.prompt, created: new Date().toISOString() };
    save();
    console.log('music', m.id, buf.length);
  });
}
save();
console.log('done');
