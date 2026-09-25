import * as THREE from 'three';
import type { Game } from './game';
import type { Stage } from '../render/scene';

// Incident replay: a ring buffer of *recorded transforms* (never a re-simulation), played back in
// slow motion from a shaky phone-filmer camera inside a vertical phone frame. The same frames can be
// captured to a real 9:16 WebM clip.

const HZ = 30;
const SECONDS = 10;
const FRAMES = HZ * SECONDS;

export class Replay {
  private bones: THREE.Bone[];
  private stride: number;
  private buf: Float32Array;
  private head = 0;
  private count = 0;
  private stepCounter = 0;
  private playing = false;
  private t = 0;
  private start = 0;
  private len = 0;
  private overlay: HTMLElement;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private saved: { parent: THREE.Object3D | null; pos: THREE.Vector3; quat: THREE.Quaternion; bones: THREE.Quaternion[]; pelvis: THREE.Vector3 } | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private clipCanvas: HTMLCanvasElement;
  private clipCtx: CanvasRenderingContext2D;
  private clipUrl: string | null = null;
  private shake = 0;

  constructor(
    private game: Game,
    private stage: Stage,
    parent: HTMLElement,
  ) {
    this.bones = [...game.rig.bones.values()];
    // vehicle pos3 quat4 spins3 steer1 | rig root pos3 quat4 | pelvis pos3 | bones quat4*N | helmet on1 pos3 quat4
    this.stride = 7 + 3 + 1 + 7 + 3 + this.bones.length * 4 + 8;
    this.buf = new Float32Array(this.stride * FRAMES);
    this.overlay = document.createElement('div');
    this.overlay.className = 'replay';
    this.overlay.innerHTML = `
      <div class="replay-phone"><div class="replay-screen"></div>
        <div class="replay-rec"><i></i> REC <span class="replay-time">00:00</span></div>
        <div class="replay-cap">INCIDENT REPLAY</div>
      </div>
      <div class="replay-help">SPACE / ESC: back to the park · <b>S</b>: save this clip (.webm)</div>
      <a class="replay-save" download="pro-ryker-incident.webm">SAVE CLIP</a>`;
    this.overlay.style.display = 'none';
    parent.appendChild(this.overlay);
    this.clipCanvas = document.createElement('canvas');
    this.clipCanvas.width = 540;
    this.clipCanvas.height = 960;
    this.clipCtx = this.clipCanvas.getContext('2d')!;
  }

  get available() {
    return this.count > HZ;
  }

  record() {
    if (this.playing) return;
    if (++this.stepCounter % 4) return; // 120 Hz sim → 30 Hz samples
    const g = this.game;
    const v = g.vehicle;
    const o = this.head * this.stride;
    const b = this.buf;
    let k = o;
    const ryk = g.ryker.root;
    b[k++] = ryk.position.x;
    b[k++] = ryk.position.y;
    b[k++] = ryk.position.z;
    b[k++] = ryk.quaternion.x;
    b[k++] = ryk.quaternion.y;
    b[k++] = ryk.quaternion.z;
    b[k++] = ryk.quaternion.w;
    for (const w of v.wheels) b[k++] = w.spin;
    b[k++] = v.steerAngle;
    const root = g.rig.root;
    root.updateMatrixWorld(true);
    const rp = root.getWorldPosition(new THREE.Vector3());
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    b[k++] = rp.x;
    b[k++] = rp.y;
    b[k++] = rp.z;
    b[k++] = rq.x;
    b[k++] = rq.y;
    b[k++] = rq.z;
    b[k++] = rq.w;
    const pel = g.rig.bone('driver_pelvis').position;
    b[k++] = pel.x;
    b[k++] = pel.y;
    b[k++] = pel.z;
    for (const bone of this.bones) {
      b[k++] = bone.quaternion.x;
      b[k++] = bone.quaternion.y;
      b[k++] = bone.quaternion.z;
      b[k++] = bone.quaternion.w;
    }
    const h = g.rider.helmet;
    b[k++] = h ? 1 : 0;
    if (h) {
      b[k++] = h.mesh.position.x;
      b[k++] = h.mesh.position.y;
      b[k++] = h.mesh.position.z;
      b[k++] = h.mesh.quaternion.x;
      b[k++] = h.mesh.quaternion.y;
      b[k++] = h.mesh.quaternion.z;
      b[k++] = h.mesh.quaternion.w;
    }
    this.head = (this.head + 1) % FRAMES;
    this.count = Math.min(FRAMES, this.count + 1);
  }

