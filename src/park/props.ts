import * as THREE from 'three';
import { RAPIER, COL, type PhysicsWorld } from '../physics/world';
import { PROPS, type PropDef } from './layout';
import type { EventBus } from '../core/events';
import { stripeTexture } from '../render/textures';

// A small, controlled set of dynamic props (the clip's knocked-over cone, bins, a folding chair).
// They start off the main lines, report a hit once per run, and reset for a new scored run.

interface Prop {
  id: number;
  def: PropDef;
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  home: { p: THREE.Vector3; q: THREE.Quaternion };
  hit: boolean;
  offset: number; // collider centre height above the prop's base
}

const _q = new THREE.Quaternion();

export class Props {
  list: Prop[] = [];
  private group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    phys: PhysicsWorld,
    private events: EventBus,
    heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'props';
    scene.add(this.group);
    const coneMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#ff5a14', '#f4f1e8', 5), roughness: 0.55 });
    const coneBase = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.8 });
    const binMat = new THREE.MeshStandardMaterial({ color: '#2f5e3f', metalness: 0.55, roughness: 0.45 });
    const lidMat = new THREE.MeshStandardMaterial({ color: '#244a31', metalness: 0.5, roughness: 0.5 });
    const chairMat = new THREE.MeshStandardMaterial({ color: '#8f969c', metalness: 0.8, roughness: 0.3 });
    const barrierMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#ff5a14', '#f4f1e8', 6), roughness: 0.6 });
    PROPS.forEach((def, i) => {
      const y = def.y ?? heightAt(def.x, def.z);
      const yaw = THREE.MathUtils.degToRad(def.yawDeg ?? 0);
      let mesh: THREE.Object3D;
      let col: RAPIER.ColliderDesc;
      let offset: number;
      if (def.kind === 'cone') {
        const g = new THREE.Group();
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.72, 20, 1, true), coneMat);
        c.position.y = 0.39;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), coneBase);
        base.position.y = 0.02;
        g.add(c, base);
        mesh = g;
        col = RAPIER.ColliderDesc.cone(0.36, 0.2).setMass(2.2).setTranslation(0, 0, 0);
        offset = 0.36;
      } else if (def.kind === 'bin') {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.95, 20), binMat);
        b.position.y = 0.475;
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 20), lidMat);
        lid.position.y = 0.98;
        g.add(b, lid);
        mesh = g;
        col = RAPIER.ColliderDesc.cylinder(0.5, 0.33).setMass(14);
        offset = 0.5;
      } else if (def.kind === 'chair') {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.42), chairMat);
        seat.position.y = 0.46;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.03), chairMat);
        back.position.set(0, 0.72, 0.2);
        g.add(seat, back);
        for (const sx of [-0.2, 0.2])
          for (const sz of [-0.18, 0.18]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 6), chairMat);
            leg.position.set(sx, 0.23, sz);
            g.add(leg);
          }
        mesh = g;
        col = RAPIER.ColliderDesc.cuboid(0.22, 0.44, 0.22).setMass(3.5);
        offset = 0.44;
      } else {
        const g = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.26, 0.05), barrierMat);
        board.position.y = 0.85;
        g.add(board);
        for (const sx of [-0.6, 0.6]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.5), coneBase);
          leg.position.set(sx, 0.47, 0);
          g.add(leg);
        }
        mesh = g;
        col = RAPIER.ColliderDesc.cuboid(0.7, 0.5, 0.25).setMass(7);
        offset = 0.5;
      }
      mesh.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const p = new THREE.Vector3(def.x, y + offset + 0.002, def.z);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
      const body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q).setCanSleep(true).setLinearDamping(0.15).setAngularDamping(0.3));
      phys.world.createCollider(col.setFriction(0.6).setRestitution(0.25).setCollisionGroups(COL.prop), body);
      body.sleep();
      this.group.add(mesh);
      this.list.push({ id: i, def, body, mesh, home: { p, q }, hit: false, offset });
    });
    this.sync();
  }

  private settleT = 0;

  /** Detect first hits (knocked over or shoved) and mirror bodies to meshes. */
  update(dt = 1 / 120) {
    this.settleT += dt;
    for (const pr of this.list) {
      if (pr.body.isSleeping()) continue;
      // A hit means shoved sideways or tipped over — never the vertical settle after a reset.
      if (!pr.hit && this.settleT > 0.5) {
        const v = pr.body.linvel();
        const sp = Math.hypot(v.x, v.z);
        const r = pr.body.rotation();
        const upY = 1 - 2 * (r.x * r.x + r.z * r.z);
        if (sp > 1.2 || upY < 0.6) {
          pr.hit = true;
          this.events.emit('prop_hit', { kind: pr.def.kind, id: pr.id, speed: sp });
        }
      }
    }
    this.sync();
  }

  private sync() {
    for (const pr of this.list) {
      const t = pr.body.translation();
      const r = pr.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      pr.mesh.quaternion.copy(_q);
      // Collider is centred; the mesh origin is at the prop's base.
      pr.mesh.position.set(t.x, t.y, t.z).add(new THREE.Vector3(0, -pr.offset, 0).applyQuaternion(_q));
    }
  }

  /** Back to the authored layout (new scored run). */
  reset() {
    for (const pr of this.list) {
      pr.body.setTranslation(pr.home.p, false);
      pr.body.setRotation(pr.home.q, false);
      pr.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      pr.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      pr.body.sleep();
      pr.hit = false;
    }
    this.settleT = 0;
    this.sync();
  }

  /** Is this prop (by id) knocked over right now? */
  down(id: number) {
    const r = this.list[id].body.rotation();
    return 1 - 2 * (r.x * r.x + r.z * r.z) < 0.6;
  }
}
