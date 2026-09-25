# PRO RYKER — Hold On. It Gets Worse.

A Tony Hawk's Pro Skater–style browser game starring Dan's real Can-Am Ryker 900 and the owner-purchased biker,
based on the viral "man wrecks Can-Am at skatepark" clip. The signature mechanic comes straight from the footage:
when he gets thrown off the seat he **keeps holding the bars and gets dragged** — and his weight on the grip opens
the throttle. Brake, mash Space, haul him back on, and the whole combo still counts.

## Run it

```bash
npm install
npm run import-models   # copies the licensed GLBs from a SEND IT checkout, or downloads them from its model host
npm run dev             # http://localhost:5210
```

```bash
npm test                # 33 unit + headless-physics tests
npm run build           # static build in dist/ (relative base: works at / or nested)
npm run gen-audio -- vo # (re)generate ElevenLabs audio; needs ELEVENLABS_API_KEY in .env.local
```

**Models are not in Git** (purchased/licensed). `import-models` finds `../SEND IT/slingmods-send-it` or falls back to
`https://slingmods-send-it-models.vercel.app`. **The original clip is not in Git either** (it's ViralHog-licensed):
the "Based on True Events" unlock embeds ViralHog's own YouTube upload, so it works everywhere with nothing to copy.
Optional: a local copy at `public/media/original.mp4` (git-ignored, never deployed) plays instead when you're offline.

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Gas / brake-reverse | W / S | RT / LT |
| Steer · spin in the air | A / D | Left stick |
| Ollie (hold to charge, release to pop) | Space | A |
| Flip trick + direction | J | X |
| Grab trick + direction (hold; let go before landing!) | K | B |
| Grind (near a rail) · manual (ground; W/S balance) | L | Y |
| Revert (just after landing) · powerslide (with steering) | Shift | RB |
| **Hanging on:** brake + mash to haul him back | S + Space | LT + A |
| Let go on purpose | X | LB |
| Reset · pause · horn | R · Esc · H | Back · Start |
| Watch the incident replay (after a bail) | Backspace | — |

Specials (fill the meter): ↑↓+J, ←→+J, ↓↑+J, ↑↑+K, ←→+K.

## What's in it

See `docs/DESIGN.md` for the design decisions, `docs/HANDOFF.md` for status, verification and known gaps, and
`PRO-RYKER-Meme-Design-Kit-v2/` for the original creative brief.
