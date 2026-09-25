# SLINGMODS: PRO RYKER
## HOLD ON. IT GETS WORSE.

**Design proposal · Version 2 · September 25, 2026**

The numbers, missions, names, choreography, and jokes below are original proposals for playtesting. They do not describe a completed game or claim frame-by-frame fidelity to the linked video. Reference status is recorded separately in `02_REFERENCE_AND_EVIDENCE.md`.

## 1. What we are making

A detailed, believable Can-Am Ryker enters an outdoor skatepark. A detailed, believable adult biker is driving it. Nothing about either of them suggests that the next sensible action is a kickflip.

The player does one anyway.

**The entire rider-and-Ryker assembly rotates together.** His hands remain on the handlebars, his hips mostly stay with the seat, and his body flexes with the motion. He lands, chassis-grinds a rail, gets the rear wheel up into a nose manual, wobbles, nearly loses the seat, and either wrestles himself back into place or leaves the vehicle at a deeply inconvenient angle.

That is the game: a surprisingly good arcade trick system inside an increasingly stupid physical predicament.

It should feel as though the player is trying to turn a viral skatepark disaster into the successful stunt the rider probably imagined—not watching a predetermined disaster on every attempt. That interpretation is our creative direction, not a factual claim about the real rider's intent.

**The one-sentence pitch:** a Tony-Hawk-style combo playground where a Ryker is wildly overqualified to accelerate and wildly underqualified to be a skateboard.

### Four things that must survive every implementation decision

1. You are actually driving a recognizable Ryker, using Dan's existing model and purchased biker.
2. Rider and vehicle can perform absurd flips together; successful tricks do not require a separated rider catching the bike.
3. Losing control has a visible middle: slipping, hanging on, recovering, then sometimes a full ragdoll separation.
4. The game is fun to play well, and funny to play badly. Neither outcome makes the player wait through a long reset.

### What this is not

Not a real-world motorcycle simulator. Not a literal recreation of an identifiable person's accident. Not a motorcycle wearing a skateboard as a cosmetic. Not a fixed sequence of crash animations. Not a game about injuring spectators. Not a reskin of Three-Wheel Tour's racing modes. Not SEND IT's parcel-delivery loop.

The municipal-sign humor is a garnish. **The actual protagonist of the comedy is a man trying to keep driving while his body has other plans.**

## 2. The first playable minute

Start at the lip of a modest concrete bank. The Ryker is already running. The rider adjusts his gloves; someone in the background has a phone out. There is no mandatory cinematic and no long trip from a garage.

A concise overlay teaches throttle and brake. Three seconds of driving demonstrate that steering is responsive and the bike has convincing weight. A small bank invites a pop. Holding the trick modifier and steering rolls the whole bike and rider around once. All three tires return to concrete with a hefty suspension compression.

The first line of text is not a lore introduction:

**KICKFLIP. APPARENTLY.**

On the next transition, overcooking the landing makes his boots slip. His hips lift from the seat. His arms extend as the bike carries on beneath him. The warning reads **HANG ON**, paired with a directional balance cue.

Ease off, counterbalance, hold Brace: he pulls himself back into place and continues. **MEANT THAT.**

Ignore the warning or hit the next lip sideways: his last grip lets go. Now the character is a jointed ragdoll with the momentum he actually had. The Ryker continues separately. You may watch it unfold or reset immediately.

A spectator, after the loudest noise has ended:

> "Bike's still having a good time."

Every element in that minute teaches the final game. There is no tutorial-only mechanic that disappears afterward.

## 3. Driving should feel powerful, not cumbersome

Use familiar vehicle controls and immediate arcade responsiveness. The Ryker accelerates briskly, brakes decisively, reverses reliably, carves wide bowl transitions, and can break traction into a controllable powerslide.

Low-speed maneuvering should be easy enough to line up a rail without a three-point-turn simulator. At high speed, the useful turning radius widens, but the game never silently disables steering. A drift input trades grip for yaw, letting practiced players aim through tighter lines. Releasing it lets the tires recover progressively rather than snapping the vehicle sideways.

The vehicle should sound and move as though it has mass: suspension dips under braking, the front pair bob independently over small seams, and the rear tire scrubs through a powerslide. These details sell the absurdity of the launch; they must not make traversing the park exhausting.

### Speed is a risk amplifier, not an eject button

A clean high-speed straight is stable. A clean, planned flip can remain stable even while upside down. Risk comes from what the player does with that speed: abrupt sideways landings, entering an uneven lip diagonally, overcorrecting a manual, or demanding an impossible turn while already slipping.

