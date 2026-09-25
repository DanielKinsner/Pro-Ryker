import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  resize(): void;
  followShadow(target: THREE.Vector3): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  // Late-afternoon autumn sun (warm, fairly low → long shadows, like the clip).
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(215));
  const sky = new Sky();
  sky.scale.setScalar(4500);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2;
  u.rayleigh.value = 1.35;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Environment for PBR reflections (paint, chrome, visor).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(4500);
  Object.assign(envSky.material.uniforms.turbidity, { value: 3.2 });
  envSky.material.uniforms.rayleigh.value = 1.35;
  envSky.material.uniforms.mieCoefficient.value = 0.004;
  envSky.material.uniforms.mieDirectionalG.value = 0.82;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  // A warm ground bounce so undersides aren't black.
  const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(4000, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9c7a70' }));
  groundEnv.position.y = -10;
  envScene.add(groundEnv);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.7;

  scene.fog = new THREE.Fog('#c9d6e3', 140, 900);

  const hemi = new THREE.HemisphereLight('#cfe0ff', '#8a6a5c', 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0dc', 3.1);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const S = 46;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const texel = (2 * S) / 4096;
  return {
    renderer,
    scene,
    camera,
    sun,
    sunDir,
    resize,
    followShadow(target: THREE.Vector3) {
      // Snap to shadow texels to avoid shimmering while moving.
      const x = Math.round(target.x / texel) * texel;
      const z = Math.round(target.z / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x, 0, z).addScaledVector(sunDir, 150);
    },
  };
}
