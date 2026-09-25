# Sources and scope

Accessed September 25, 2026. These references support only the factual statements identified in the documents. Gameplay, dialogue, tuning, architecture, map design, and milestones are original proposals, not copied specifications.

## Video and related coverage

**U1 — User-supplied reference; NOT successfully viewed**  
https://www.youtube.com/shorts/ieCOgCEtXfY

**S1 — Jalopnik, November 2, 2021, Jason Torchinsky**  
https://www.jalopnik.com/watch-a-dude-with-a-3-wheel-motorcycle-do-something-bre-1847983333/  
Supports the reported general sequence of a Ryker skatepark loss of control and the rider hanging onto its controls. Secondary reporting; does not prove the exact supplied Short was watched.

**S2 — CarThrottle, Matt Robinson; page displays an October 10, 2024 update**  
https://www.carthrottle.com/news/trikes-skatepark-excursion-even-more-disastrous-youd-expect  
Additional secondary description of a Ryker descending a ramp, hanging-on loss of control, and a flip. No exact-video/edit equivalence claimed.

**S3 — ViralHog catalog**  
https://viralhog.com/watch/category/skateboard%20crash  
Catalog listing for “Man Wrecks Can-Am Roadster at Skatepark,” dated November 1, 2021. The linked individual page at `https://viralhog.com/watch/file/303473372` did not load successfully. The catalog is not footage analysis.

## Repository sources read through the connected GitHub account

**R1 — Observed source HEAD**  
https://api.github.com/repos/DanielKinsner/slingmods-three-wheel-tour-rebuild/commits/main  
Returned commit `a3b6384a3c0e07a4da29866a655399597b87fbc7` during this session.

**R2 — Purchased biker manifest and tree**  
https://github.com/DanielKinsner/slingmods-three-wheel-tour-rebuild/blob/main/public/assets/drivers/biker/manifest.json  
https://api.github.com/repos/DanielKinsner/slingmods-three-wheel-tour-rebuild/git/trees/e95b48a085dd2ceb430bbc1a37374dda450278f3?recursive=1  
Manifest content and directory entries read; binary not independently imported or rendered.

**R3 — Ryker-specific purchased biker fit**  
https://github.com/DanielKinsner/slingmods-three-wheel-tour-rebuild/blob/main/public/assets/drivers/biker/fit-ryker.json  
Beginning of fit data read, including root names, basis, and arm/grip targets. Complete fit/rig remains an implementation inspection task.

**R4 — Ryker runtime directory at observed revision**  
https://api.github.com/repos/DanielKinsner/slingmods-three-wheel-tour-rebuild/contents/public/assets/ryker?ref=a3b6384a3c0e07a4da29866a655399597b87fbc7  
Supports candidate paths and recorded file sizes. File listing is not a local binary availability guarantee.

**R5 — Repository Ryker README**  
https://github.com/DanielKinsner/slingmods-three-wheel-tour-rebuild/blob/main/assets/ryker/README.md  
Conversion history and candidate editable-source paths. Its header explicitly notes that current work supersedes older visual-only limitations.

## Primary technical documentation

**T1 — Rapier JavaScript rigid-body guide**  
https://rapier.rs/docs/user_guides/javascript/rigid_bodies/  
Basic body types, forces/impulses, colliders, and continuous-collision features. Verify exact chosen-version APIs before implementation. This source is not validation of our proposed vehicle or ragdoll controller.

**T2 — Three.js SkeletonUtils**  
https://threejs.org/docs/pages/module-SkeletonUtils.html  
Skeleton-aware cloning and retargeting utilities; runtime compatibility still needs testing.

**T3 — Three.js SkinnedMesh**  
https://threejs.org/docs/pages/SkinnedMesh.html  
Relationship of skinned geometry, bone weights/indices, and skeleton. Does not imply the supplied model is already a working physics ragdoll.