Do not write `if speed > threshold: eject rider`. That gives the player arbitrary punishment instead of a physical joke they understand.

Braking and reducing throttle are genuine recovery tools. A player who recognizes the problem should have a meaningful chance to save it.

## 4. Controls: simple enough to learn, deep enough to combine

The initial design targets keyboard and controller. Touch can follow once the central mechanic is good; do not advertise mobile support merely because the canvas fits a phone screen.

| Action | Keyboard proposal | Controller proposal |
|---|---|---|
| Accelerate | W | Right trigger |
| Brake / reverse after stopping | S | Left trigger |
| Steer / balance | A / D | Left stick horizontal |
| Pop from a ramp or small flat-ground hop | Space | South face button |
| Air-trick modifier | Hold J + direction | Hold west face button + left stick |
| Air spin modifier | Hold K + A / D | Hold east face button + left/right |
| Grind / manual modifier | Hold E + context/direction | North face button + context/direction |
| Drift on the ground | Left Shift | Right bumper |
| Brace / attempt recovery | Left Ctrl | Left bumper |
| Deliberately let go, outside primary competition | Hold X | Hold both bumpers in Free Skate only |
| Restart at last safe spawn | R | View/back button; remappable |
| Pause / controls | Esc | Menu |
| Open last replay when safely stopped | Tab | A pause-menu action |

These are proposed mappings, not sacred key choices. Remap conflicts after real simultaneous-key and gamepad testing. Display the active device's glyphs. Never steal common browser shortcuts. Game input owns keys only while the game has focus.

### Trick input behavior

Airborne J + left/right requests a roll; J + forward/back requests a front/back rotation. K + left/right requests a yaw spin. The modifiers explicitly prevent accidental braking or acceleration commands from being interpreted as tricks. Direction becomes lean/air control when appropriate, not an unrelated world-axis movement.

A short buffered press can request one rotation. Holding or re-inputting requests more, within the available airtime. The screen shows the committed trick and whether another rotation would be an overcommit. Skilled players can override a conservative warning; the system should not force them into the beginner route forever.

Brace is not an invulnerability button. It reduces decorative looseness and helps the rider recenter while limiting trick acceleration and increasing control damping. Holding it throughout a run makes you safer but less spectacular. You must still aim the landing.

Grinding uses a contextual capture window around authored rails/coping. Manual entry has an intentional directional gesture on the ground. The same button must not randomly choose between a grind and a manual when both are possible: show which candidate is selected and use explicit priority rules.

## 5. The trick vocabulary

The labels borrow the readability and combo rhythm of skate games. The physics are an unapologetic Ryker parody, not a claim that a seated roll is a technically authentic skateboard kickflip.

| Trick | Motion | What makes it funny |
|---|---|---|
| Ryker ollie | Suspension compresses, then the whole vehicle pops | An implausibly tiny preparation launches a substantial machine |
| Kickflip / heelflip | Bike and attached rider roll together | He continues gripping the bars as though this were routine steering |
| Shove-it 180 / 360 | Whole assembly yaws in the air | He is still seated and driving; no floating-rider catch state |
| Varial | Coordinated roll plus yaw | The rider's attempt at composure lags behind the vehicle |
| Backflip / frontflip | Full assembly rotates end over end | Boots momentarily lighten; hands stay committed |
| Chassis boardslide | Vehicle turns sideways across a rail | Sparks, a deep scrape, and a determined seated man |
| Straight chassis grind | Vehicle travels along a rail aligned with its path | The entire road vehicle occupies a space meant for a board |
| Rear-wheel manual | Front pair lifted, one rear tire supports the bike | Tiny body corrections are trying to govern a large front end |
| Nose manual | Rear wheel lifted, front pair supporting | The rider approaches the dashboard with mounting concern |
| Side-wheel balance | Rear plus one front wheel; other front lifted | His inside knee decides it wants to participate |
| Revert / powerslide link | Quick ground yaw after landing | A reasonable-looking riding move rescues an unreasonable trick |
| Wall tap / wall ride | Brief assisted contact on selected banked surfaces | It looks like confident improvisation, until it doesn't |

Real rotation and sustained contact must support every scoring label. No point award merely because the player pressed the right button. No phantom grind a metre away from the rail.

### Three special moves for the first polished release

