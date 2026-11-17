// vehicles.js — cars, traffic, police and the helicopter.
// One clear job: everything with four wheels (plus one rotor) — building car
// meshes, arcade driving physics, traffic loops, police pursuit and the
// helicopter that hunts the player at wanted level 3 and above.

import * as THREE from 'three';
import { ROAD_COORDS, resolveCollisions, randomRoadPoint } from './city.js';

const CAR_COLORS = [0xd23c2e, 0x2e7dd2, 0xe8b13c, 0x3aa86b, 0x8a5fc0, 0xd2d2d2, 0x222222, 0xe87a2e, 0x4ab8c8];

export function buildCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.55,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.2, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), darkMat);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w);
    wheels.push(w);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headMat);
    h.position.set(x, 0.68, 2.12);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.08), tailMat);
    t.position.set(x, 0.68, -2.12);
    g.add(t);
  }
  let lightBar = null;
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    bar.position.set(0, 1.55, -0.25);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 1.68, -0.25);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.52),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.32, 1.68, -0.25);
    g.add(blue);
    lightBar = { red: red.material, blue: blue.material };
    // police livery stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.22),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    stripe.position.y = 0.55;
    g.add(stripe);
  }
  return { group: g, wheels, lightBar, color };
}

// A rectangular loop on the road grid for traffic to follow.
function makeLoop() {
  const a = ROAD_COORDS[Math.floor(Math.random() * 5)];
  const b = ROAD_COORDS[5 + Math.floor(Math.random() * 4)];
  const c = ROAD_COORDS[Math.floor(Math.random() * 5)];
  const d = ROAD_COORDS[5 + Math.floor(Math.random() * 4)];
  return [
    { x: a, z: c }, { x: b, z: c }, { x: b, z: d }, { x: a, z: d },
  ];
}

export class TrafficManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    for (let i = 0; i < 14; i++) this.spawnCar(true);
  }

  spawnCar(anywhere = false) {
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const { group, wheels } = buildCarMesh(color);
    const loop = makeLoop();
    const start = loop[Math.floor(Math.random() * 4)];
    group.position.set(start.x, 0, start.z);
    this.scene.add(group);
    this.cars.push({
      mesh: group, wheels, loop, seg: 0, color,
      speed: 7 + Math.random() * 5, heading: 0, stuck: 0,
    });
  }

  // Remove a traffic car near a point (carjacking) and hand its mesh over.
  takeNearest(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    this.cars.splice(this.cars.indexOf(best), 1);
    return best;
  }

  update(dt, playerPos, effects) {
    for (const c of this.cars) {
      const target = c.loop[(c.seg + 1) % c.loop.length];
      const dx = target.x - c.mesh.position.x;
      const dz = target.z - c.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) { c.seg = (c.seg + 1) % c.loop.length; continue; }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += THREE.MathUtils.clamp(dh, -1.8 * dt, 1.8 * dt);
      // slow down for a car ahead
      let targetSpeed = 8 + Math.sin(c.mesh.position.x * 0.1) * 2;
      for (const o of this.cars) {
        if (o === c) continue;
        const ox = o.mesh.position.x - c.mesh.position.x;
        const oz = o.mesh.position.z - c.mesh.position.z;
        const od = Math.hypot(ox, oz);
        // only brake for a car in front of us, in our lane direction
        const ahead = ox * Math.sin(c.heading) + oz * Math.cos(c.heading);
        if (od < 7 && ahead > 0) {
          targetSpeed = 0;
          break;
        }
      }
      c.speed += THREE.MathUtils.clamp(targetSpeed - c.speed, -10 * dt, 6 * dt);
      c.mesh.position.x += Math.sin(c.heading) * c.speed * dt;
      c.mesh.position.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.rotation.y = c.heading;
      const spin = c.speed * dt / 0.38;
      for (const w of c.wheels) w.rotation.x += spin;
      // respawn if it wandered too far from the player
      if (playerPos && Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z) > 320) {
        const p = randomRoadPoint();
        c.mesh.position.set(p.x, 0, p.z);
        c.loop = makeLoop();
        c.seg = 0;
      }
    }
  }
}

// The player's driven car: arcade handling, collisions, damage, smoke.
export class PlayerCar {
  constructor(scene, city, effects, audio) {
    this.scene = scene;
    this.city = city;
    this.effects = effects;
    this.audio = audio;
    this.mesh = null;
    this.wheels = [];
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.color = 0xd23c2e;
    this.crashCooldown = 0;
    this.smokeTimer = 0;
  }

