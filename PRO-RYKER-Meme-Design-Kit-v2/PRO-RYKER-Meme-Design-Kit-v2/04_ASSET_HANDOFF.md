# Existing asset handoff

## Source repository: read-only

`DanielKinsner/slingmods-three-wheel-tour-rebuild`

The GitHub connection returned `main` at commit:

`a3b6384a3c0e07a4da29866a655399597b87fbc7`

This was the observed revision during preparation on September 25, 2026. It is a reproducible reference, not a promise that main will remain there. Discover the current local/source state and record the actual import commit. Do not force-reset the user's checkout to this revision. [R1]

PRO RYKER is a separate project. Three-Wheel Tour and SEND IT are not writable staging areas. Do not move, delete, rename, overwrite, reformat, reconfigure, or globally upgrade dependencies in them. Copy only needed, authorized assets/utilities to the new project.

## Observed candidates

| Source path | Evidence and intended use |
|---|---|
| `public/assets/ryker/ryker-900.glb` | Runtime directory entry at observed revision; 13,469,980 bytes; primary Ryker candidate [R4] |
| `public/assets/ryker/manifest.json` | Directory entry; component/scale metadata candidate; fully inspect before import [R4] |
| `public/assets/ryker/rear-rig.json` | Directory entry; rear-motion setup candidate [R4] |
| `public/assets/drivers/biker/biker-rider.glb` | Biker tree entry and manifest; intended purchased leather biker [R2] |
| `public/assets/drivers/biker/manifest.json` | Read successfully; source provenance, stats, fits, grip measurements [R2] |
| `public/assets/drivers/biker/fit-ryker.json` | Read beginning of fit; declares rig roots, coordinate basis, measured arm/grip targets [R3] |
| `assets/ryker/Ryker-Game-Master.blend` | Referenced by repository Ryker README as editable master; byte availability still to verify [R5] |
| `scripts/build-biker-rider.py` | Named in biker manifest as build source; inspect dependencies and original-source availability before executing [R2] |
| `assets/source/brand/slingmods-logo-wide-2000.webp` | Source-tree listing candidate for existing brand art; verify bytes and usage in new build |

Use `public/assets/drivers/biker/fit-ryker.json` for the purchased biker. Do not assume the older `public/assets/ryker/driver-attachment.json` belongs to that same skeleton; it is a separate observed file.

`public/assets/ryker/complete/` also exists. Inspect current loaders/manifests to understand its purpose before deciding whether it supersedes or augments the single GLB. Do not import every historic asset folder merely because it exists.

## Biker metadata actually read

The manifest records 33,544 triangles, 60 joints, nine images, and 1,900,128 bytes. It labels the asset as derived from an owner-purchased rigged biker source, with leather/skin/helmet materials and per-vehicle fits. The original purchase source is described as not in Git. [R2]

Recorded biker SHA-256:

`91d6f7b2621ce586497f9bbc5a77c1b2ab7689fdb27814ffbfc82bf385b7b664`

Compare the local imported bytes before trusting this value. This packet read the manifest; it did not independently hash or render the binary.

The observed fit names `driver_root`, `driver_rig`, `driver_body_visual`, and `driver_head_visual`. It includes arm bones such as `driver_upper_arm_left`, `driver_forearm_left`, and `driver_hand_left`, with corresponding right-side names. These are observed candidates, not a complete skeleton map. Inspect the full rig for pelvis, spine, neck, legs, hands, and feet. [R3]

## Import acceptance

Confirm actual binary content, not a Git LFS pointer or placeholder file. Record source commit, path, byte length, SHA-256, texture dependencies, mesh/material counts, dimensions, scale, and skeleton hierarchy.

Load the vehicle and rider in the chosen runtime. Verify front/rear wheel placement, grip reach, seat and peg positions, steering, materials, normals, and skin deformation. Photograph/render the imported pair from front-quarter, side, rear, and an aerial-test view as evidence.

Do not silently substitute `test-driver.glb` or the older tour rider when the purchased biker import fails. Diagnose the real asset. A temporary proxy is acceptable only as visibly labeled engineering scaffolding, not the final delivery.

Do not automatically execute downloaded source scripts. Inspect them and their input paths first. Never run them in a way that overwrites the original purchased asset. Prefer using the already-exported runtime GLB when the original authoring source is unavailable.

The earlier Ryker README contains historical conversion and physics notes, with a header stating newer playable-vehicle work supersedes old visual-only limitations. Treat those passages as history; do not report old Slingshot-physics limitations as the current game's state without inspecting the current code. This new game will have its own stunt controller regardless. [R5]

## Packaging and deployment

No model binaries are included in this design ZIP. The implementing agent must obtain them from the authorized source checkout. Keep original purchased source material private, preserve provenance, and publish only the intended game runtime output. Do not turn public hosting into an unintended downloadable source-art archive.

Proposed new project slug: `slingmods-pro-ryker`. Proposed eventual arcade path: `/arcade/pro-ryker`. These are design choices, not created repositories, directories, projects, or deployments. Resolve paths and deployment authorization from the actual environment.
