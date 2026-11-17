// player.js — people on foot: Leo, pedestrians, mission goons, cash pickups.
// One clear job: build low-poly people, walk them, fight with them, and pay out.

import * as THREE from 'three';
import { resolveCollisions, ROAD_COORDS } from './city.js';

export function buildPersonMesh(shirt, pants, skin = 0xc98a5a) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.y = 1.9;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.54),
    new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 }));
  hair.position.y = 2.18;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.75, 0.36), pantsMat);
  legL.position.set(-0.22, 0.38, 0);
  legL.geometry.translate(0, -0.32, 0);
  legL.position.y = 0.75;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), shirtMat);
  armL.geometry.translate(0, -0.35, 0);
  armL.position.set(-0.58, 1.55, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  g.add(armR);
  return { group: g, legL, legR, armL, armR, torso };
}

function swingWalk(parts, phase, amount) {
  parts.legL.rotation.x = Math.sin(phase) * 0.7 * amount;
  parts.legR.rotation.x = -Math.sin(phase) * 0.7 * amount;
  parts.armL.rotation.x = -Math.sin(phase) * 0.5 * amount;
  parts.armR.rotation.x = Math.sin(phase) * 0.5 * amount;
}

export class Player {
  constructor(scene) {
    this.parts = buildPersonMesh(0xff9a3c, 0x2a3a5a);
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.x = -120;
    this.z = -120;
    this.heading = 0;
    this.walkPhase = 0;
    this.health = 100;
    this.armor = 0;
    this.shirtColor = 0xff9a3c;
    this.punchCooldown = 0;
    this.hurtCooldown = 0;
  }

  get pos() { return { x: this.x, z: this.z }; }

  setShirt(color) {
    this.shirtColor = color;
    this.parts.torso.material.color.setHex(color);
    this.parts.armL.material.color.setHex(color);
    this.parts.armR.material.color.setHex(color);
  }

  hurt(amount) {
    if (this.hurtCooldown > 0) return;
    this.hurtCooldown = 0.5;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
  }

  update(dt, input, camYaw, city) {
    this.punchCooldown -= dt;
    this.hurtCooldown -= dt;
    const axis = input.moveAxis();
    const moving = axis.x !== 0 || axis.y !== 0;
    const speed = input.sprint ? 10 : 6;
    if (moving) {
      // movement relative to camera yaw
      const fwdX = -Math.sin(camYaw), fwdZ = -Math.cos(camYaw);
      const rightX = Math.cos(camYaw), rightZ = -Math.sin(camYaw);
      const mx = fwdX * axis.y + rightX * axis.x;
      const mz = fwdZ * axis.y + rightZ * axis.x;
      const len = Math.hypot(mx, mz) || 1;
      const nx = this.x + (mx / len) * speed * dt;
      const nz = this.z + (mz / len) * speed * dt;
      const fixed = resolveCollisions(city, nx, nz, 0.7);
      this.x = fixed.x;
      this.z = fixed.z;
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += THREE.MathUtils.clamp(dh, -10 * dt, 10 * dt);
      this.walkPhase += dt * speed * 1.4;
      swingWalk(this.parts, this.walkPhase, 1);
    } else {
      swingWalk(this.parts, this.walkPhase, 0.1);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Instant heal pickup helper: restores health, capped at 100.
  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  punchPose() {
    this.parts.armR.rotation.x = -1.5;
  }
}

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    const shirts = [0xd2d2d2, 0x3aa86b, 0x2e7dd2, 0xe8b13c, 0xc96f9e, 0x7a9bb5];
    for (let i = 0; i < 18; i++) {
      const parts = buildPersonMesh(
        shirts[i % shirts.length],
        [0x222222, 0x3a4a6b, 0x5a3a2a][i % 3],
        [0xc98a5a, 0x8a5a3a, 0xe8b88a][i % 3]
      );
      const c = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const along = -180 + Math.random() * 360;
      const x = Math.random() < 0.5 ? along : c + 7.5;
      const z = Math.random() < 0.5 ? c + 7.5 : along;
      parts.group.position.set(x, 0, z);
      scene.add(parts.group);
      this.peds.push({
        parts, x, z, heading: Math.random() * Math.PI * 2,
        speed: 1.2 + Math.random() * 1.2, phase: Math.random() * 6,
        target: null, flee: 0, fleeX: 0, fleeZ: 0,
      });
    }
  }

