import * as THREE from 'three';

// Autumn-afternoon sky like the clip: deep blue zenith, bright hazy horizon, big drifting cumulus,
// warm sun glow. One dome is shown in the scene and also baked into the reflection environment.

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 sunDir;
uniform float time;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // Below the horizon: warm ground haze (hidden by the world, but reflections see it).
  col = mix(col, ground, smoothstep(0.02, -0.12, h));
  // Sun glow
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += vec3(1.0, 0.85, 0.62) * (pow(s, 900.0) * 18.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.08);
  // Clouds: project the dome onto a plane above; cumulus from thresholded fbm.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.35 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv * 1.6);
    float n2 = fbm(uv * 3.1 + 4.0);
    float c = smoothstep(0.5, 0.78, n * 0.82 + n2 * 0.28);
    float shade = smoothstep(0.45, 0.95, n2);
    vec3 cloud = mix(vec3(0.72, 0.76, 0.84), vec3(1.0, 0.98, 0.95), shade);
    cloud += vec3(1.0, 0.9, 0.75) * pow(s, 6.0) * 0.4 * c;
    float fade = smoothstep(0.0, 0.18, h);
    col = mix(col, cloud, c * fade * 0.95);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** radius must stay inside the camera's far plane; the dome follows the camera. */
export function makeSky(sunDir: THREE.Vector3, radius = 900) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      sunDir: { value: sunDir.clone() },
      time: { value: 0 },
      zenith: { value: new THREE.Color('#1f5fcf') },
      horizon: { value: new THREE.Color('#cfe0f2') },
      ground: { value: new THREE.Color('#9b8a80') },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(radius);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (_r, _s, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}