**THE MID-LIFE VARIAL**  
A fast combined yaw-and-roll with the rider still aboard. His torso leans late and his boots briefly float, then he regains the exact same driving pose. A clean landing earns one tiny jacket adjustment, not a victory dance.

**THE UNLICENSED SUPERMAN**  
A deliberately extended airborne pose: hips lift, legs trail, both hands retain the bars. This is an authored show-off pose while control is intact. It must look and behave differently from an involuntary hanging-on state. Player release returns toward the seat; a bad impact can still convert it into a real bail.

**THE THREE-POINT TURN**  
A yaw-heavy aerial trick into a short nose balance and ride-out. The name is pedestrian; the thing on screen is absolutely not. Do not make it a canned multi-stage teleport. Each phase has physical space and a failure condition.

Later moves may be added once these read well. Do not build thirty nearly identical rotations with increasingly long names before one landing feels good.

## 6. The feature that makes this game ours: HANG ON

The rider is not welded to the seat, but he is not a helpless sack from the moment the game starts. His connection has states:

**Seated → unsettled → hanging on → recovered, or fully detached.**

### Seated

Hips near the seat, feet near the pegs, hands on grips. Head, spine, elbows, and knees have controlled secondary motion. Successful stunt rotation carries him with the bike. He remains recognizable, not a flailing starfish during every ordinary turn.

### Unsettled

One boot loses a peg. Hips slide sideways. Shoulders twist under braking. The rider is still mostly driving, and the player still has strong control. Show a brief directional lean warning, a glove creak, or a foot slap against the bike. Do not shout about every minor wobble.

### Hanging on

The seat connection is lost, but one or both hands still hold. This is where the meme energy lives: the vehicle keeps moving while the rider becomes an increasingly bad passenger on his own decisions.

His hips can trail. His legs can kick. One hand may slip before the other. His body should respond to the actual direction of travel; it must not always fall into the same preauthored Superman pose.

Throttle eases when the player lets go. For the main score mode, there is no invisible stuck accelerator. A separate opt-in chaos modifier may exaggerate the panic-acceleration feedback as a fictional arcade rule with a visible cue and a hard duration cap.

The rider can recover when relative motion, grip strain, and vehicle alignment become manageable. Brake, counterbalance, and Brace help. He cannot teleport through the chassis or haul himself from three metres away.

### Fully detached

All rider-to-vehicle grips release. The person and bike become separate physical outcomes. Steering inputs no longer control the empty vehicle, and the detached rider cannot score normal tricks or instantly remount in midair.

The player can watch the bail. The game never requires it. Reset is available immediately, with no long fade, hospital, tow truck, or repair bill.

### A real recovery must feel better than a free pass

One front wheel comes down first. The rider's right boot slips. He leans too far, catches himself by the bars, scrapes a boot along the surface, and hauls himself back aboard just before the next bank.

**STILL COUNTS.**

That moment should often be more satisfying than the preceding flip. Reward a genuine save modestly, once per instability episode, and do not let players farm it by wobbling in place.

## 7. Modes, scoring, and progression

### Park Session

A two-minute run on one connected map. You choose lines, bank combos, and beat local records. At time expiry, allow the current combo a short, capped finish window; no endless overtime manual.

A provisional combo is the sum of valid trick/gap values multiplied by a capped variety multiplier. Grind/manual points accrue through meaningful travel, not elapsed time while stationary. Duplicate tricks depreciate inside the combo. A trick only counts after its actual motion is complete and its required landing/contact has been satisfied.

Normal grounded travel without a link move banks the combo after a short interval. A full rider detachment loses unbanked score. Previously banked score is never stolen for a joke.

A sketchy but recoverable landing may retain the combo with reduced trick quality. A severe crash cannot be relabeled a sketchy success because the bike eventually bounced upright without its rider.

### Free Skate

No timer. Immediate retry. Choose a safe spawn. Practice a rail, learn how far a jump carries, deliberately test the ragdoll, or find the stupidest way to reach a roof.

A local chaos panel can alter gravity, grip resilience, or launch generosity. Records obtained with modifiers are separate from default-mode records. No hidden stat changes between attempts.

### Save It

Short challenge setups built around recoverable mistakes. You begin just before a known awkward entry and have to ride away. The same mechanics operate in normal play; these are teaching challenges, not scripted quick-time events.

Examples: a sideways wheel touch, an overenthusiastic bank entry, a slipping manual, or one foot off after a rail exit. Use repeatable seeds and actual physics. Give immediate retry at the setup point.

### Incident Report