  attach(carMesh, heading) {
    // Traffic cars carry the mesh as `.mesh`, the parked car as `.group`.
    this.mesh = carMesh.group ?? carMesh.mesh;
    this.wheels = carMesh.wheels;
    this.heading = heading;
    this.speed = 0;
    this.health = 100;
    this.color = carMesh.color ?? 0xd23c2e;
  }

  get pos() { return this.mesh ? this.mesh.position : null; }

  update(dt, input, traffic) {
    if (!this.mesh) return;
    this.crashCooldown -= dt;
    const axis = input.moveAxis();
    const forward = axis.y;
    const steer = axis.x;
    const handbrake = input.down('Space');
    const accel = 16;
    if (forward > 0) this.speed += accel * dt * (input.sprint ? 1.25 : 1);
    else if (forward < 0) this.speed -= (this.speed > 0.5 ? 26 : 11) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 7 * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    const maxSpeed = input.sprint ? 42 : 36;
    this.speed = THREE.MathUtils.clamp(this.speed, -13, maxSpeed);
    const steerAuthority = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1);
    this.heading += steer * 1.9 * steerAuthority * dt * (this.speed >= 0 ? 1 : -1) * (handbrake ? 1.5 : 1);
    const nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = resolveCollisions(this.city, nx, nz, 1.7);
    const hitWall = Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01;
    if (hitWall && Math.abs(this.speed) > 6) {
      this.damage(Math.abs(this.speed) * 0.9);
      this.effects.sparks(this.mesh.position.x, 1, this.mesh.position.z, 10);
      if (this.crashCooldown <= 0) { this.audio.crash(); this.crashCooldown = 0.5; }
      this.speed *= 0.45;
    }
    this.mesh.position.x = fixed.x;
    this.mesh.position.z = fixed.z;
    this.mesh.rotation.y = this.heading;
    // body roll + pitch for feel
    this.mesh.rotation.z = -steer * steerAuthority * 0.05;
    this.mesh.rotation.x = THREE.MathUtils.clamp(-forward * 0.02, -0.03, 0.03);
    const spin = this.speed * dt / 0.38;
    for (const w of this.wheels) w.rotation.x += spin;
    // traffic bumps
    for (const t of traffic.cars) {
      const dx = t.mesh.position.x - this.mesh.position.x;
      const dz = t.mesh.position.z - this.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) * 0.5;
        t.mesh.position.x += (dx / d) * push;
        t.mesh.position.z += (dz / d) * push;
        this.speed *= 0.82;
        this.damage(4);
        this.effects.sparks(this.mesh.position.x, 1, this.mesh.position.z, 6);
        if (this.crashCooldown <= 0) { this.audio.crash(); this.crashCooldown = 0.5; }
      }
    }
    // handbrake skids + damage smoke
    if (handbrake && Math.abs(this.speed) > 8) {
      this.effects.skid(this.mesh.position.x - Math.sin(this.heading) * 1.2,
        this.mesh.position.z - Math.cos(this.heading) * 1.2, this.heading);
      if (Math.random() < 0.4) this.effects.smoke(this.mesh.position.x, 0.4, this.mesh.position.z, 1);
    }
    if (this.health < 45) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.12;
        this.effects.smoke(this.mesh.position.x, 1.4, this.mesh.position.z, 1);
      }
    }
    this.audio.setEngine(Math.abs(this.speed) / 42, true);
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  get wrecked() { return this.health <= 0; }
}

export class PoliceManager {
  constructor(scene, city, effects, audio) {
    this.scene = scene;
    this.city = city;
    this.effects = effects;
    this.audio = audio;
    this.cars = [];
    this.bustTimer = 0;
    this.flashPhase = 0;
  }

  get count() { return this.cars.length; }

  setWanted(level, playerPos) {
    const want = level === 0 ? 0 : Math.min(1 + Math.floor(level / 2), 4);
    while (this.cars.length < want) this.spawn(playerPos);
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
  }

