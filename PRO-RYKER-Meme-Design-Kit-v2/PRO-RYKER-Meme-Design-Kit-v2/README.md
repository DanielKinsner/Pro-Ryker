# SLINGMODS: PRO RYKER
## HOLD ON. IT GETS WORSE.

**Version 2 — corrected rider mechanics · September 25, 2026**  
A design and implementation-handoff package for Dan Kinsner. Not a built game.

## The correction that governs everything

Dan's instruction: **the rider is driving the Ryker; rider and vehicle can flip together while he remains attached. Speed, balance problems, and impacts can throw him off.** The inspiration is the supplied Ryker skatepark meme, amplified into intentionally impossible arcade physics.

This version supersedes the earlier design's requirement for the rider to float above the vehicle and catch independent skateboard flips. That requirement was wrong for this project. Do not implement it as the foundation. Do not merge the old kickoff into this one.

The defining loop is **drive → show off → destabilize → hang on → recover or eject → immediately try again**. Skate-style tricks, grinds, manuals, and combos belong inside that loop. The rider does not have to leave his seat to perform a trick.

## Reference-access limitation

The exact YouTube Short has **not been successfully played or frame-inspected** in this session. Public articles about the Ryker skatepark incident were retrieved; they are secondary descriptions, not a substitute for having watched Dan's exact edit. This package makes no verified claim about its timestamps, precise choreography, music, captions, or editing.

`02_REFERENCE_AND_EVIDENCE.md` separates Dan's confirmed instructions, retrieved coverage, original design proposals, and unresolved footage questions. Exact visual fidelity remains an open acceptance item. The current mechanics and source-asset work can proceed without inventing a video analysis.

## Start here

**For Dan:** open `READ_THE_DESIGN.html` in a browser for the readable design, mechanics, and reference notes. Or read `01_GAME_DESIGN.md`.

**For the implementing agent:** read `START_HERE.md`, followed by all numbered documents. The executable-looking JSON files are **proposed content/configuration contracts**, not working software. Implement and validate consumers rather than implying these files already run a game.

| File | Purpose |
|---|---|
| `START_HERE.md` | Autonomous developer kickoff and project boundaries |
| `01_GAME_DESIGN.md` | Game identity, controls, map, tricks, progression, comedy, presentation |
| `02_REFERENCE_AND_EVIDENCE.md` | What was and was not verified about the meme and existing assets |
| `03_RIDER_AND_PHYSICS.md` | Attached/semi-detached/ragdoll behavior, fair failures, technical ownership |
| `04_ASSET_HANDOFF.md` | Repository-observed Ryker and purchased biker paths; import and provenance requirements |
| `05_BUILD_AND_ACCEPTANCE.md` | Milestone deliverables, concrete playtests, release evidence |
| `COMEDY_BANK.json` | Event-driven lines, captions, signs, physical gags, and anti-spam rules |
| `TUNING_PROPOSAL.json` | Explicitly untested initial tuning hypotheses |
| `READ_THE_DESIGN.html` | Self-contained human-readable document; not a game |
| `SOURCES.md` | Traceable source URLs and scope of support |

No vehicle/rider binaries, purchased source archives, original-video media, generated concept art, or font files are bundled. Existing Three-Wheel Tour and SEND IT remain untouched. The source repository is read-only for this new project.
