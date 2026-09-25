# PRO RYKER — Handoff

_Last updated: 2026-09-25 (end of build session 1)._

## Where it is and how to run it

Project: `C:\Users\SM - Dan\Documents\GitHub\Pro Ryker` (git, branch `main`).

```bash
npm install
npm run import-models   # licensed GLBs → public/assets/models/ (git-ignored)
npm run dev             # http://localhost:5210
npm test                # vitest: 33 unit + headless-physics tests
npm run build           # static dist/, relative base
```

Dev console hooks (dev server only): `window.__game` → `{ game, stage, cam, audio, comedy, replay, fx, dev }`.
`dev.sim(n, dev.frameOf({...}))` steps the simulation synchronously with scripted inputs (used for all testing,
because the in-app preview pane throttles hidden pages to ~2 fps).

## What's built

- **Real models**: Dan's Ryker 900 (steering, suspension travel, spinning wheels, swing-arm rear) and the owner-purchased
  biker, posed with the measured `fit-ryker.json`, hands IK'd to grips that turn with the bars.
- **Park "Municipal Liability"**: one Rapier heightfield composed from shape formulas (5-lobe clover bowl with blended
  hips, 4 perimeter quarterpipes incl. the 4.6 m "Overcommit" vert wall, funbox, gap kicker/landing, mound, plaza bank),
  box ledges/pads/plaza/stairs, flat bars, kink rail, handrail, auto-traced bowl coping. Upper plaza with a pavilion
  (landable, grindable roof), rusty sculpture (grindable), roof kicker, signs, Codex graffiti. Backdrop: apartments,
  downtown skyline, highway overpass, red maples, roads, parked cars (`src/park/backdrop.ts`).
- **Driving**: custom raycast-suspension vehicle on a Rapier dynamic body. THPS surface adhesion, vert-air assist
  (launch off a lip → come back into the ramp), kick-turn assist on stalls, tumble state, powerslide, reverse.
- **Tricks**: flips rotate the whole Ryker+rider (kickflip, heelflip, front/backflip), held grabs are rider poses
  (No-Hander, Superman, Coffin, Can-Can, Content Creator/selfie), spins with 180/360 labels, specials, manuals
  (balance meter), rail/ledge/coping/bench/roof grinds (balance meter), reverts, powerslide links, gaps (7), letters.
- **The meme**: seated → unsettled → HANGING (procedural 0.16 s thrown-off-the-side entry, then a 12-body ragdoll with
  hands jointed to the grips and soft core tethers holding the drag position) → haul back (mash Space; brake fights the
  death-grip throttle) → STILL COUNTS, or grip runs out → one hand → detached ragdoll, helmet pops off as a rigid prop,
  empty Ryker keeps going. Landings are judged against the real surface normal; landing in a grab has consequences.
- **Session**: 2-minute career runs, 10 persistent goals, cheats unlocked by goals (Big Head, Moon Gravity, Perfect
  Balance, Slo-Mo Air, SlingMods Parts, Always Special), free skate, local save (sanitised), results screen.
- **Presentation**: loading screen (Codex art), title with vocal theme, zine-style menus, THPS-style HUD, captions,
  custom sky with clouds, Codex pink concrete, particles (grind sparks, landing dust, tyre smoke, skid marks, drag dust),
  speed FOV, camera shake, slow-mo phone-framed incident replay with 9:16 WebM clip export.
- **Audio (ElevenLabs, Dan's account)**: 37 SFX, 63 voice lines (clean + salty) across 5 voices, 4 music tracks + sting.
  Loudness-normalised and loop-stitched at load; RPM-crossfaded CVT engine; comedy director with a silence budget.

## Verified this session (by running it)

- `npm test` → 33/33 (combo rules, landing classification, save sanitising, park geometry, grind rails; headless
  vehicle regressions on the real park colliders: straight-line full throttle stays upright and grounded, brake→reverse,
  determinism, funbox launch lands clean, bowl run doesn't tumble, low-speed bump isn't a launch).
- Scripted in-browser runs (real game code, `dev.sim`): funbox ollie → kickflip → clean landing + air bonus; hang →
  death grip accelerates 16→20 m/s → mash + brake → recovered → FACE MANUAL + STILL COUNTS banked (1,510);
  flat-bar CHASSIS GRIND 20 m with balance; rear manual holds ~16°; 50 hang/bail/reset cycles leak no bodies/joints.
- Performance on the RTX 4080 (Chrome/ANGLE D3D11, 1573×1250, DPR 1): render 3.3 ms median / 8.5 ms p90,
  physics 0.3 ms per 120 Hz step, ~425 draw calls, ~2.4 M triangles (the Ryker alone is ~0.9 M).

## Not done / not verified (honest list)

1. **Nobody has played it with hands yet.** All testing was scripted input; trick timing, ollie height, balance
   difficulty and the haul-back mash rate need Dan's hands on a keyboard/controller.
2. **Nobody has listened to the audio** (I can't hear). Levels are normalised by measurement only. Check the engine,
   voice casting (the rider is "Austin Knox", a Texan), music and SFX mix by ear.
3. **Gamepad and touch** — gamepad mapping is coded but untested on a real pad; there are no touch controls.
4. **Reference fidelity**: the clip was reviewed from frame sheets (no audio). Park is *inspired by* it, not a survey.
5. **Asset rights for public release**: Ryker model + purchased rider are not cleared for public redistribution; the
   ViralHog clip is local-only and must never be committed or deployed.
6. Not deployed anywhere.
