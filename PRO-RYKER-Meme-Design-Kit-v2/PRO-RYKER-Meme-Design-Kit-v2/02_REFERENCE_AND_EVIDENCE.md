# Reference and evidence ledger

## A. Authoritative user requirements

Dan supplied `https://www.youtube.com/shorts/ieCOgCEtXfY` and asked for a Ryker skatepark game inspired by the meme, with exaggerated skateboard-style tricks, ragdoll physics, the existing Ryker and rider models, and substantial comedy.

He explicitly corrected the initial interpretation: the rider can drive the vehicle and rotate with it while remaining attached. Speed/balance situations may eject him. The player need not make the bike flip independently below an airborne rider.

Those instructions govern version 2. The original package's independent-bike catch system, backward-seated catch, engine-off boot-push opening, and separated-rider proof milestone are superseded. Do not accidentally reintroduce them through an older JSON bank or kickoff.

## B. What was actually accessible

The supplied YouTube Shorts page, ordinary watch page, mobile page, and embed routes did not provide playable or frame-inspectable footage through the available access paths. No successful video download, playback, audio review, duration measurement, or frame extraction occurred.

An exact-video-ID web search found discussion linking that ID, but discussion is not visual evidence. Additional searches retrieved coverage of a Ryker skatepark incident, including Jalopnik's November 2, 2021 article and CarThrottle's account. Those articles describe a loss of control around skatepark transitions, the rider hanging onto the controls, continued acceleration, and an eventual crash. [S1, S2]

ViralHog also has a catalog listing for “Man Wrecks Can-Am Roadster at Skatepark.” Its individual video page was not successfully retrieved. A catalog match does not establish that Dan's exact Short contains the same length, framing, edit, captions, or audio. [S3]

**Status:** related incident coverage retrieved; exact supplied edit and frame sequence unverified. No claim is made that the author watched the video.

## C. Translation into the game

The following are design choices informed by Dan's instructions and the general situation described in coverage, not observations of specific frames:

| Basis | Game translation | Status |
|---|---|---|
| Ryker in a skatepark | Ordinary outdoor concrete park with inappropriate vehicle | User-confirmed premise |
| Rider stays with the vehicle | Shared flips with compliant riding posture | User-confirmed correction |
| Loss of control / hanging on described in coverage | Recoverable partial detachment before full ragdoll | Original mechanic based on general situation |
| Continued momentum across transitions | Signature downhill-to-opposing-bank line | Proposed topology; exact clip geometry unverified |
| Meme/comedy request | Awkward body posture, delayed reactions, sparse dry lines | Original creative work |
| Ridiculous physics request | Assisted launches, aerial rotation, rails, manuals, survivable slapstick | Original gameplay design |

Do not confuse source fidelity with real-life simulation. Once the reference is visually available, preserve recognizable staging and escalation while deliberately exaggerating the playable outcomes.

## D. Footage-specific fidelity pass, still outstanding

When the video itself becomes available to the implementing agent, inspect the actual clip and record: access method, filename or URL, measured duration, broad shot order, rider posture changes, vehicle direction changes, major contacts, separation moment, and camera behavior. Use real timecodes only after measuring them.

Identify three to five visual beats worth translating into the signature game line. Mark each as directly visible, obscured, or inferred. Distinguish a longer incident recording from the exact meme edit Dan sent. Do not invent dialogue or use an article's account as a transcript.

This pass may adjust bank ordering, framing, reaction timing, and hanging-on poses. It must not silently reverse Dan's explicit instruction about whole-assembly tricks. It also must not block unrelated safe work such as asset validation or initial rider-state engineering.

The final build report must retain “reference fidelity unverified” until actual footage review has happened. Core gameplay may be evaluated independently; clip-based claims may not.

## E. Asset verification boundary

GitHub returned the current source-repository commit metadata, the Ryker runtime directory, the purchased biker manifest, its Ryker fit data, and directory entries for the model files. These establish useful paths and recorded metadata. They do not prove a local clone contains all required bytes, that animations render correctly, or that a ragdoll exists.

See `04_ASSET_HANDOFF.md` for paths and source labels. This package did not import or render the models and does not include their binaries.
