# Rider and physics contract

**Design/engineering proposal, not tested implementation.** Numerical defaults live in `TUNING_PROPOSAL.json`; calibrate them using actual gameplay.

## 1. Architecture: one simulation, explicit owners

Suggested browser starting point: TypeScript, Vite, Three.js rendering, and Rapier physics, with a small DOM-based UI. This is a design recommendation, not a verified dependency installation. Select compatible stable versions, pin them, and record the environment. A different stack is acceptable when it demonstrably improves the requested result without changing deployment goals.

Rapier documents dynamic/kinematic rigid bodies, colliders, joints, and continuous collision detection. Three.js documents skinned meshes and skeleton-aware cloning. Those sources establish basic tool capabilities; the controller, ragdoll transitions, and tuning below are our proposed engineering, not library promises. [T1–T3]

Keep these responsibilities separate:

- Vehicle motion controller: drive, contacts, launches, air control, landings, grinds.
- Rider controller: posture, compliance, contact/grip states, recovery, ragdoll ownership.
- Trick/score evaluator: observes accepted game events; does not move physics bodies.
- Comedy director: observes truthful events; does not alter outcomes to force a punchline.
- Replay recorder: records actual transforms and events; does not advance the live simulation.
- Session manager: run timer, local records, spawning, pause/focus handling.

Exactly one system owns a root or body at a time. Animation and physics cannot both write contradictory transforms in the same tick.

## 2. Coordinate basis and timing

Use metres, seconds, radians internally. The observed biker fit declares +X right, +Y up, -Z forward in vehicle space. Validate the Ryker import against that convention instead of adding blind rotations to make the screenshot look correct. [R3]

Use a fixed simulation timestep, initially 1/60 second, and interpolate presentation. Limit catch-up work after a long frame. Pause rather than simulating a giant time step when a tab resumes. Quaternions govern body orientation; scoring may maintain separate signed, unwrapped rotation accumulators.

Sample inputs once per simulation tick. Keep gamepad deadzones, response curves, keyboard ramping, and simultaneous-key behavior explicit. Timers for balance and grip are simulation-time timers, not frames or wall-clock animation callbacks.

Do not promise bit-identical simulation on arbitrary devices. Test consistency on supported configurations and use recorded transforms for replays.

## 3. Vehicle representation

Start from measured model bounds and wheel centers. Build a simple compound collision body with the actual broad chassis and front-wheel width, plus appropriate wheel-contact sampling. Do not inherit the Slingshot footprint or use the detailed render mesh as a dynamic triangle-mesh collider.

Use a dynamic chassis with tunable arcade suspension/contact forces. Airborne trick commands apply controlled rotational targets/torques while translation remains physically legible. Ground stabilization, launch assist, and limited rotation damping are allowed cheats. Document when they operate.

The chassis collision orientation must follow the visible orientation. Rotating only a visual child while leaving an upright invisible collision box would make upside-down passes and landings dishonest.

For an early prototype, analytic/sweep-based movement may be acceptable if the entire collision envelope is swept along its motion, contacts are respected, and the fallback is explicitly documented. Do not repeatedly teleport a dynamic body through the park and call that a physical stunt controller.

Authored rails can use a special constrained path-following state. Its candidate selection, allowed alignment, balance, travel, exit velocity, and obstruction handling must be explicit. A grind does not grant immunity to an overhanging wall.

## 4. Rider representation

The purchased biker manifest records 60 skeleton joints. That is an animation skeleton, not a requirement for 60 physical bodies and not proof of a ready-made ragdoll. [R2]

Begin with approximately 12–16 physics bodies covering pelvis, torso sections, head, upper/lower arms, and upper/lower legs. Hands/feet may be separate or driven from terminal limbs after measuring stability. Use bounded joints and fit colliders to the actual body rather than aesthetic guesses.

Use the existing Ryker grip fit as a starting seated pose. Measure hips, pegs, grip anchors, leg clearance, and handlebar movement. The bars may steer; the hands should follow their actual contact frames.

