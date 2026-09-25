# PRO RYKER — Handoff

_Last updated: 2026-09-25, after playtest round 1. Repo: https://github.com/DanielKinsner/Pro-Ryker (**public**), branch `main`._

## Where it is and how to run it

Project: `C:\Users\SM - Dan\Documents\GitHub\Pro Ryker`

```bash
npm install
npm run import-models   # licensed GLBs → public/assets/models/ (git-ignored; from SEND IT checkout or its model host)
npm run dev             # http://localhost:5210
npm test                # vitest: 39 unit + headless-physics tests
npm run build           # static dist/, relative base; strips the local clip always and model binaries by default
```

On a fresh machine: clone, `npm install`, `npm run import-models`, `npm run dev`. To enable the "Based on True Events"
unlock locally, copy the clip to `public/media/original.mp4` (git-ignored, never deployed).

Dev console hooks (dev server only): `window.__game` → `{ game, stage, cam, audio, comedy, replay, fx, attract, crowd, dev }`.
`dev.sim(n, dev.frameOf({...}))` steps the simulation synchronously with scripted inputs; `POST /__capture?name=x`
(dev only) saves a canvas frame to `docs/screens/`. The in-app preview pane throttles hidden pages, so testing there is scripted.

## What's built

- **Real models**: Dan's Ryker 900 (steering, suspension travel, spinning wheels, swing-arm rear, optional SlingMods mod
  parts) and the owner-purchased biker, posed from `fit-ryker.json`, hands IK'd to grips that turn with the bars.
- **Park "Municipal Liability"**: one Rapier heightfield from shape formulas (5-lobe clover bowl with blended hips, 4 perimeter
  quarterpipes incl. the 4.6 m "Overcommit" vert wall, funbox, gap kicker/landing, mound, plaza bank) plus box ledges/pads/
  plaza/stairs, flat bars, kink rail, handrail, auto-traced bowl coping. Upper plaza: pavilion (landable/grindable roof),
  rusty sculpture (grindable), roof kicker, signs, Codex graffiti, SlingMods banner. Backdrop (`src/park/backdrop.ts`, built by
  a parallel agent): apartments, downtown skyline, the highway overpass, 66 maples, streets and parked cars.
- **Driving**: custom raycast-suspension Ryker on a Rapier body; skate-game transition handling (speed kept through ramp toes
  and bowl walls), vert air off any transition steeper than ~53° (you come back into the ramp), bounded in-air landing assist,
  kick-turn assist, tumble state, powerslide, reverse, generous approach angle.
- **Tricks**: whole-assembly flips (kickflip/heelflip/front/back), held grabs as rider poses with landing consequences
  (No-Hander → no hands → slam; Superman/Can-Can/Coffin/Selfie → thrown off, hanging), spins, manuals and grinds with balance
  meters, reverts, powerslide links, 5 specials, 7 gaps, R-Y-K-E-R letters, THPS combo scoring.
- **The meme**: seated → unsettled → HANGING (0.16 s thrown-off-the-side lead-in, then a 12-body ragdoll with hands jointed to
  the grips and soft core tethers holding the drag position) → death-grip throttle accelerates the Ryker → brake + mash Space
  → STILL COUNTS; or grip runs out → one hand → detached ragdoll, helmet pops off, empty Ryker carries on.
- **Session**: 2-minute career runs, 10 persistent goals, 6 cheats unlocked by goals, free skate, results, local save.
- **Presentation**: Codex loading art, title with ElevenLabs vocal theme, attract-mode bot driving behind the title/menus,
  zine menus, THPS HUD (keyboard/gamepad hints), captions, custom sky, ambient occlusion (HIGH), particles (grind sparks,
  landing dust, tyre smoke, skid marks, drag dust), cardboard-cutout crowd (Codex art) that reacts and can be knocked flat,
  slow-mo phone-framed incident replay (Backspace after a bail) with 9:16 WebM clip export.