An optional Free Skate side activity and replay caption system, not the main score economy. Awards commemorate funny outcomes such as the empty Ryker stopping upright in a parking bay. No global leaderboard for injury, no requirement to hit people, and no fake monetary repair accounting.

### Progression

Unlock paint treatments, harmless helmet stickers, replay treatments, park signs, and trick challenges through landed lines and discovery. Do not sell grip strength or grind controls. Do not force twenty low-level runs before the Ryker can do the thing the game advertises.

No shop page is needed to make the first release good. A restrained SlingMods sponsor presence and one optional arcade/footer link are enough. Any later real product integration must distinguish fantasy stunt modifiers from real product claims.

## 8. The park: MUNICIPAL LIABILITY

A fictional outdoor concrete park inspired by the kind of setting in the reported meme, not a verified reconstruction of a real location. Bright, slightly warm afternoon light, clear shadows, concrete with use and texture, metal rails, benches, a chain-link boundary, low urban context, and several spectators who stay off active stunt lines.

Do not lead with a tropical resort, a neon cybercity, or a comedy theme park. The absurd vehicle works best against somewhere recognizable and ordinary. Premium lighting and materials should make ordinary concrete attractive without changing the identity.

Proposed initial footprint: roughly 110 × 85 metres, scaled from measured gameplay needs rather than treated as survey data. Six connected zones share sightlines and return paths.

### A. The Drop-In — signature reference-inspired line

An upper apron leads past a short stair section beside a rollable bank. Below is a trough/runout, then an opposing bank, then a second bowl edge. Provide a safe bypass and generous recovery space.

The topology is the design focus: **commit downhill → gain momentum → meet the next transition while trying to remain aboard**. Exact ramps and distances in the Short remain unverified.

A skilled player can use the same terrain to pop, rotate, land, and link to a rail. A careless player creates the messy hanging-on sequence. Both emerge from the layout; neither is a mandatory cinematic.

### B. Confidence Plaza — learn and warm up

Low banks, wide ledges, a forgiving long rail, flat landing space, and a conspicuous no-motorized-vehicles sign. Spawn close enough that the first trick is seconds away.

Spectators stand on a raised, protected apron with useful sightlines. They animate reactions and film, rather than wandering directly into the player's brakes.

### C. The Commitment Bowl — flow

A readable open bowl with linked hips and coping, larger than the beginner features but not an opaque concrete maze. Multiple exits let a manual carry toward the plaza or the street section.

Transitions must be smoothly collidable. The camera needs to see the next wall and landing. Decorative seams are not collision traps.

### D. The Bad Idea Department — street lines

Stairs, offset rails, ledges, a low wall, and a drainage gap. The Ryker can chassis-slide, grind straight, leave with a shove-it, and bank through a powerslide.

Avoid narrow corridors sized for a skateboard rather than the actual vehicle. A difficult route is deliberate alignment and balance, not snagging mirrors on invisible walls.

### E. The Overcommit — big air

A clear approach, large curved launch, generous landing, and optional riskier transfer. The sky provides a clean silhouette for whole-vehicle tricks and hanging-on poses.

The safe route stays fun. The harder route adds airtime and requires more exact yaw alignment. A launch is generous enough for the proposed tricks; no agent may shrink ramps and then fake extra airtime with unexplained teleports.

### F. Lost & Found — physical comedy and return path

Maintenance shed, benches, light bins, folding chair, and a low roof route. Only a small, controlled subset of props is dynamic. Their initial positions do not block the main route, and a new scored run restores the authored layout.

This area should feel like part of the park, not a room full of joke targets. Physics produces opportunities; it does not need a bright arrow over every bin.

### Three sample lines

**Beginner:** Confidence Plaza bank → full-assembly kickflip → ordinary landing → rear-wheel manual → bank combo.

**Intermediate:** Drop-In → recover an awkward transition → straight grind → yaw spin out → powerslide toward Commitment Bowl.

**Advanced:** Bowl coping → hip transfer → varial → narrow chassis boardslide → nose manual → Overcommit launch → clean ride-out.

Each line has an easy exit. A player can stop performing tricks and return to plain driving without a mode transition.

## 9. Comedy: make physics tell the joke first

The reference-inspired humor is escalating overconfidence, loss of posture, and the gap between what the bike is doing and what the rider is managing. The game should not bury it under nonstop meme captions.

**Priority:** physical action, then a sound or reaction, then an occasional line. Do not stack all three every time.

### Signature physical gags