  /** Clear history (new run). */
  clear() {
    this.count = 0;
    this.head = 0;
  }

  play() {
    if (!this.available) return;
    const g = this.game;
    const root = g.rig.root;
    this.saved = {
      parent: root.parent,
      pos: root.position.clone(),
      quat: root.quaternion.clone(),
      bones: this.bones.map((b) => b.quaternion.clone()),
      pelvis: g.rig.bone('driver_pelvis').position.clone(),
    };
    // Last ~7 s, slow-mo.
    this.len = Math.min(this.count, HZ * 7);
    this.start = (this.head - this.len + FRAMES) % FRAMES;
    this.t = 0;
    this.playing = true;
    this.overlay.style.display = '';
    this.overlay.classList.remove('saved');
    const f0 = this.frameAt(0);
    this.camPos.copy(this.filmerSpot(f0));
    this.camLook.copy(f0);
    this.g_cam_mode = g.cam.mode;
    g.cam.mode = 'free';
    this.startClip();
  }
  private g_cam_mode: 'follow' | 'orbit' | 'free' = 'follow';

  /** World position of the rider root / ryker for frame i (for framing). */
  private frameAt(i: number) {
    const k = ((this.start + Math.min(i, this.len - 1)) % FRAMES) * this.stride;
    const b = this.buf;
    const veh = new THREE.Vector3(b[k], b[k + 1], b[k + 2]);
    const rk = k + 11;
    const pelOff = rk + 7;
    const rootPos = new THREE.Vector3(b[rk], b[rk + 1], b[rk + 2]);
    const rootQ = new THREE.Quaternion(b[rk + 3], b[rk + 4], b[rk + 5], b[rk + 6]);
    const pel = new THREE.Vector3(b[pelOff], b[pelOff + 1], b[pelOff + 2]).applyQuaternion(rootQ).add(rootPos);
    return veh.lerp(pel, 0.6);
  }

  private filmerSpot(target: THREE.Vector3) {
    // A spectator standing off to the side of the action, phone at head height.
    const side = new THREE.Vector3(1, 0, 0.6).normalize();
    return target.clone().addScaledVector(side, 9).setY(target.y + 1.7);
  }

  update(dt: number) {
    if (!this.playing) return;
    const speed = 0.5;
    this.t += dt * speed * HZ;
    if (this.t >= this.len - 1) {
      this.t = this.len - 1;
      this.stopClip();
    }
    const i0 = Math.floor(this.t);
    const i1 = Math.min(this.len - 1, i0 + 1);
    const a = this.t - i0;
    this.apply(i0, i1, a);
    // Handheld phone camera: tracks the action with lag and wobble, slowly walks along.
    const target = this.frameAt(i0).lerp(this.frameAt(i1), a);
    this.camLook.lerp(target, 1 - Math.exp(-dt * 3));
    const want = this.filmerSpot(this.camLook);
    this.camPos.lerp(want, 1 - Math.exp(-dt * 0.8));
    this.shake += dt;
    const cam = this.stage.camera;
    cam.position.copy(this.camPos).add(new THREE.Vector3(Math.sin(this.shake * 1.7) * 0.06, Math.sin(this.shake * 2.3) * 0.05, Math.cos(this.shake * 1.3) * 0.05));
    cam.lookAt(this.camLook.clone().add(new THREE.Vector3(Math.sin(this.shake * 0.9) * 0.15, 0.2, 0)));
    const secs = (this.t / HZ).toFixed(0);
    const timeEl = this.overlay.querySelector('.replay-time');
    if (timeEl) timeEl.textContent = `00:${secs.padStart(2, '0')}`;
    this.drawClipFrame();
  }