While strongly attached, the seated body can be a controlled skeleton with physically responsive secondary motion, or a driven ragdoll using compliant motors. Both approaches are acceptable if they visibly preserve attachment while allowing flex. A rigid parented mannequin with a random “fall off” timer is not.

For partial detachment, physical bodies and one/two hand constraints should drive the visible skinned rider. If a hybrid implementation uses procedural near-hang animation before physical release, it must honestly label that phase and produce equally convincing physical directionality. Full bails require a jointed ragdoll, not a single rotating capsule.

## 5. State machine and contact ownership

| State | Seat/feet | Hands | Motion authority | Exit conditions |
|---|---|---|---|---|
| SEATED | Strong support targets | Strong grip targets | Vehicle + driven rider | Sustained measured strain, destabilizing contact |
| UNSETTLED | Reduced support; one or more feet can slip | Grips retained | Vehicle + compliant pose | Recovery dwell, further instability, direct severe hit |
| HANGING_BOTH | Seat/peg support released | Two compliant constraints | Physical rider + reduced driving control | Recapture window, one grip failure, severe impact |
| HANGING_ONE | Seat released | One constrained hand | Physical rider + strongly reduced control | Recapture only in narrow valid window, final release |
| DETACHED | None | None | Independent vehicle and ragdoll physics | Reset, optional settled/get-up presentation |
| RESETTING | Restored from validated spawn | Restored | Session manager atomically rebuilds state | Clean seated start |

Do not force every bail through a theatrical full sequence. A direct major impact can cause immediate detachment. But ordinary errors should frequently show a readable warning and recoverable middle.

State-change hysteresis is required. Use different entry/exit thresholds and minimum dwell, so the rider does not flicker between attached and hanging when a signal crosses a boundary for one frame.

## 6. Compute strain from causes, not speed alone

Use measured or estimated signals such as:

- Unplanned acceleration/jerk relative to the expected stunt trajectory.
- Relative pelvis displacement and velocity from the seat frame.
- Grip target error and relative hand velocity.
- Roll/pitch error relative to the current support plane and intended maneuver.
- Contact-normal impact severity, especially off-center wheel or chassis contact.
- Sustained balance error during a manual, grind, or side-wheel balance.

Normalize these to tunable gameplay ranges. A conceptual strain accumulator is:

`next = clamp(current + dt * (weightedInstability - recoverableSettling), 0, 1)`

The formula is illustrative, not a finished physical model. Choose weights from visible playtests. Separate quick hard-impact release from slowly accumulated balance loss. Release latches and reattachment rules should be deterministic given the same simulation state, not random comedy rolls.

**Do not count a supported, commanded inversion as automatic loss of balance.** During a clean air trick, expected pose and angular motion rotate with the vehicle. Grounded balance, planned aerial motion, and uncontrolled tumbling require different reference frames.

Speed may amplify the consequences of steering demand and impacts. It is not itself an instability event. A high-speed straight must be repeatably survivable; a gentle stationary lean must not launch a person across the park.

## 7. Landing evaluation

Evaluate contact against the actual landing surface normal, not always world up. A correct landing on a sloped transition can be safer than the same velocity into flat concrete.

Consider incoming normal speed, residual angular velocity, yaw relative to travel, wheel/chassis contact order, and support formation. For intuition, incoming normal speed is the negative portion of relative velocity dotted with the contact normal. This helps distinguish fast travel along a ramp from a hard arrival into it.

Use forgiving but bounded landing assist. It may damp small residual rotation or help settle plausible wheel contacts; it may not rotate an inverted bike upright through the floor.

Classify outcomes as clean, sketchy/recoverable, or severe. Expose the reason in debug telemetry. A sketchy landing enters rider strain and reduces score quality; a severe landing may detach the rider. Recovery that follows must result from the player's actions and actual available space.

The exact angle/speed thresholds are tuning hypotheses. Test them across flat surfaces, transitions, rails, and asymmetric front-wheel contacts rather than selecting one screenshot-friendly number.

## 8. Release without the explosion bug

