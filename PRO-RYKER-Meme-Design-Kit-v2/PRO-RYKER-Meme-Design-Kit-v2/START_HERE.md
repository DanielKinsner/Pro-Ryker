# PRO RYKER — autonomous build kickoff

Read this entire package before editing code. This is a design handoff, not a claim that the game has been built. Dan's decision to give you this packet for implementation authorizes the build in a separate project; it does not authorize replacing his other games or publishing private source art.

## Your assignment

Build **SLINGMODS: PRO RYKER — HOLD ON. IT GETS WORSE.** A premium-looking third-person browser skatepark game using Dan's actual Ryker and purchased leather-jacket biker, with intentionally exaggerated physics and substantial physical comedy.

The rider is DRIVING the Ryker. He can remain attached while the WHOLE RIDER-AND-VEHICLE ASSEMBLY flips or spins. Imperfect riding can loosen his feet/seat, leave him hanging from the handlebars, allow a skilled recovery, or release a fully jointed ragdoll.

The earlier floating-rider independent-bike catch interpretation is superseded. Do not implement it as the game's foundation. Whole-assembly rolls labeled with skateboard-inspired trick names are intentional in this parody.

Your central test is not whether a trick counter increments. It is whether real gameplay makes a viewer laugh at a recognizable biker desperately remaining attached to a recognizable Ryker, while the player feels they can actually control and improve the outcome.

## Read order

Read `README.md`, `02_REFERENCE_AND_EVIDENCE.md`, `01_GAME_DESIGN.md`, `03_RIDER_AND_PHYSICS.md`, `04_ASSET_HANDOFF.md`, and `05_BUILD_AND_ACCEPTANCE.md`. Inspect both JSON proposals and `SOURCES.md`.

All proposed tuning values are hypotheses. You may choose better engineering and calibrate numbers after observing the real game. You may not quietly change the central premise, substitute the assets, or call missing reference access “verified.”

## Recover the environment, then act

Discover the working directory, repository status, installed toolchain, available browsers, and model access. Do not hard-code an old Windows username or assume that a previous Claude/Codex session exists. Preserve unrelated local edits.

Create or resume a separate `slingmods-pro-ryker` project. Do not restart an existing PRO RYKER implementation blindly: inspect its code, handoff, and evidence first. The Three-Wheel Tour source repository is read-only. SEND IT stays separate. No edits, resets, pushes, cleanup, or dependency upgrades in either source project.

Retrieve only the useful authorized assets. The candidate Ryker and biker paths are in `04_ASSET_HANDOFF.md`. Verify bytes, provenance, dimensions, materials, skeleton, grip fit, and runtime rendering. Use the purchased biker rather than test-driver or tour-rider substitutions.

The exact YouTube Short has not been viewed by this packet's author. Attempt to inspect it directly when your environment supports that, and clearly record success or failure. Do not invent timestamps or claim the article descriptions are footage. Continue independent mechanics/import work if media access is unavailable; keep clip-fidelity acceptance open.

## Build the physical joke before the surrounding product

The first meaningful milestone must use the real models in an outdoor test area:

- Responsive driving, braking, reversing, and ramp traversal.
- One full-assembly airborne flip with hands/seat visibly connected.
- A sketchy landing causing visible unsettled posture.
- A recoverable partial hang from the bars.
- A failed recovery causing momentum-consistent articulated separation.
- Immediate reset with the next attempt already ready to drive.

A pretty menu, a generic vehicle, a detached capsule, or a screenshot of an upside-down bike is not completion. Actual moving gameplay is required.

Use a practical hybrid controller rather than pursuing laboratory realism. Explicitly manage transform ownership, collision envelopes, grip constraints, skeleton/body mappings, release velocities, and state hysteresis. Do not tune crashes by inserting random giant impulses. Do not make a speed threshold eject the rider on a clean straight.

Once this is genuinely good, build the connected park, grinds/manuals, valid combo scoring, Free Skate, local records, concise challenges, event-driven comedy, and replay. Author the environment at a scale the Ryker can traverse. Keep the camera's horizon comfortable through flips.

## Creative authority

Make routine design and engineering decisions yourself. Author original park geometry, signage, materials, reactions, and sounds when available tools permit. Prioritize a cohesive, detailed finished look, not a graybox that is rationalized as “minimal.” Keep the world ordinary enough that the absurd stunt is the focal point.

Comedy should be bold but precise. Prefer real physical outcomes to constant captions. Use the supplied bank as a starting pool, improve weak lines, and respect the silence budget. Keep clean/unfiltered variants separate. Do not spend the project on municipal lore while the actual rider remains rigid.

No requirement to use a particular model vendor, paid tool, or external asset purchase. Do not make new spending a default prerequisite. Do not copy music, voices, branding treatments, or video clips from Tony Hawk or the source meme. Use original/licensed material and the existing owner-authorized models.

## Work in substantial milestones

Implement, run, play, inspect, repair, and retest within each milestone. Do not stop after every small file or ask Dan to approve routine parameters. Do not bury him under dozens of speculative tests before a playable line exists. Conversely, do not call compiling a physics game equivalent to testing its motion.

When the core is stable, run targeted automated regression cases alongside actual visual/play review. Record commands and evidence. Describe failures directly. Any captured imagery must come from the running build and be labeled appropriately; generated concept art is not runtime evidence.

Keep a concise implementation handoff, a record of chosen tuning, and a list of genuine remaining gaps. Commit only inside the correct project when authorized. A preview deployment can follow the user's hosting instruction; do not silently change a production arcade or publish private source archives.

## The final handoff

Provide a working launch command or authorized preview URL, exact project/branch/commit, source-asset provenance, controls, supported devices, useful gameplay evidence, measured performance, and honest outstanding limitations. Include the reference-access status.

Finish with a playable result, not merely this plan rewritten. The player should be able to go from launch to an impossible Ryker trick, an absurd near-bail, and another attempt without navigating a garage or understanding your architecture.