- **Audio (ElevenLabs, Dan's account)**: 37 SFX, 66 voice lines (clean + salty, 5 voices), 4 music tracks + sting; normalised
  and loop-stitched at load; RPM-crossfaded CVT engine; comedy director with the kit's silence budget.

## Verified (by running it)

- `npm test` → 39/39: combo rules, landing classification, save sanitising, park geometry, grind rails; headless vehicle
  regressions on the real park colliders (straight-line stability, brake→reverse, determinism, funbox launch lands clean,
  bowl run no tumble, low-speed bump, vert on the Overcommit and on a 3 m perimeter QP lands clean fakie back on the
  wall, steering onto a lip does not spin you, planter gap clears at full throttle, an early-released spin finishes).
- Scripted in-browser (real game code): funbox 14.5 m/s pop → 5.6 m air → kickflip lands clean; hang → death grip 16→20 m/s →
  brake + mash → recovered → FACE MANUAL + STILL COUNTS banked; 20 m CHASSIS GRIND; rear manual ~16°; No-Hander held through
  touchdown → slam + helmet off (every time); 50 hang/bail/reset cycles leak no bodies/joints/scene objects; a full 2-minute
  career run by the bot → results screen "NEW BEST"; real keyboard events drive menus and throttle.
- Production: `npm run build` + `vite preview` reaches the title screen with models from the SEND IT model host; `dist/`
  contains no model binaries and no clip; dev hooks absent.
- Performance (RTX 4080, Chrome/ANGLE D3D11, 1573×1250, DPR 1): ~3.3 ms render median without AO (~1.7 ms with AO on a lighter
  view), 0.3 ms per 120 Hz physics step, ~425 draw calls, ~2.4 M triangles (the Ryker alone ~0.9 M).
- Runtime captures in `docs/screens/`.

## Playtest round 1 (Dan, 2026-09-25) → fixes

| Dan said | Cause found | Fix (verified) |
|---|---|---|
| "Too easy to fall off the first time" / "going off a ramp instantly sends you into the 2-hand hang" | Steering held onto a lip became a 540°/s spin → sideways landing; W re-pressed mid-air nose-dived; planter gap put you into the landing table's back wall; the 3 m perimeter QPs couldn't be ridden (chassis ploughed into the face, or you launched over the deck out of the park); flying off the pad/hump met QP faces nose-first; QP wings had a hidden 0.7 m wall | A/D latched at takeoff; spin auto-finishes; W/S = bounded lean; flight-path landing assist; body follows transitions; vert judged from the recent wall + capped ~8 m; wings rebuilt; gap table moved. `npx vite-node scripts/landing-sweep.ts`: thrown off **0/72** player-habit jumps (was 11/48); 16/18 deliberate spins land. In-game: every QP straight-on, the gap and the funbox land clean and seated. Attract bot 90 s: 27 big landings / 6 hangs (old code: 15 / 8). |
| "Only a couple of space bar mashes should bring you back" | ~7 fast taps needed at drag speed | 3 taps (two hands), 4 (one hand); drag always shows ≥0.5 s. In-game: 3 taps → back on at 0.55 s. |
| "In SFX you can only raise the values" | ◀ ▶ were CSS decoration; clicks judged by row half and both arrows sit on the right half, so ◀ raised it | Real buttons; verified ◀ 90→80→70 %, saved |
| "The original footage needs to be included" | ViralHog licenses the clip (not public domain) | Dan chose the embed: "Based on True Events" plays ViralHog's YouTube upload `ieCOgCEtXfY` in a sideways phone, with a clickable BACK (keys go to YouTube once you click the video). Verified in-page: autoplays, BACK returns to the menu; build ships no clip. Local copy only plays offline. |

Also checked: the rider's head after the helmet pops off renders as a full head (not hollow).

## Not done / not verified (honest list)

1. **Nobody has played it with hands.** Everything was scripted input. Trick timing, ollie height, spin speed, balance
   difficulty, the haul-back mash rate and camera feel need Dan on a keyboard/controller.
2. **Nobody has listened to it.** Levels were normalised by measurement only. Check the engine, the voice casting (the rider
   is "Austin Knox", a Texan), the vocal title theme, music and SFX mix.
3. Gamepad is coded (standard mapping) but untested on a real pad; there are no touch controls.
4. Reference fidelity: the clip was reviewed from frame sheets, not audio. The park is *inspired by* it.
5. Rights: the Ryker model and purchased rider aren't cleared for public redistribution. The repo is public but contains no
   binaries; production builds fetch them from the SEND IT model host (public-but-unlisted). The ViralHog clip is never shipped as a file; the game embeds their YouTube upload (needs internet).
6. Not deployed anywhere (a Vercel deploy would publish the game — ask first).
7. Environment: this PC's `GITHUB_TOKEN` env var is invalid (breaks `gh` and the GitHub MCP); `gh`'s keyring login works.
   The ElevenLabs key was pasted in chat — consider rotating it; it's only in `.env.local` (git-ignored).

8. Driving off the end of a perimeter QP's wing at speed can launch you out of the park into the streets
   (open world by design); hitting a parked car there throws you, legitimately.
9. Spins still fail if you're mid-spin when you run out of air (e.g. a 0.3 s spin off the tiny hump) — the
   intended skill part.

## Next highest-value tasks

1. Play 3–4 career runs and list what feels wrong (air height, spin speed, flip duration, how often you get thrown, mash rate).
2. Listen with sound on; re-generate any voice line that lands flat (`npm run gen-audio -- vo` after deleting the file).
3. Decide on a public deploy (Vercel like SEND IT) and whether the rider/Ryker rights allow it.