At the moment a driven skeleton becomes physical, initialize the physical bodies from the current posed bones in world space. Preserve the real accumulated motion.

For body point `p`, inherit vehicle/root motion approximately as:

`v_body = v_root + omega_root × (p - center_of_mass) + v_relative_pose`

The last term represents actual relative pose motion when available; bound noisy numerical estimates. If bodies already exist and are physically moving in a hanging state, retain their real velocities rather than reinitializing them from the vehicle.

The default bail should not add an arbitrary giant outward impulse. Speed, angular motion, and contact already create the trajectory. A small authored exaggeration may be added for a clearly labeled chaos preset, consistently and with limits.

At release, stop animation from resetting pelvis or limbs. Remove or disable rider-to-vehicle constraints exactly once. Preserve skeleton parent-space conversions so the visible mesh follows the physical bodies without a bind-pose snap or doubled root transform.

Prevent body intersections when activating contacts. Use narrowly scoped collision filters during the transition, only long enough to clear initial overlap, then restore sensible contact rules. Never disable all world collision for the ragdoll because it is easier.

Joint constraints, collision margins, mass ratios, solver settings, and damping need real stress tests. Anatomical limits should prevent elbows reversing or shoulders stretching metres. Funny floppiness is not an exploding rig.

## 9. Recovery: bring him back, do not teleport him back

Recovery requires at least one remaining grip, manageable relative speed, sufficient seat proximity, and a vehicle pose where recapture is plausible. A valid player Brace/counterbalance input may increase assistance inside that window.

Blend toward the seat over a short interval with collision-aware movement. Reacquire hip/foot targets in sequence; the hands should not jump across the bars. Abort if a new impact or rapid relative separation invalidates the window.

After recovery, allow a brief settling period before another low-level signal can throw the same rider straight back into hanging. Do not protect against genuine severe collisions.

A full detach is final for the current attempt. Midair magic remounts are not first-release mechanics. Reset is fast enough that they are unnecessary.

## 10. Score and comedy events

Emit immutable semantic events, with a run ID and simulation timestamp: `trick_completed`, `landing_clean`, `landing_sketchy`, `hang_entered`, `grip_lost`, `rider_recovered`, `rider_detached`, `empty_bike_settled`, `combo_banked`, `prop_settled`, and `run_reset`.

These names are proposed contracts. Implement the actual data schema rather than pretending a JSON bank is sufficient.

Scoring consumes valid trick and contact records. The comedy director consumes event context. Captions that rely on an outcome need the outcome's observed data, not a timer predicting it.

Deduplicate contact events so a multi-collider impact does not trigger five identical laughs. Stop queued barks on reset and pause. A joke's effect is audio, text, or an NPC reaction; it cannot silently change vehicle balance or force a missed landing.

## 11. Replays and reset

Keep a bounded transform/event ring buffer, initially around 10 seconds at a proposed 30 samples per second. Interpolate playback, retain all relevant bone/body states, and verify memory use. This is a starting budget, not a measured performance claim.

Choose the main camera target by state. Record enough framing/event information to show separation without losing either subject. Saved replay data is not an encoded video file.

Reset must clear old constraint handles, velocities, trick accumulators, grip latches, score windows, audio queues, and local props when appropriate. Repeated resets should not leak bodies, GPU resources, or event listeners.

Maintain validated safe spawns on usable surfaces, outside rails and props. A last-safe transform needs orientation and clearance, not just the last position that had wheel contact. Reversing away from an obstacle should work without resetting.

## 12. Performance and honesty

Measure the actual imported assets. Simplify with evidence, preserving Ryker identity and rider silhouette. Favor sensible shadows, controlled resolution, static park batching/instancing, and limited active props before destroying source detail.

Use continuous collision detection or an equivalent tested sweep strategy where fast motion risks missed contact; verify the chosen physics version's API rather than copying an obsolete name. [T1]

Target a smooth desktop experience, but report measured browser, hardware, resolution, frame-time distribution, and test duration. No “60 FPS everywhere” claims. A single rendering screenshot is not performance or physics evidence.