**The Employee Separation**  
The rider loses the seat, hangs from the bars, slips free, and continues along a completely different trajectory. A beat later: **RIDER DISCONNECTED. VEHICLE UNAFFECTED.** Only trigger if the bike is actually still moving.

**The Bike Gets the Applause**  
The rider is already down and sitting up. His empty Ryker happens to finish a roll on its tires. One spectator gives a restrained clap. Another looks at them. The clap stops. A recognition event, not a scripted force that always makes the bike land upright.

**The World's Worst Superman**  
Both hands remain attached while legs trail behind. A shoe scrapes, knees bend, and his body keeps trying to find the seat. A brief original line: "That's not a Superman. That's a hostage situation." No copying the actual video's soundtrack or voices.

**The Walk of Absolutely Nothing Happened**  
When a completed crash naturally settles and the player elects to watch, the rider gets up, straightens his jacket, takes a few dignified steps, then notices the Ryker is still slowly rolling away. Optional short get-up animation; never a prerequisite for retry.

**The Delayed Chair**  
A crash knocks a chair slightly off balance. Everything goes quiet. The chair completes its actual fall with one metallic clink. Do not randomly topple a stable prop across the park for a joke.

**The Phone Filmer**  
An adult spectator carefully tracks the stunt with their phone. During a wild hanging-on save, they lower it and just look. On a later rare successful run, they keep recording and give a disbelieving head shake. No repeated stock cheering loop.

**The Parking Achievement**  
An empty, upright Ryker rolls slowly into a marked service bay and stops while the rider is elsewhere. **VALET PARKING.** Requires the outcome; never moves the bike into the bay.

**The Boot Audit**  
After a spectacular recovery, the rider glances down to confirm both boots are still where he left them. A glance, not a missing-limb gag.

**The Silent Board Tap**  
A spectator taps their skateboard on the concrete once after an impossible clean trick. The respect is sincere. The vehicle is still ridiculous.

### Language and delivery

The director version may be unfiltered. Keep a separate clean subtitle/voice variant for a public SlingMods build. Profanity is seasoning, not the entire comedic identity. A swear after every wheel touch is less funny than one perfectly timed "Well, shit" after a preventable disaster.

Use dry, conversational performances. The announcer is an amused witness, not a shouty esports host. The municipal employee should appear occasionally, not become a constant lecture about permits.

Original line examples:

> "You added a third wheel and somehow reduced your options."
>
> "The bike has completed the trick. Staffing remains unresolved."
>
> "Still driving. Technically."
>
> "He is no longer the operator. He is an accessory."
>
> "That was an ollie with an engine and no fucking plan."
>
> "You've invented a worse bus stop."
>
> "Strong opening. Several unrelated endings."
>
> "You can't park the man there."

A line requires its trigger to be true. "Still driving" is wrong after full detachment. "One-handed" is wrong while both grips remain. Avoid omniscient commentary about an event the replay did not show.

### The silence budget

At most one optional voice at a time. Aim for no more than six to eight optional spoken reactions in a two-minute run, with longer gaps in practice. Do not repeat the same line within a run. Discard old queued jokes; do not tell the player about a crash after they have restarted and landed another trick.

Near-success frustration deserves less chatter. After several rapid failures, dial the comedy down instead of taunting harder. Muting dialogue must preserve all necessary control feedback.

## 10. Missions and achievements worth attempting

| Name | Requirement | Payoff |
|---|---|---|
| SIR, THIS IS A SKATEPARK | Land a full-assembly flip beyond the entry bank | Establishes the premise immediately |
| I CAN SAVE THIS | Recover from genuine hanging-on and ride ten metres | Unlocks a recovery challenge |
| I CANNOT SAVE THIS | Deliberately let go in Free Skate | Introduces replay/reset without punishing main score |
| STILL COUNTS | Bank a combo after a sketchy landing and recovery | A small cosmetic acknowledgement |
| THE FLOOR IS MOSTLY A SUGGESTION | Link three aerial tricks through valid contacts | Requires deliberate route design |
| TAKE A SEAT | Chassis-slide the plaza bench and ride away | Modest local badge |
| THREE WHEELS, ONE BRAIN CELL | Complete a rear manual, nose manual, and side balance in one run | Demonstrates all balance families |
| VALET PARKING | Empty Ryker genuinely stops upright inside service bay | Optional incident-report stamp |
| CAMERA WAS ROLLING | Land the advanced Overcommit transfer | Unlocks a replay framing preset |
| NOT MY FIRST MISTAKE | Beat your own score after a reset | Celebrates improvement, not grinding chores |
| PLEASE REMAIN SEATED | Finish a run without full detachment | Actually meaningful for the premise |
| THAT WAS ON PURPOSE | Bank a combo after one-hand recovery | Rare, earned, and very shareable |