  private apply(i0: number, i1: number, a: number) {
    const g = this.game;
    const b = this.buf;
    const k0 = ((this.start + i0) % FRAMES) * this.stride;
    const k1 = ((this.start + i1) % FRAMES) * this.stride;
    const lerp = (o: number) => b[k0 + o] + (b[k1 + o] - b[k0 + o]) * a;
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion();
    const qAt = (o: number, out: THREE.Quaternion) => {
      q0.set(b[k0 + o], b[k0 + o + 1], b[k0 + o + 2], b[k0 + o + 3]);
      q1.set(b[k1 + o], b[k1 + o + 1], b[k1 + o + 2], b[k1 + o + 3]);
      return out.slerpQuaternions(q0, q1, a);
    };
    const ryk = g.ryker.root;
    ryk.position.set(lerp(0), lerp(1), lerp(2));
    qAt(3, ryk.quaternion);
    ryk.updateMatrixWorld(true);
    // Rider: place the rig root in world space from the recording.
    const root = g.rig.root;
    if (root.parent !== this.stage.scene) this.stage.scene.add(root);
    root.position.set(lerp(11), lerp(12), lerp(13));
    qAt(14, root.quaternion);
    g.rig.bone('driver_pelvis').position.set(lerp(18), lerp(19), lerp(20));
    let o = 21;
    for (const bone of this.bones) {
      qAt(o, bone.quaternion);
      o += 4;
    }
    const h = g.rider.helmet;
    if (h && b[k0 + o] > 0.5) {
      h.mesh.visible = true;
      h.mesh.position.set(lerp(o + 1), lerp(o + 2), lerp(o + 3));
      qAt(o + 4, h.mesh.quaternion);
    } else if (h) h.mesh.visible = false;
    if (g.rig.helmet) g.rig.helmet.visible = !(b[k0 + o] > 0.5);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.overlay.style.display = 'none';
    this.stopClip();
    const g = this.game;
    const s = this.saved;
    if (s) {
      const root = g.rig.root;
      if (s.parent && root.parent !== s.parent) s.parent.add(root);
      root.position.copy(s.pos);
      root.quaternion.copy(s.quat);
      this.bones.forEach((b, i) => b.quaternion.copy(s.bones[i]));
      g.rig.bone('driver_pelvis').position.copy(s.pelvis);
    }
    if (g.rider.helmet) {
      g.rider.helmet.mesh.visible = true;
      if (g.rig.helmet) g.rig.helmet.visible = false;
    }
    g.cam.mode = this.g_cam_mode;
    g.paused = false;
  }

  // ---------------------------------------------------------------- clip capture

  private startClip() {
    if (this.clipUrl) URL.revokeObjectURL(this.clipUrl);
    this.clipUrl = null;
    const save = this.overlay.querySelector('.replay-save') as HTMLAnchorElement;
    save.removeAttribute('href');
    save.style.display = 'none';
    if (typeof MediaRecorder === 'undefined') return;
    try {
      const stream = this.clipCanvas.captureStream(30);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.recorder.onstop = () => {
        if (!this.chunks.length) return;
        this.clipUrl = URL.createObjectURL(new Blob(this.chunks, { type: 'video/webm' }));
        save.href = this.clipUrl;
        save.style.display = '';
      };
      this.recorder.start(250);
    } catch {
      this.recorder = null;
    }
  }

  private stopClip() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
  }

  /** Copy the centre 9:16 strip of the game canvas into the clip canvas, with the REC overlay. */
  private drawClipFrame() {
    if (!this.recorder) return;
    const src = this.stage.renderer.domElement;
    // Make sure the canvas has this frame's pixels.
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
    const sh = src.height;
    const sw = Math.round((sh * 9) / 16);
    const sx = Math.round((src.width - sw) / 2);
    const c = this.clipCtx;
    c.drawImage(src, sx, 0, sw, sh, 0, 0, 540, 960);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, 540, 64);
    c.fillStyle = '#ff3b30';
    c.beginPath();
    c.arc(34, 32, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 24px "Space Mono", monospace';
    c.fillText(`REC  00:${(this.t / HZ).toFixed(0).padStart(2, '0')}`, 54, 40);
    c.font = '46px Anton, Impact, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 8;
    c.strokeStyle = '#000';
    c.strokeText('HOLD ON. IT GETS WORSE.', 270, 900);
    c.fillText('HOLD ON. IT GETS WORSE.', 270, 900);
    c.textAlign = 'left';
  }

  /** Keyboard 'S' during replay. */
  saveClip() {
    const a = this.overlay.querySelector('.replay-save') as HTMLAnchorElement;
    if (a.href) a.click();
    else this.overlay.classList.add('saved');
  }
}
