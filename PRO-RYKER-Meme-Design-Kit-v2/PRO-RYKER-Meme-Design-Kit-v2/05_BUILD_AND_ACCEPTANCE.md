# Build milestones and acceptance

These are delivery gates, not claims of completed work. Run useful implementation/testing/repair loops internally and hand back substantial results.

## M0 — Assets and source truth

Create/discover a separate project. Record source revision and local asset hashes. Load the actual Ryker and purchased biker. Document rig/basis/fit. Preserve source repositories. Record whether the exact video is accessible.

Pass: correct models and materials rendered together, real grip/seat fit inspected, no silent placeholder substitution, readable local launch instructions. File paths alone do not pass.

## M1 — The playable meme mechanic

Build an outdoor test area with a bank, trough, opposing transition, recovery space, and safe spawn. Implement drive/brake/reverse, shared aerial rotation, rider compliance, partial hanging, recovery, full articulated bail, and reset.

Pass: an uninterrupted gameplay capture shows both a successful stunt/recovery and a clearly caused unsuccessful attempt. The player's next attempt is immediately available. No forced crash cutscene. The bike and rider visibly rotate together while attached.

## M2 — A real skate session

Build the connected Municipal Liability park around readable routes. Add grinds, rear/nose manuals, valid trick recognition, capped combo scoring, two-minute sessions, Free Skate, and local bests. Make the sky, concrete, vehicle, rider, and UI feel like one visual direction.

Pass: three distinct lines work without camera failures, invisible walls, unwinnable jumps, or a garage navigation detour. Repeated valid actions score consistently. Empty-bike stunts do not bank rider combos.

## M3 — Comedy that responds to what happened

Add a restrained set of spectator reactions, physical props, original audio cues, the comedy scheduler, clean/unfiltered variants, concise challenges, and a transform-based replay.

Pass: jokes correspond to actual events, do not spam, never change outcomes, clear on reset, and can be muted. At least three physically different bail/recovery outcomes occur under controlled variations, rather than the same animation repeated.

## M4 — Delivery and robustness

Polish controls and camera, validate asset loading, optimize after measurement, verify production build paths, add accessibility/settings, and prepare an honest handoff.

Pass: supported devices and measured performance are stated, not assumed. No paid source assets or authoring archives accidentally ship. Source games remain unchanged. Reference fidelity is explicitly unresolved unless the actual Short has been inspected.

## Focused regression matrix

| Case | Expected behavior |
|---|---|
| Full throttle on a clean straight | Rider stays aboard; speed alone never ejects |
| Clean roll at ample altitude | Rider and vehicle rotate together; grip posture remains coherent |
| Repeat identical safe trick | Comparable outcome; no random bail chance |
| Low-speed bump | Small response, not a projectile rider |
| Off-axis landing at moderate speed | Readable strain; possible recovery |
| Same error with substantially greater impact severity | Greater consequences for a visible reason |
| Inversion during a commanded aerial trick | Not misclassified as grounded loss of balance |
| Landing on a sloped transition | Evaluated relative to local surface, not global vertical |
| Both-hands hang and valid recovery input | Reachable return to seat without teleport/clipping |
| One-hand hang outside recovery envelope | Grip release follows physical state; no impossible snapback |
| Direct severe chassis/head-area contact | Immediate bail allowed; no forced warning delay |
| Release during angular motion | Ragdoll inherits tangential motion, not zeroed velocity |
| Full detach while empty bike lands upright | Combo is lost; optional incident gag may occur |
| Stationary manual or rail stall | No endless score generation |
| Multi-collider rail impact | One coherent event, not repeated score/voice triggers |
| Unsupported collision proxy orientation | Test must fail; visible trick and collision body must agree |
| Camera through a full roll and separation | Horizon comfortable; subject readable; no world clipping |
| Brake to stop then reverse | Predictable reversing and steering |
| Repeated rapid resets | No stale grips, audio, duplicates, physics bodies, or accumulating memory |
| Background tab and resume | Pause/focus recovery; no enormous time-step explosion |
| Timer expires during a combo | Bounded finish grace; no indefinite overtime |
| Clean/unfiltered/muted dialogue | Gameplay identical; only presentation changes |
| Default versus chaos presets | Clearly labeled, separate records; no hidden settings crossover |
| Reload local save | Records/settings survive valid reload and handle malformed data safely |
| Production build asset URLs | Model/textures load at intended deployed base path |

Use enough repetitions to expose instability and report the actual sample count. Re-run sensitive cases at several rendering rates without changing the fixed simulation tick. A suggested long-run smoke is 100 resets plus a sustained driving/trick session; this is a target, not evidence that it has happened.

## Evidence to deliver

An actual launchable build; exact commit and launch command; a short uninterrupted gameplay capture of the central mechanic; a capture of one completed score run; imported-model views; a concise log of measured tests; performance samples including browser/hardware/resolution/duration; asset provenance; and a current limitations list.

Do not record a glossy promotional film instead of play evidence. Do not use generated pictures as proof that the code renders correctly. Do not claim audio was reviewed when only waveforms or a file list were inspected.

## No false completion

An implementation may be playable while exact-clip fidelity remains open. Say so. Conversely, a source-video summary is not a playable game. Keep those two achievements separate and do not claim either before it exists.