No mission depends on striking a spectator. No required destruction of expensive real branded products. Scores, achievements, and cosmetics are local in the first release; online competition is later work, not a fake network badge.

## 11. Art, camera, interface, and audio

### Visual direction

Detailed Ryker and leather biker, plausible concrete, polished lighting, understated UI. Use SlingMods red sparingly with charcoal and off-white typography; a cool cyan accent can identify balance/recovery controls. Keep SEND IT's yellow logistics identity separate.

Make the tires, suspension, exhaust, handlebars, and rider silhouette readable in motion. Do not hide the character behind an oversized speedometer. Use actual imported materials, then tune exposure and environment lighting around them. Do not erase hard-surface detail with a blanket low-poly conversion.

The park gets authored variation: worn concrete at contact edges, clean rail highlights, subtle dust, scuffs, and restrained prop color. Avoid noisy decals everywhere. Daylight shadows are gameplay depth cues as much as decoration.

### Camera

An elevated trailing camera sees both the next transition and the rider. During aerial rolls the camera preserves a comfortable world horizon; it does not barrel-roll with the bike. Widen framing slightly for big air and genuine hanging-on so the body remains legible.

At full separation, smoothly prioritize the rider while keeping the Ryker in view when feasible. Do not zoom so far out that both become ants. A short optional replay can show alternate views afterward.

Use collision avoidance and occlusion handling so the camera does not pass through concrete, rails, or scenery. Do not frame the ground while the rider leaves the screen. Reduce shake, disable cinematic motion, and offer a stable-camera setting.

### Interface

Score and remaining run time at the top; current combo/trick at lower center; a compact balance cue only when relevant. Normal play is not permanently plastered with danger meters.

The integrity/recovery indicator uses text and shape as well as color: **SEATED**, **WOBBLY**, **HANG ON**. Do not show a fake medical injury bar. A crash gets a concise failure cause and immediate retry prompt.

During a run the menu is one pause away. Results offer **Run Again**, **Free Skate**, and **Last Replay**. No hidden reset inside a garage or career screen.

### Sound

The motor gives useful throttle and speed feedback without filling every frequency. Tire contact changes by slide, landing, and surface. A landing combines suspension, tire slap, and a little mechanical clatter. Rail slides sound substantial, not like a toy zipper.

Physical comedy uses small detail: glove strain, a boot scrape, a jacket rustle, a chair clink. No constant cartoon boings, canned screams, or injury effects. Non-gory impacts can be funny without sounding like actual suffering.

Music is original or properly licensed instrumental skate energy: punchy drums, bass, guitar or electronic grit, and room for contact sounds. Do not extract the video's song or copy a Tony Hawk soundtrack. Music, engine/effects, and dialogue have separate controls.

### Replay

Record recent transforms, articulated poses, and game events in a short ring buffer. Offer slow motion and an optional phone-filmer angle; do not interrupt active score play with surprise slow motion. Replays show what happened, not a re-simulation that invents a different crash.

Keep a clean cinematic option. Optional captions attach to true event timestamps. A generated replay is not automatically a downloadable MP4: video encoding/export is a separate feature and must be labeled honestly.

## 12. What the first release should contain

One Ryker. One existing biker. One excellent connected park. Reliable drive/brake/reverse. Whole-assembly aerial tricks. Two grind styles. Rear and nose manuals. Visible unsettled/hanging-on/full-bail transitions. Recoverable saves. Two-minute runs, Free Skate, local records, a handful of challenges, replay, and immediate retry.

A smaller polished set is not permission to deliver a box-on-ramp prototype. The first release should already look like this game. Additional vehicles, multiplayer, alternate parks, extensive customization, and a sprawling career are expansions after the core is convincing.

### The first evidence gate

Show an uninterrupted playable sequence with the real models: drive into the park, flip together, land, wobble into a recoverable hang, ride away. On another attempt, a visible mistake must produce a momentum-consistent articulated ejection and fast reset.

A pretty still render, a rigid bike with a detached camera, a placeholder capsule rider, or a successful compile does not pass this gate.

**The final creative rule: exaggerate the situation, not the paperwork. Make it a machine you love controlling, with a man you cannot quite believe is still on it.**