  spawn(playerPos) {
    const { group, wheels, lightBar } = buildCarMesh(0xf2f2f2, { police: true });
    const p = randomRoadPoint();
    // try to spawn on a road reasonably near the player
    let tries = 0;
    while (tries++ < 8 && Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 45) {
      const q = randomRoadPoint();
      p.x = q.x; p.z = q.z;
    }
    group.position.set(p.x, 0, p.z);
    this.scene.add(group);
    this.cars.push({ mesh: group, wheels, lightBar, heading: 0, speed: 0 });
  }

  update(dt, playerPos, playerSpeed, playerInCar, onBusted) {
    this.flashPhase += dt * 9;
    for (const c of this.cars) {
      const dx = playerPos.x - c.mesh.position.x;
      const dz = playerPos.z - c.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
      const targetSpeed = dist > 26 ? 34 : 30;
      c.speed += THREE.MathUtils.clamp(targetSpeed - c.speed, -18 * dt, 12 * dt);
      const nx = c.mesh.position.x + Math.sin(c.heading) * c.speed * dt;
      const nz = c.mesh.position.z + Math.cos(c.heading) * c.speed * dt;
      const fixed = resolveCollisions(this.city, nx, nz, 1.7);
      c.mesh.position.x = fixed.x;
      c.mesh.position.z = fixed.z;
      c.mesh.rotation.y = c.heading;
      const spin = c.speed * dt / 0.38;
      for (const w of c.wheels) w.rotation.x += spin;
      // ram the player
      if (dist < 3.6 && Math.abs(playerSpeed) < 3) {
        this.bustTimer += dt;
        if (this.bustTimer > 2.2) { this.bustTimer = 0; onBusted(); }
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      }
      if (dist < 3.2 && playerInCar) {
        this.effects.sparks(c.mesh.position.x, 1, c.mesh.position.z, 4);
      }
      // flashing light bar
      const on = Math.sin(this.flashPhase) > 0;
      if (c.lightBar) {
        c.lightBar.red.color.setHex(on ? 0xff2222 : 0x550000);
        c.lightBar.blue.color.setHex(on ? 0x111144 : 0x2244ff);
      }
    }
    // despawn stragglers that fell far behind
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z) > 300) {
        this.scene.remove(c.mesh);
        this.cars.splice(i, 1);
      }
    }
  }
}

export class Helicopter {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.rotor = null;
    this.angle = 0;
    this.active = false;
    this.locked = false;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 5.2),
      new THREE.MeshStandardMaterial({ color: 0x1c2a44, roughness: 0.4, metalness: 0.5 }));
    body.castShadow = true;
    g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.7 }));
    glass.position.set(0, 0.2, 2.0);
    g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x1c2a44, roughness: 0.4 }));
    tail.position.set(0, 0.3, -4.4);
    g.add(tail);
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(11, 0.08, 0.5);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const b1 = new THREE.Mesh(bladeGeo, bladeMat);
    const b2 = new THREE.Mesh(bladeGeo, bladeMat);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1); rotor.add(b2);
    rotor.position.y = 1.1;
    g.add(rotor);
    this.rotor = rotor;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, side: THREE.DoubleSide }));
    beam.position.y = -14;
    g.add(beam);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.y = -1.2;
    g.add(lamp);
    g.visible = false;
    scene.add(g);
    this.mesh = g;
  }

  setActive(on, playerPos) {
    this.active = on;
    this.mesh.visible = on;
    if (on && playerPos && !this.locked) this.mesh.position.set(playerPos.x + 14, 42, playerPos.z);
  }

  // Pin the helicopter to one spot (used to stage the cover screenshot).
  lock(x, y, z) {
    this.locked = true;
    this.mesh.position.set(x, y, z);
    this.mesh.visible = true;
    this.active = true;
  }

  update(dt, playerPos) {
    if (!this.active) return;
    if (this.locked) {
      this.rotor.rotation.y += dt * 22;
      return;
    }
    this.angle += dt * 0.45;
    const r = 20;
    this.mesh.position.x += ((playerPos.x + Math.cos(this.angle) * r) - this.mesh.position.x) * Math.min(1, dt * 1.2);
    this.mesh.position.z += ((playerPos.z + Math.sin(this.angle) * r) - this.mesh.position.z) * Math.min(1, dt * 1.2);
    this.mesh.position.y = 42 + Math.sin(this.angle * 2) * 1.5;
    this.mesh.rotation.y = Math.atan2(
      playerPos.x - this.mesh.position.x, playerPos.z - this.mesh.position.z);
    this.rotor.rotation.y += dt * 22;
  }
}
