import * as THREE from 'three';

/**
 * World-space triplanar mapping for MeshStandardMaterial: the texture is projected from X, Y and Z
 * and blended by the surface normal, so steep bowl walls don't smear. Works on any geometry
 * (no UVs needed). Vertex colours multiply in for baked AO/wear.
 */
export function triplanar(mat: THREE.MeshStandardMaterial, scale: number, opts: { detail?: THREE.Texture; detailScale?: number } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.triScale = { value: scale };
    shader.uniforms.detailMap = { value: opts.detail ?? null };
    shader.uniforms.detailScale = { value: opts.detailScale ?? scale * 0.13 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTriPos;
varying vec3 vTriNrm;
uniform float triScale;
uniform float detailScale;
${opts.detail ? 'uniform sampler2D detailMap;' : ''}
vec4 triSample(sampler2D t, float s) {
  vec3 w = pow(abs(vTriNrm), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec4 x = texture2D(t, vTriPos.zy * s);
  vec4 y = texture2D(t, vTriPos.xz * s);
  vec4 z = texture2D(t, vTriPos.xy * s);
  return x * w.x + y * w.y + z * w.z;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = triSample(map, triScale);
  ${opts.detail ? 'sampledDiffuseColor.rgb *= mix(vec3(1.0), triSample(detailMap, detailScale).rgb * 1.25, 0.6);' : ''}
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => `tri-${scale}-${!!opts.detail}`;
  return mat;
}

export const MATS = {
  steel: () => new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.85, roughness: 0.32 }),
  coping: () => new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.9, roughness: 0.22 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.7, roughness: 0.45 }),
  rust: () => new THREE.MeshStandardMaterial({ color: '#7a3b1e', metalness: 0.35, roughness: 0.85 }),
  wood: () => new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 0.8 }),
  paintRed: () => new THREE.MeshStandardMaterial({ color: '#c8322a', roughness: 0.55 }),
  paintGreen: () => new THREE.MeshStandardMaterial({ color: '#2f5e3f', roughness: 0.6 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9 }),
};
