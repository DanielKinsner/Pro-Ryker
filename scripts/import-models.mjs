// Copies the licensed Ryker + biker runtime models into public/assets/models/.
// They are git-ignored (owner-purchased / licensed). Source order:
//   1. a local SEND IT checkout beside this repo (../SEND IT/slingmods-send-it)
//   2. the SEND IT model host (public-but-unlisted), so any machine can bootstrap.
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const OUT = 'public/assets/models';
const FILES = [
  ['rider/biker-rider.glb', 'biker-rider.glb'],
  ['rider/fit-ryker.json', 'fit-ryker.json'],
  ['rider/manifest.json', 'rider-manifest.json'],
  ['ryker/ryker-900-complete.glb', 'ryker-900-complete.glb'],
  ['ryker/rear-rig.json', 'ryker-rear-rig.json'],
];
const LOCAL = [
  resolve('../SEND IT/slingmods-send-it/public/assets/vehicles'),
  resolve('../slingmods-send-it/public/assets/vehicles'),
];
const HOST = 'https://slingmods-send-it-models.vercel.app/assets/vehicles/';

mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const prov = { importedAt: new Date().toISOString(), files: [] };
const localRoot = LOCAL.find((p) => existsSync(join(p, 'ryker')));

for (const [src, dst] of FILES) {
  const out = join(OUT, dst);
  let from;
  if (localRoot && existsSync(join(localRoot, src))) {
    copyFileSync(join(localRoot, src), out);
    from = join(localRoot, src);
  } else {
    const r = await fetch(HOST + src);
    if (!r.ok) throw new Error(`download failed ${src}: ${r.status}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    from = HOST + src;
  }
  const buf = readFileSync(out);
  prov.files.push({ file: dst, from, bytes: buf.length, sha256: sha(buf) });
  console.log(dst, buf.length, 'from', from);
}
prov.note =
  'Ryker 900 (Three-Wheel Tour source, via SEND IT runtime import) and owner-purchased biker rider. Not for redistribution; git-ignored.';
writeFileSync(join(OUT, 'provenance.json'), JSON.stringify(prov, null, 2));