  scare(x, z, radius = 40) {
    for (const p of this.peds) {
      if (Math.hypot(p.x - x, p.z - z) < radius) {
        p.flee = 3 + Math.random() * 2;
        p.fleeX = p.x - x;
        p.fleeZ = p.z - z;
      }
    }
  }

  update(dt) {
    for (const p of this.peds) {
      let tx, tz, speed = p.speed;
      if (p.flee > 0) {
        p.flee -= dt;
        tx = p.x + p.fleeX;
        tz = p.z + p.fleeZ;
        speed = 6.5;
      } else if (p.target) {
        tx = p.target.x; tz = p.target.z;
      } else {
        // pick a new sidewalk waypoint
        const c = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
        const along = -180 + Math.random() * 360;
        p.target = Math.random() < 0.5 ? { x: along, z: c + 7.5 } : { x: c + 7.5, z: along };
        continue;
      }
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2) { p.target = null; continue; }
      const want = Math.atan2(dx, dz);
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += THREE.MathUtils.clamp(dh, -4 * dt, 4 * dt);
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      const fixed = resolveCollisions(this.city, p.x, p.z, 0.6);
      p.x = fixed.x; p.z = fixed.z;
      p.phase += dt * speed * 2.2;
      swingWalk(p.parts, p.phase, 0.8);
      p.parts.group.position.set(p.x, 0, p.z);
      p.parts.group.rotation.y = p.heading;
    }
  }
}

export class Goon {
  constructor(scene, x, z, hp = 100) {
    this.parts = buildPersonMesh(0x3a3a44, 0x222222, 0x8a5a3a);
    this.mesh = this.parts.group;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.homeX = x; this.homeZ = z;
    this.hp = hp;
    this.maxHp = hp;
    this.heading = 0;
    this.attackCooldown = 0;
    this.phase = Math.random() * 6;
    this.dead = false;
    this.aggro = 26;
    this.scene = scene;
  }

  damage(amount) {
    this.hp -= amount;
    return this.hp <= 0;
  }

  update(dt, playerPos, onHitPlayer) {
    if (this.dead) return;
    this.attackCooldown -= dt;
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (d < this.aggro) {
      if (d > 1.6) {
        const want = Math.atan2(dx, dz);
        let dh = want - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += THREE.MathUtils.clamp(dh, -6 * dt, 6 * dt);
        this.x += Math.sin(this.heading) * 4.5 * dt;
        this.z += Math.cos(this.heading) * 4.5 * dt;
        moving = true;
      } else if (this.attackCooldown <= 0) {
        this.attackCooldown = 1.1;
        this.parts.armR.rotation.x = -1.5;
        onHitPlayer(9);
      }
    } else if (Math.hypot(this.x - this.homeX, this.z - this.homeZ) > 1) {
      // drift back to post
      const want = Math.atan2(this.homeX - this.x, this.homeZ - this.z);
      this.heading = want;
      this.x += Math.sin(this.heading) * 1.5 * dt;
      this.z += Math.cos(this.heading) * 1.5 * dt;
      moving = true;
    }
    if (moving) {
      this.phase += dt * 7;
      swingWalk(this.parts, this.phase, 1);
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  die() {
    this.dead = true;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.4;
  }
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.9, 0.9, 0.25);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
  }

  spawn(x, z, amount) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.set(x, 1.2, z);
    this.scene.add(m);
    this.items.push({ mesh: m, x, z, amount, t: Math.random() * 6 });
  }

  update(dt, playerPos, onCollect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt * 3;
      it.mesh.rotation.y = it.t;
      it.mesh.position.y = 1.2 + Math.sin(it.t) * 0.25;
      if (Math.hypot(it.x - playerPos.x, it.z - playerPos.z) < 2.2) {
        onCollect(it.amount);
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}
