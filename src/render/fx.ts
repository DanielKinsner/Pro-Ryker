import * as THREE from 'three';
import type { Game } from '../game/game';
import { blobTexture } from './textures';

// Juice: grind sparks, landing dust rings, tyre smoke + skid marks, drag scrape dust/sparks,
// bail bursts. CPU particles in two THREE.Points pools (additive sparks, soft dust).

interface Pool {
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  size: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grow: Float32Array;
  n: number;
  next: number;
  gravity: number;
  drag: number;
}

function makePool(n: number, additive: boolean, tex: THREE.Texture, gravity: number, drag: number): Pool {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const size = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec4 color;
      varying vec4 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec4 vColor;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return {
    points,
    pos,
    vel: new Float32Array(n * 3),
    col,
    size,
    life: new Float32Array(n),
    maxLife: new Float32Array(n).fill(1),
    grow: new Float32Array(n),
    n,
    next: 0,
    gravity,
    drag,
  };
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Fx {
  private sparks: Pool;
  private dust: Pool;
  private skid: THREE.InstancedMesh;
  private skidAge: Float32Array;
  private skidNext = 0;
  private lastSkid: THREE.Vector3[] = [];
  private acc = { spark: 0, dust: 0 };
  private mat = new THREE.Matrix4();
  private rng = 1;

  constructor(
    scene: THREE.Scene,
    private game: Game,
  ) {
    this.sparks = makePool(900, true, blobTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), -14, 0.6);
    this.dust = makePool(700, false, blobTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), 0.4, 2.2);
    scene.add(this.sparks.points, this.dust.points);
    // Skid marks: dark translucent quads laid on the concrete, fading slowly.
    const skidGeo = new THREE.PlaneGeometry(0.22, 0.34).rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({ color: '#2a1d1c', transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.skid = new THREE.InstancedMesh(skidGeo, skidMat, 1400);
    this.skid.count = 0;
    this.skid.frustumCulled = false;
    this.skid.renderOrder = 1;
    this.skidAge = new Float32Array(1400);
    scene.add(this.skid);
    const ev = game.events;
    ev.on('landed', (e) => {
      if (e.impact > 2.5) this.landingRing(Math.min(1.6, 0.4 + e.impact * 0.09));
    });
    ev.on('rider_detached', () => {
      const r = game.rider;
      const p = r.ragdoll.active ? r.ragdoll.pelvisPos(new THREE.Vector3()) : game.vehicle.pos.clone();
      this.burst(p, 26, 3.2, [0.84, 0.72, 0.68], 0.9);
    });
    ev.on('prop_hit', () => this.burst(game.vehicle.pos.clone().addScaledVector(game.vehicle.fwd, 1.2), 8, 1.6, [0.8, 0.7, 0.66], 0.5));
  }

  private rand() {
    // Deterministic-ish LCG so FX don't depend on Math.random (keeps replays tidy).
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  private spawn(p: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, a: number, size: number, life: number, grow = 0) {
    const i = p.next;
    p.next = (p.next + 1) % p.n;
    p.pos[i * 3] = x;
    p.pos[i * 3 + 1] = y;
    p.pos[i * 3 + 2] = z;
    p.vel[i * 3] = vx;
    p.vel[i * 3 + 1] = vy;
    p.vel[i * 3 + 2] = vz;
    p.col[i * 4] = r;
    p.col[i * 4 + 1] = g;
    p.col[i * 4 + 2] = b;
    p.col[i * 4 + 3] = a;
    p.size[i] = size;
    p.life[i] = life;
    p.maxLife[i] = life;
    p.grow[i] = grow;
  }

  private sparkAt(at: THREE.Vector3, back: THREE.Vector3, speed: number, n: number) {
    for (let k = 0; k < n; k++) {
      const s = speed * (0.25 + this.rand() * 0.55);
      this.spawn(
        this.sparks,
        at.x,
        at.y,
        at.z,
        back.x * s + (this.rand() - 0.5) * 3,
        1 + this.rand() * 3.5,
        back.z * s + (this.rand() - 0.5) * 3,
        1.6,
        0.75 + this.rand() * 0.4,
        0.25,
        1,
        0.09 + this.rand() * 0.09,
        0.3 + this.rand() * 0.4,
      );
    }
  }

  private dustAt(at: THREE.Vector3, vel: THREE.Vector3, n: number, size = 0.5, alpha = 0.35) {
    for (let k = 0; k < n; k++) {
      this.spawn(
        this.dust,
        at.x + (this.rand() - 0.5) * 0.3,
        at.y + 0.05,
        at.z + (this.rand() - 0.5) * 0.3,
        vel.x * 0.3 + (this.rand() - 0.5) * 1.2,
        0.4 + this.rand() * 0.8,
        vel.z * 0.3 + (this.rand() - 0.5) * 1.2,
        0.86,
        0.74,
        0.7,
        alpha,
        size * (0.7 + this.rand() * 0.6),
        0.8 + this.rand() * 0.8,
        1.4,
      );
    }
  }

  burst(at: THREE.Vector3, n: number, speed: number, rgb: [number, number, number], size: number) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const s = speed * (0.4 + this.rand() * 0.6);
      this.spawn(this.dust, at.x, at.y + 0.2, at.z, Math.cos(a) * s, 0.8 + this.rand() * 1.5, Math.sin(a) * s, rgb[0], rgb[1], rgb[2], 0.45, size * (0.6 + this.rand() * 0.8), 1 + this.rand(), 1.2);
    }
  }

  private landingRing(strength: number) {
    const v = this.game.vehicle;
    for (const w of v.wheels) {
      if (!w.contact) continue;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + this.rand();
        const s = 1.4 * strength * (0.6 + this.rand() * 0.5);
        this.spawn(this.dust, w.point.x, w.point.y + 0.05, w.point.z, Math.cos(a) * s + v.vel.x * 0.2, 0.3 + this.rand() * 0.5, Math.sin(a) * s + v.vel.z * 0.2, 0.88, 0.76, 0.72, 0.35, 0.45 * strength + 0.2, 0.9 + this.rand() * 0.6, 1.6);
      }
    }
  }

  private skidAt(key: number, at: THREE.Vector3, dir: THREE.Vector3) {
    const last = this.lastSkid[key];
    if (last && last.distanceTo(at) < 0.28) return;
    this.lastSkid[key] = at.clone();
    const i = this.skidNext;
    this.skidNext = (this.skidNext + 1) % this.skidAge.length;
    const yaw = Math.atan2(dir.x, dir.z);
    this.mat.makeRotationY(yaw).setPosition(at.x, at.y + 0.02, at.z);
    this.skid.setMatrixAt(i, this.mat);
    this.skidAge[i] = 0;
    this.skid.count = Math.max(this.skid.count, i + 1);
    this.skid.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    if (dt <= 0) return;
    const g = this.game;
    const v = g.vehicle;
    const r = g.rider;
    // Grind: sparks off the belly where it meets the rail.
    if (g.tricks.grind) {
      this.acc.spark += dt * (140 + v.speed * 12);
      const n = Math.floor(this.acc.spark);
      this.acc.spark -= n;
      const at = _v.copy(v.pos).addScaledVector(v.up, 0.3);
      const back = _v2.copy(v.vel).normalize().negate();
      if (n) this.sparkAt(at, back, v.speed, n);
    }
    // Powerslide / skid: tyre smoke + marks from the rear tyre (and fronts when sliding hard).
    const sliding = v.grounded && !g.tricks.grind && v.slip > 3.2;
    if (sliding) {
      this.acc.dust += dt * Math.min(40, v.slip * 5);
      const n = Math.floor(this.acc.dust);
      this.acc.dust -= n;
      const rear = v.wheels[2];
      if (rear.contact && n) this.dustAt(rear.point, v.vel, n, 0.6, 0.3);
      for (let k = 0; k < 3; k++) {
        const w = v.wheels[k];
        if (w.contact) this.skidAt(k, w.point, v.fwd);
      }
    } else if (v.grounded && v.skid > 0) {
      for (let k = 0; k < 3; k++) {
        const w = v.wheels[k];
        if (w.contact) this.skidAt(k, w.point, v.fwd);
      }
    } else this.lastSkid = [];
    // Being dragged: dust off his jacket, the odd spark from his belt buckle.
    if (r.state === 'hanging' && r.ragdoll.active && v.speed > 2.5) {
      const p = r.ragdoll.pelvisPos(_v);
      if (p.y < 0.55) {
        this.acc.dust += dt * (8 + v.speed * 1.5);
        const n = Math.floor(this.acc.dust);
        this.acc.dust -= n;
        if (n) this.dustAt(p.setY(p.y - 0.2), v.vel, n, 0.55, 0.3);
        if (this.rand() < dt * 6) this.sparkAt(p, _v2.copy(v.vel).normalize().negate(), v.speed * 0.5, 4);
      }
    }
    // Loose Ryker scraping along on its side.
    if (r.state === 'detached' && !v.grounded && v.tumbling && v.speed > 3) {
      if (this.rand() < dt * 30) this.sparkAt(v.pos.clone().addScaledVector(v.up, 0.2), _v2.copy(v.vel).normalize().negate(), v.speed, 5);
    }
    this.stepPool(this.sparks, dt);
    this.stepPool(this.dust, dt);
    // Skid marks fade over ~25 s.
    const mat = this.skid.material as THREE.MeshBasicMaterial;
    void mat;
    for (let i = 0; i < this.skid.count; i++) this.skidAge[i] += dt;
  }

  private stepPool(p: Pool, dt: number) {
    const damp = Math.exp(-p.drag * dt);
    for (let i = 0; i < p.n; i++) {
      if (p.life[i] <= 0) {
        p.col[i * 4 + 3] = 0;
        continue;
      }
      p.life[i] -= dt;
      p.vel[i * 3] *= damp;
      p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * damp + p.gravity * dt;
      p.vel[i * 3 + 2] *= damp;
      p.pos[i * 3] += p.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const t = Math.max(0, p.life[i] / p.maxLife[i]);
      p.size[i] += p.grow[i] * dt;
      p.col[i * 4 + 3] = Math.min(p.col[i * 4 + 3], t);
    }
    const g = p.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Point sprites are sized in world metres: scale by the viewport's pixels-per-metre at 1 m. */
  setViewport(heightPx: number, fovDeg: number) {
    const k = heightPx / 2 / Math.tan((fovDeg * Math.PI) / 360);
    for (const p of [this.sparks, this.dust]) (p.points.material as THREE.ShaderMaterial).uniforms.scale.value = k;
  }

  clear() {
    for (const p of [this.sparks, this.dust]) p.life.fill(0);
    this.skid.count = 0;
    this.skidNext = 0;
  }
}
