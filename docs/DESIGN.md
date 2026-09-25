# PRO RYKER — build design (what we're actually making)

_2026-09-25. Supersedes nothing in the design kit; this is the implementing agent's decisions on top of it.
The kit (`PRO-RYKER-Meme-Design-Kit-v2/`) is the creative brief. Dan's instruction: use it as direction, not law._

## Bottom line

A Tony Hawk's Pro Skater–style browser game. You drive Dan's real Ryker 900 with the real purchased biker on it,
around a pink-concrete autumn skatepark, in 2-minute runs with a goal list, combos, grinds, manuals, gaps and
R-Y-K-E-R letters. The signature mechanic comes straight from the actual footage: **when the rider loses the
seat he hangs onto the bars and gets dragged behind the Ryker — and his body weight twists the throttle open.**

## What the real clip shows (watched 2026-09-25, local file `Man Wrecks Can-Am at Skatepark || ViralHog.mp4`)

Measured: 55.5 s, 360×640 portrait, 29.97 fps. Watched via 1 fps contact sheets plus denser crash sheets
(no audio review — I can't hear). Timecodes approximate to ±1 s.

| Time | What's visible |
|---|---|
| 0–12 s | Ryker cruises a pink-tinted concrete bowl/hip complex; skaters around; high-rise apartments behind |
| 13–20 s | Flat street deck along the park edge; red maples; highway overpass; phone filmers |
| 21–33 s | Upper plaza beside a pavilion/gazebo and a big rusty steel sculpture; a traffic cone gets knocked over |
| 33–37 s | Rolls back down past a filmer into the bowl area |
| 37–39 s | Climbs a transition; the rider is thrown back off the seat **while still holding the handlebars** |
| 39–41 s | Dragged face-down behind the vehicle across the bowl; his hat flies off; the vehicle keeps accelerating |
| 41–44 s | Vehicle carries him toward the flat-rail area, tips, both tumble; ends beside a flat bar |
| 44–55 s | Aftermath; skaters carry on skating; a spectator in a black bear-ear hoodie just watches |

Translated beats: pink concrete + red maples + overpass + pavilion + sculpture + cones (setting), the
thrown-back-but-holding-on drag (core mechanic), the hat/helmet flying off (bail detail), the vehicle continuing
without its operator (empty-bike physics), the indifferent skaters (comedy tone). The park is *inspired by* the
clip's setting; it is not a survey of a real location and is never named as one.

## Deliberate deviations from the design kit

1. **Death-grip throttle is the default, not a chaos option.** The kit banned a stuck throttle in main mode as
   "invisible." Ours is visible and caused: while HANGING, his weight rolls the twist-grip → the bike accelerates.
   HUD says so. Brake fights it; hauling yourself back (mash Space) releases it. It is literally the clip.
2. **Face Manual.** Being dragged is a scoring move ("FACE MANUAL"), linked into your combo. Pull yourself back
   in and the whole combo lands — "STILL COUNTS." Let go and it's lost. The worst moment becomes a risk/reward line.
3. **Grab tricks are rider poses with consequences.** Superman, No-Hander, Can-Can, Seat Stand, "Content Creator"
   (phone selfie). Holding a grab scores; *landing while still in it* has physical results (no hands on the bars
   → he gets left behind; legs off the pegs → he's hanging). The hang state emerges from player choices.
4. **Tony Hawk structure** (the kit's modes were looser): Career = 2-min runs with a persistent 10-goal list,
   Free Skate, gaps list, cheats unlocked by goals (Big Head, Moon Gravity, Perfect Balance, Slo-Mo).
5. **The original clip is an optional local unlock** ("Based on True Events" / the secret tape goal). Loaded
   from `public/media/` which is git-ignored — never committed or deployed, because it's ViralHog-licensed footage.

Everything else in the kit stands: attached whole-assembly flips, seated → unsettled → hanging → recovered/detached,
no speed-alone ejection, no random bails, fast reset, event-truthful comedy, silence budget, clean/salty dialogue.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Throttle / brake-reverse | W / S (or ↑ / ↓) | RT / LT |
| Steer · air spin | A / D | Left stick X |
| Air flip (pitch) · manual balance | W / S in the air | Left stick Y |
| Ollie (hold = charge, release = pop) | Space | A |
| Flip trick (+direction) | J | X |
| Grab trick (+direction, hold to hold) | K | B |
| Grind (near rail) / manual (ground) | L | Y |
| Revert / powerslide | Shift | RB |
| Haul yourself back (while hanging) | mash Space | mash A |
| Restart at last safe spot | R | Back |
| Pause | Esc / P | Start |

## Architecture

TypeScript + Vite + Three.js 0.186 (render) + Rapier 3D 0.21 compat (physics/queries).

- **Park** = one Rapier heightfield composed from signed-distance shapes (bowls, banks, hips, mounds) + trimesh/box
  colliders for vert quarterpipes, ledges, stairs, decks, rails, pavilion. Rails/coping are authored polylines.
- **Vehicle** = custom arcade controller (THPS-style surface sticking, vert-air assist, landings judged against the
  real surface normal) using Rapier shape/ray casts; mirrored to a kinematic body so it shoves props and anchors grips.
  After a full bail the Ryker becomes a free dynamic rigid body.
- **Rider** = the purchased skinned biker. Seated/grab poses are procedural on the real skeleton (fit-ryker.json
  rest pose + IK + secondary motion). Hanging/detached = 12-body Rapier ragdoll driving the same bones; hands jointed
  to the grips while hanging. Recovery blends ragdoll → seat.
- **Game** = semantic events → combo/score, gaps, goals, comedy director, replay recorder. None of them move bodies.
- **Assets**: models git-ignored (`npm run import-models` copies from SEND IT or downloads from its model host).
  Audio generated with ElevenLabs by `npm run gen-audio` (key only in `.env.local`). Art via Codex image generation.
