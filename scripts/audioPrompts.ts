// Sound design + music briefs for ElevenLabs generation (npm run gen-audio -- [sfx|vo|music|all]).

export interface SfxPrompt {
  id: string;
  prompt: string;
  dur: number;
  loop?: boolean;
  influence?: number;
}

export const SFX: SfxPrompt[] = [
  // Engine: Rotax 900 ACE inline triple (Can-Am Ryker), CVT so revs sit high under load.
  { id: 'engine-idle', prompt: 'close mic recording of a three-cylinder motorcycle engine idling, lumpy triple burble, steady, seamless loop', dur: 4, loop: true },
  { id: 'engine-low', prompt: 'three-cylinder roadster motorcycle engine at low constant revs, around 3000 rpm, throaty triple, steady cruise, seamless loop', dur: 4, loop: true },
  { id: 'engine-mid', prompt: 'three-cylinder motorcycle engine held at 6000 rpm under load, raspy triple howl, steady, seamless loop', dur: 4, loop: true },
  { id: 'engine-high', prompt: 'three-cylinder motorcycle engine screaming near redline at constant high rpm, aggressive triple wail, steady, seamless loop', dur: 4, loop: true },
  { id: 'wind', prompt: 'strong wind rushing past a rider at speed, steady whoosh, seamless loop', dur: 4, loop: true },
  { id: 'tire-squeal', prompt: 'car tyres squealing continuously on smooth concrete during a powerslide, steady screech, seamless loop', dur: 3, loop: true },
  { id: 'grind-metal', prompt: 'heavy metal vehicle underside grinding along a steel handrail, continuous harsh scrape with sparks, seamless loop', dur: 3, loop: true },
  { id: 'grind-concrete', prompt: 'heavy steel scraping along a concrete ledge, continuous gritty grind, seamless loop', dur: 3, loop: true },
  { id: 'drag-scrape', prompt: 'leather jacket and boots being dragged along rough concrete at speed, continuous scraping and shuffling, seamless loop', dur: 3, loop: true },
  { id: 'land-soft', prompt: 'small three-wheeled motorcycle landing a small jump, suspension compresses with a soft thunk and tyre chirp', dur: 0.7 },
  { id: 'land-hard', prompt: 'heavy three-wheeled motorcycle landing hard after a big jump on concrete, suspension bottoms out with a deep thud and rattle', dur: 1.0 },
  { id: 'slam', prompt: 'motorcycle crashing onto concrete, plastic body panels crunching and scraping, metal clatter, comedic but not gory', dur: 1.8 },
  { id: 'ollie', prompt: 'vehicle suspension springing up quickly with a short engine rev blip, pop', dur: 0.6 },
  { id: 'whoosh', prompt: 'fast swoosh of a heavy object spinning through the air', dur: 0.6 },
  { id: 'body-thud-1', prompt: 'person in a leather jacket tumbling onto concrete, dull body thud, non-gory, slapstick', dur: 0.7 },
  { id: 'body-thud-2', prompt: 'body rolling and slapping on concrete, two soft thuds, non-gory, slapstick', dur: 0.9 },
  { id: 'helmet-bounce', prompt: 'hollow plastic motorcycle helmet bouncing and rolling across concrete, several light knocks', dur: 1.4 },
  { id: 'cone-hit', prompt: 'plastic traffic cone knocked over and bouncing on concrete, hollow plastic thwack', dur: 0.8 },
  { id: 'bin-hit', prompt: 'metal trash can knocked over on concrete, loud clang and rattle', dur: 1.0 },
  { id: 'chair-clink', prompt: 'single metal folding chair falling over onto concrete, one clink, silence', dur: 0.8 },
  { id: 'letter', prompt: 'bright arcade collectible pickup chime, sparkly ascending bell, video game', dur: 0.8, influence: 0.7 },
  { id: 'goal', prompt: 'punk rock guitar power chord hit with crash cymbal, short triumphant sting', dur: 1.6, influence: 0.6 },
  { id: 'combo', prompt: 'satisfying arcade score cash register ding with a short sparkle, video game combo landed', dur: 0.9, influence: 0.7 },
  { id: 'special', prompt: 'power up whoosh rising into a bright shimmer, video game special meter full', dur: 1.2, influence: 0.6 },
  { id: 'crowd-ooh', prompt: 'small group of teenagers at a skatepark going ooooh in unison, impressed', dur: 1.8 },
  { id: 'crowd-cheer', prompt: 'small crowd of skaters cheering and whooping at a skatepark, short burst', dur: 2.0 },
  { id: 'crowd-gasp', prompt: 'small crowd gasping in shock at a skatepark, short', dur: 1.2 },
  { id: 'crowd-laugh', prompt: 'small group of teenagers bursting out laughing at a skatepark', dur: 2.0 },
  { id: 'board-tap', prompt: 'skateboard tail tapped twice on concrete, respectful, sparse', dur: 0.7 },
  { id: 'phone-shutter', prompt: 'smartphone camera shutter click', dur: 0.5 },
  { id: 'glove-creak', prompt: 'leather motorcycle gloves squeezing handlebar grips tightly, leather creak', dur: 0.8 },
  { id: 'record-scratch', prompt: 'classic vinyl record scratch stop, comedic', dur: 0.9, influence: 0.8 },
  { id: 'horn', prompt: 'motorcycle horn, two short beeps', dur: 0.7 },
  { id: 'ui-select', prompt: 'crisp punchy user interface click, arcade menu select', dur: 0.5, influence: 0.7 },
  { id: 'ui-back', prompt: 'soft low user interface click, arcade menu back', dur: 0.5, influence: 0.7 },
  { id: 'ui-tick', prompt: 'tiny tick sound for a menu cursor moving', dur: 0.5, influence: 0.7 },
  { id: 'ambience', prompt: 'outdoor city skatepark ambience on an autumn afternoon, distant skateboard wheels rolling and clacking, distant traffic from a highway overpass, light breeze in trees, seamless loop', dur: 10, loop: true },
];

export const MUSIC = [
  {
    id: 'title-theme',
    ms: 75000,
    prompt:
      "Fast, raw late-1990s skate punk anthem for a skateboarding video game's title screen. Driving drums around 185 bpm, crunchy distorted guitars, melodic bass, snotty punk lead vocal telling the story of a middle-aged biker who took his three-wheeled motorcycle to the skatepark, and a huge shouted gang-vocal chorus: 'Hold on! It gets worse!' Energetic, funny, no profanity.",
  },
  {
    id: 'run-punk',
    ms: 120000,
    prompt:
      'Instrumental late-1990s Californian skate punk for a skateboarding video game. Fast double-time drums around 180 bpm, palm-muted power chords, melodic lead guitar hooks, punchy bass, relentless energy, loopable, no vocals.',
  },
  {
    id: 'run-hiphop',
    ms: 120000,
    prompt:
      'Instrumental late-1990s East Coast boom-bap hip-hop beat for a skateboarding video game. Dusty sampled drum break at 92 bpm, heavy bass line, vinyl scratches and turntable cuts, jazzy horn stabs, head-nodding groove, loopable, no vocals.',
  },
  {
    id: 'run-ska',
    ms: 100000,
    prompt:
      'Instrumental 1990s ska-punk for a skateboarding video game. Upstroke guitar skank, bright punchy horn section riffs, fast walking bass, energetic drums, goofy and fun, loopable, no vocals.',
  },
  {
    id: 'results-sting',
    ms: 6000,
    prompt: 'Short punk rock ending sting for a video game results screen: drum fill, big power chord hit with crash cymbal, guitar feedback squeal, then silence. No vocals.',
  },
];
