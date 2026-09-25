import * as THREE from 'three';
import { RAPIER, COL, type PhysicsWorld } from '../physics/world';
import type { Game } from '../game/game';

// The park's crowd is literally cardboard (municipal budget). Comic-style standees that swap to a
// reaction pose when something actually happens near them — and fall flat if you hit them.

type Who = 'filmer' | 'kid' | 'employee' | 'skater2';

interface Standee {
  who: Who;
  body: RAPIER.RigidBody;
  group: THREE.Group;
  front: THREE.MeshStandardMaterial;
  home: { p: THREE.Vector3; q: THREE.Quaternion };
  react: number; // seconds left in react pose
  wobble: number;
  down: boolean;
}

const PLACES: { who: Who; x: number; y?: number; z: number; face: [number, number] }[] = [
  { who: 'filmer', x: -35, z: 21, face: [-14, 2] },
  { who: 'kid', x: -32, z: -20, face: [-12, -2] },
  { who: 'employee', x: -37.2, y: 1.6, z: -37, face: [-26, -30] },
  { who: 'skater2', x: 49, z: 13, face: [34, 4] },
  { who: 'filmer', x: 13, z: -31, face: [28, -40] },
  { who: 'kid', x: 37, z: 39, face: [30, 30] },
  { who: 'skater2', x: -64, z: -2, face: [-44, -4] },
  // Out in the city: someone already up on the interstate, and a troll under the bridge.
  { who: 'kid', x: 214, y: 9, z: 99.5, face: [190, 90] },
  { who: 'employee', x: 38, z: 95, face: [30, 70] },
];

const W = 0.9;
const H = 1.8;
const BASE = import.meta.env.BASE_URL;

export class Crowd {
  list: Standee[] = [];
  private tex = new Map<string, THREE.Texture>();
  private ok = false;

  constructor(
    scene: THREE.Scene,
    phys: PhysicsWorld,
    private game: Game,
  ) {
    const loader = new THREE.TextureLoader();
    const load = (name: string) => {
      const t = loader.load(`${BASE}assets/art/crowd/${name}.webp`, () => (this.ok = true));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.tex.set(name, t);
      return t;
    };
    for (const w of ['filmer', 'kid', 'employee', 'skater2'] as Who[]) {
      load(`${w}-idle`);
      load(`${w}-react`);
    }
    const cardboard = new THREE.MeshStandardMaterial({ color: '#a8845a', roughness: 0.95 });
    for (const pl of PLACES) {
      const y = pl.y ?? 0;
      const g = new THREE.Group();
      const front = new THREE.MeshStandardMaterial({ map: this.tex.get(`${pl.who}-idle`)!, alphaTest: 0.5, roughness: 0.8, side: THREE.FrontSide });
      const back = new THREE.MeshStandardMaterial({ map: this.tex.get(`${pl.who}-idle`)!, alphaTest: 0.5, color: '#a8845a', roughness: 0.95, side: THREE.BackSide });
      const plane = new THREE.PlaneGeometry(W, H);
      plane.translate(0, H / 2, 0);
      const f = new THREE.Mesh(plane, front);
      const b = new THREE.Mesh(plane, back);
      f.castShadow = b.castShadow = true;
      // Easel stand behind the cutout
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.02), cardboard);
      stand.position.set(0, 0.48, -0.22);
      stand.rotation.x = -0.45;
      stand.castShadow = true;
      g.add(f, b, stand);
      g.userData.back = back;
      scene.add(g);
      const yaw = Math.atan2(pl.face[0] - pl.x, pl.face[1] - pl.z);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const p = new THREE.Vector3(pl.x, y + H / 2 + 0.002, pl.z);
      const body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q).setLinearDamping(0.4).setAngularDamping(0.8).setCanSleep(true));
      // Wide, shallow collider (cutout + stand footprint) so it stands on its own but tips when hit.
      phys.world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, H / 2, 0.16).setTranslation(0, 0, -0.1).setMass(3).setFriction(0.8).setCollisionGroups(COL.prop), body);
      body.sleep();
      this.list.push({ who: pl.who, body, group: g, front, home: { p, q }, react: 0, wobble: 0, down: false });
    }
    const ev = game.events;
    const react = (radius: number, secs: number) => () => this.reactNear(radius, secs);
    ev.on('hang_entered', react(35, 3));
    ev.on('rider_detached', react(40, 3.5));
    ev.on('rider_recovered', react(35, 2.5));
    ev.on('gap', react(30, 2));
    ev.on('combo_banked', (e) => {
      if (e.score > 3000) this.reactNear(40, 2.5);
    });
    ev.on('landed', (e) => {
      if (e.quality === 'clean' && e.airTime > 1.5) this.reactNear(30, 2);
    });
  }

  private reactNear(radius: number, secs: number) {
    const v = this.game.vehicle.pos;
    for (const s of this.list) {
      if (s.down) continue;
      if (s.group.position.distanceTo(v) < radius) {
        s.react = secs;
        s.wobble = 1;
      }
    }
  }

  update(dt: number) {
    for (const s of this.list) {
      const t = s.body.translation();
      const r = s.body.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
      if (!s.down && upY < 0.5) {
        s.down = true;
        this.game.events.emit('prop_hit', { kind: 'cutout', id: 100 + this.list.indexOf(s), speed: 3 });
      }
      s.react = Math.max(0, s.react - dt);
      s.wobble = Math.max(0, s.wobble - dt * 1.5);
      const tex = this.tex.get(`${s.who}-${s.react > 0 && !s.down ? 'react' : 'idle'}`)!;
      if (s.front.map !== tex) {
        s.front.map = tex;
        (s.group.userData.back as THREE.MeshStandardMaterial).map = tex;
      }
      // Body origin is the collider centre; the cutout's origin is its base.
      s.group.quaternion.copy(q);
      if (s.wobble > 0 && !s.down) s.group.rotateY(Math.sin(s.wobble * 18) * 0.12 * s.wobble);
      s.group.position.set(t.x, t.y, t.z).add(new THREE.Vector3(0, -H / 2, 0).applyQuaternion(q));
    }
  }

  reset() {
    for (const s of this.list) {
      s.body.setTranslation(s.home.p, false);
      s.body.setRotation(s.home.q, false);
      s.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      s.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      s.body.sleep();
      s.down = false;
      s.react = 0;
    }
  }

  get loaded() {
    return this.ok;
  }
}
