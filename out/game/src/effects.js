// effects.js — particles, skid marks, muzzle flashes and explosions.
// One clear job: cheap pooled visual feedback for driving, shooting and crashes.

import * as THREE from 'three';

const MAX_PARTICLES = 320;
const MAX_SKIDS = 90;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
      );
      m.visible = false;
      scene.add(m);
      this.particles.push({
        mesh: m, life: 0, maxLife: 1,
        vx: 0, vy: 0, vz: 0, grow: 0, fade: 1, gravity: 0,
      });
    }
    this.cursor = 0;
    // skid marks: dark translucent planes laid flat on the road
    this.skids = [];
    const skidGeo = new THREE.PlaneGeometry(0.55, 1.6);
    for (let i = 0; i < MAX_SKIDS; i++) {
      const m = new THREE.Mesh(
        skidGeo,
        new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0 })
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.skids.push({ mesh: m, life: 0 });
    }
    this.skidCursor = 0;
    this.skidTimer = 0;
    // explosion flash light (shared, reused)
    this.flash = new THREE.PointLight(0xffa040, 0, 40);
    scene.add(this.flash);
    this.flashTimer = 0;
  }

  _spawn(x, y, z, color, opts = {}) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    const s = opts.size ?? 1;
    p.mesh.scale.setScalar(s);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = opts.opacity ?? 0.95;
    p.life = p.maxLife = opts.life ?? 0.7;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0; p.vz = opts.vz ?? 0;
    p.grow = opts.grow ?? 0;
    p.fade = opts.fade ?? 1;
    p.gravity = opts.gravity ?? 0;
  }

  smoke(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      this._spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), 0x888888, {
        life: 1.1 + Math.random() * 0.5, size: 0.9 + Math.random() * 0.7,
        vy: 1.6 + Math.random(), vx: (Math.random() - 0.5) * 1.2,
        vz: (Math.random() - 0.5) * 1.2, opacity: 0.5, grow: 1.6, fade: 0.55,
      });
    }
  }

  sparks(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 8;
      this._spawn(x, y, z, Math.random() < 0.5 ? 0xffd23c : 0xff7a2a, {
        life: 0.35 + Math.random() * 0.3, size: 0.55,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 4,
        gravity: -14,
      });
    }
  }

  // A short burst of dust when the player lands or a car bumps a kerb.
  dust(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(x, y, z, 0xcbb89a, {
        life: 0.6 + Math.random() * 0.4, size: 0.8,
        vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 0.8,
        opacity: 0.45, grow: 1.4,
      });
    }
  }

  muzzle(x, y, z) {
    this._spawn(x, y, z, 0xffe9a0, { life: 0.09, size: 1.6, opacity: 1 });
    this.sparks(x, y, z, 3);
  }

  explosion(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 12;
      this._spawn(x, y + Math.random() * 2, z,
        [0xff5340, 0xff9a3c, 0xffd23c, 0x666666][i % 4], {
          life: 0.6 + Math.random() * 0.8, size: 1.1 + Math.random(),
          vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
          vy: 3 + Math.random() * 7, gravity: -9, grow: 1.2,
        });
    }
    this.smoke(x, y + 1, z, 6);
    this.flash.position.set(x, y + 3, z);
    this.flash.intensity = 60;
    this.flashTimer = 0.28;
  }

  skid(x, z, heading) {
    this.skidTimer -= 1;
    if (this.skidTimer > 0) return;
    this.skidTimer = 3;
    const s = this.skids[this.skidCursor];
    this.skidCursor = (this.skidCursor + 1) % MAX_SKIDS;
    s.mesh.visible = true;
    s.mesh.position.set(x, 0.16, z);
    s.mesh.rotation.z = -heading;
    s.mesh.material.opacity = 0.55;
    s.life = 7;
  }

  update(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; p.mesh.material.opacity = 0; continue; }
      p.vy += p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.grow) p.mesh.scale.addScalar(p.grow * dt);
      const k = p.life / p.maxLife;
      p.mesh.material.opacity = Math.min(1, k * p.fade * 1.6);
    }
    for (const s of this.skids) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, Math.min(0.55, s.life * 0.09));
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.intensity = Math.max(0, this.flashTimer / 0.28) * 60;
    }
  }
}
