import * as THREE from 'three';
import { makeSky } from './sky';

export interface Stage {
  tick(dt: number): void;
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
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  // Late-afternoon autumn sun (warm, fairly low → long shadows, like the clip).
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(215));
  const sky = makeSky(sunDir);
  scene.add(sky);

  // Environment for PBR reflections (paint, chrome, visor): the same sky, plus a warm ground bounce.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = makeSky(sunDir, 60);
  envSky.onBeforeRender = () => {};
  envScene.add(envSky);
  const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(80, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b08a80' }));
  groundEnv.position.y = -2;
  envScene.add(groundEnv);
  scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 200).texture;
  scene.environmentIntensity = 0.85;
  const skyMat = sky.material as THREE.ShaderMaterial;

  scene.fog = new THREE.Fog('#cfdff0', 180, 1000);

  const hemi = new THREE.HemisphereLight('#c4dcff', '#a88a7c', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0dc', 2.75);
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
  let skyT = 0;
  return {
    tick(dt: number) {
      skyT += dt;
      skyMat.uniforms.time.value = skyT;
    },
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
