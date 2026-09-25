import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Licensed models are git-ignored. Dev: public/assets/models (npm run import-models).
// Production can point VITE_MODEL_BASE at the SEND IT model host.
const BASE = import.meta.env.BASE_URL;
const MODEL_BASE: string = import.meta.env.VITE_MODEL_BASE ?? '';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

export const MODELS = {
  ryker: 'assets/models/ryker-900-complete.glb',
  rider: 'assets/models/biker-rider.glb',
  fit: 'assets/models/fit-ryker.json',
};

/** Where the same files live on the SEND IT model host. */
const HOST_PATHS: Record<string, string> = {
  [MODELS.ryker]: 'assets/vehicles/ryker/ryker-900-complete.glb',
  [MODELS.rider]: 'assets/vehicles/rider/biker-rider.glb',
};

export async function loadGLB(path: string, onProgress?: (f: number) => void): Promise<GLTF> {
  const tryUrl = (url: string) =>
    new Promise<GLTF>((resolve, reject) =>
      loader.load(
        url,
        resolve,
        (e) => {
          if (e.total) onProgress?.(e.loaded / e.total);
        },
        reject,
      ),
    );
  // Production: the model host first (the build ships without the licensed binaries).
  if (MODEL_BASE) {
    try {
      return await tryUrl(MODEL_BASE + (HOST_PATHS[path] ?? path));
    } catch {
      /* fall through to a local copy */
    }
  }
  try {
    return await tryUrl(BASE + path);
  } catch {
    throw new Error(`Model missing: ${path}. Run "npm run import-models".`);
  }
}

export async function loadJSON<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
  return r.json();
}
