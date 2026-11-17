// city.js — Coral Verde: a sun-soaked coastal city at golden hour.
// One clear job: build the whole static world (ground, roads, buildings, beach,
// sea, palms, signs, lights) and describe it for gameplay (colliders, roads,
// districts, shop plots, named places).

import * as THREE from 'three';

export const WORLD_HALF = 200;          // city extents in world units
export const SEA_Z = 208;               // sea starts here (south edge, +z)
export const ROAD_COORDS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_WIDTH = 10;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(base, lit) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 10; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        const on = Math.random() < lit;
        g.fillStyle = on ? '#ffd98a' : '#1d2436';
        g.fillRect(x, y, 12, 14);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 14, w, 14);
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2b2b33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3a44'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    g.fillStyle = '#e8c85a'; g.fillRect(w / 2 - 2, 8, 4, 40);
    g.fillStyle = '#e8c85a'; g.fillRect(w / 2 - 2, 72, 4, 40);
  });
}

function signTexture(text, fg, bg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 56px Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

const BUILDING_COLORS = ['#c96f4a', '#d9a05b', '#7a9bb5', '#b5a08a', '#8a6f9e', '#5b8a7a', '#c98a8a', '#6b7fa3'];
const NEON_SIGNS = [
  { text: 'HOTEL LUMEN', fg: '#ff5ad0', bg: '#1c0b26' },
  { text: 'TACOS EL FARO', fg: '#ffd23c', bg: '#3a1500' },
  { text: 'CASINO VERDE', fg: '#7dff9a', bg: '#06231a' },
  { text: 'PIER 9', fg: '#6ec6ff', bg: '#0a1c33' },
  { text: 'NEON MOTEL', fg: '#ff9a3c', bg: '#26060a' },
  { text: 'BAR LA OLA', fg: '#ff5a5a', bg: '#1c0b26' },
  { text: 'CINE SOL', fg: '#ffe9a8', bg: '#2a0a2e' },
];

export function buildCity(scene) {
  const city = {
    colliders: [],        // { minX, maxX, minZ, maxZ }
    solidMeshes: [],      // meshes the camera raycast avoids
    neonMats: [],         // flickering sign materials
    palms: [],            // { top, phase }
    roadTex: null,
    seaMat: null,
    places: {},           // named gameplay spots
    districtAt(x, z) {
      if (z > 150) return 'MARINA & BEACH';
      if (x < -60 && z < -60) return 'OLD TOWN';
      if (x > 60 && z < -60) return 'HOSPITAL HILL';
      if (Math.abs(x) < 60 && Math.abs(z) < 60) return 'DOWNTOWN';
      if (x < -60) return 'WESTSIDE';
      if (x > 60) return 'EASTSIDE';
      return 'DOWNTOWN';
    },
  };

  // ---- sky, sun, fog ----
  scene.background = new THREE.Color(0xff8c4a);
  scene.fog = new THREE.Fog(0xe88a52, 180, 620);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(60, 90, 320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 800;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3a2a4a, 0.9));
  // low sun disc over the sea
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false })
  );
  sunDisc.position.set(40, 34, 480);
  sunDisc.lookAt(0, 34, 0);
  scene.add(sunDisc);

  // ---- ground: city slab, sand beach, sea ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 40, WORLD_HALF * 2 + 40),
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 120, 90),
    new THREE.MeshStandardMaterial({ color: 0xe8c98a, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, SEA_Z - 8);
  sand.receiveShadow = true;
  scene.add(sand);

  city.seaMat = new THREE.MeshStandardMaterial({
    color: 0x1e6f9e, roughness: 0.25, metalness: 0.35,
    emissive: 0x0a2a44, emissiveIntensity: 0.4,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), city.seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.02, SEA_Z + 110);
  scene.add(sea);
  // sun glitter strip on the water
  const glitter = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 260),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.35 })
  );
  glitter.rotation.x = -Math.PI / 2;
  glitter.position.set(40, 0.06, SEA_Z + 110);
  scene.add(glitter);

  // ---- roads + sidewalks ----
  city.roadTex = roadTexture();
  city.roadTex.wrapS = city.roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: city.roadTex, roughness: 0.9 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 1 });
  for (const c of ROAD_COORDS) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_WIDTH), roadMat.clone());
      road.material.map = city.roadTex.clone();
      road.material.map.repeat.set(400 / 16, 1);
      road.material.map.needsUpdate = true;
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0.1, c); }
      else { road.rotation.z = Math.PI / 2; road.position.set(c, 0.1, 0); }
      road.receiveShadow = true;
      scene.add(road);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(400, 3), walkMat);
      walk.rotation.x = -Math.PI / 2;
      if (horizontal) { walk.position.set(0, 0.12, c + 6.5); }
      else { walk.rotation.z = Math.PI / 2; walk.position.set(c + 6.5, 0.12, 0); }
      scene.add(walk);
    }
  }

  // ---- buildings ----
  const winTexes = BUILDING_COLORS.map((c) => windowTexture(c, 0.45));
  const specialBlocks = new Set(['-140,140', '140,140', '140,-140', '-140,-140', '0,0']);
  let signIdx = 0;
  for (let bx = -140; bx <= 140; bx += 40) {
    for (let bz = -140; bz <= 140; bz += 40) {
      if (specialBlocks.has(`${bx},${bz}`)) continue;
      if (bz >= 160) continue;
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const w = 14 + Math.random() * 10;
        const d = 14 + Math.random() * 10;
        const h = 12 + Math.random() * 34;
        const ox = (i === 0 ? -6 : 7) + (Math.random() * 4 - 2);
        const oz = (Math.random() * 8 - 4);
        const x = bx + ox, z = bz + oz;
        const tex = winTexes[Math.floor(Math.random() * winTexes.length)];
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        city.solidMeshes.push(b);
        // rooftop box (AC unit / water tank)
        if (Math.random() < 0.5) {
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(4, 2.5, 4),
            new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 1 })
          );
          roof.position.set(x + w / 4, h + 1.2, z);
          scene.add(roof);
        }
        // neon sign on some tall buildings
        if (h > 30 && Math.random() < 0.55) {
          const s = NEON_SIGNS[signIdx++ % NEON_SIGNS.length];
          const smat = new THREE.MeshBasicMaterial({ map: signTexture(s.text, s.fg, s.bg) });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), smat);
          sign.position.set(x, h - 3, z + d / 2 + 0.15);
          scene.add(sign);
          city.neonMats.push(smat);
        }
      }
    }
  }

  // ---- special plots (shops, hospital, hideout, park) ----
  function specialBuilding(x, z, w, h, d, color, signText, signFg, signBg) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    city.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    city.solidMeshes.push(b);
    if (signText) {
      const smat = new THREE.MeshBasicMaterial({ map: signTexture(signText, signFg, signBg) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), smat);
      sign.position.set(x, h + 0.5, z + d / 2 + 0.2);
      scene.add(sign);
      city.neonMats.push(smat);
    }
    return b;
  }
  specialBuilding(-140, 140, 26, 9, 18, 0x3a6ea8, 'SPRAY & SHINE', '#7dff9a', '#0a2a44');
  specialBuilding(140, 140, 26, 11, 18, 0x8a3a5a, 'IRON & THREAD', '#ffd23c', '#2a0a1e');
  specialBuilding(140, -140, 30, 16, 22, 0xe8e8e8, 'HOSPITAL VERDE', '#ff5a5a', '#ffffff');
  specialBuilding(-140, -140, 22, 10, 16, 0x6b4a8a, 'CASA CARMEN', '#ff9a3c', '#1c0b26');
  // central park: fountain + trees, no building
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x9ab8c8, roughness: 0.4 })
  );
  fountain.position.set(0, 0.6, 0);
  scene.add(fountain);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 2.5, 5, 10),
    new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.75 })
  );
  jet.position.set(0, 3.4, 0);
  scene.add(jet);

  // ---- pier + docks (south) ----
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(14, 1, 60),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 })
  );
  pier.position.set(60, 0.6, SEA_Z + 22);
  scene.add(pier);
  city.colliders.push({ minX: 53, maxX: 67, minZ: SEA_Z - 8, maxZ: SEA_Z + 52 });
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 1 })
    );
    crate.position.set(40 + i * 6, 2, 186);
    crate.castShadow = true;
    scene.add(crate);
    city.colliders.push({ minX: 38 + i * 6, maxX: 42 + i * 6, minZ: 184, maxZ: 188 });
  }

  // ---- palms ----
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a8a4a, roughness: 0.9 });
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.castShadow = true;
    g.add(trunk);
    const top = new THREE.Group();
    top.position.y = 7 * s;
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 4.5 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6 * s, 0.4 * s, Math.sin(a) * 1.6 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true;
      top.add(leaf);
    }
    g.add(top);
    g.position.set(x, 0, z);
    scene.add(g);
    city.palms.push({ top, phase: Math.random() * Math.PI * 2 });
  }
  for (let x = -180; x <= 180; x += 24) { palm(x + (Math.random() * 6 - 3), 172, 1.1); }
  for (const c of [-120, -40, 40, 120]) {
    palm(c - 8, 6, 0.9); palm(c + 10, -6, 0.9);
  }
  palm(-8, 8, 1); palm(8, -8, 1); palm(-10, -10, 0.9); palm(10, 10, 0.9);

  // ---- streetlights ----
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  for (const c of ROAD_COORDS) {
    for (const d of [-100, -20, 60, 140]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
      pole.position.set(c + 6.5, 3.5, d);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
      lamp.position.set(c + 6.5, 7.1, d);
      scene.add(lamp);
    }
  }

  // ---- named places for missions / shops / spawns ----
  city.places = {
    hideout: { x: -140, z: -118, label: "Carmen's house" },
    sprayShop: { x: -140, z: 118, label: 'Spray & Shine' },
    gunShop: { x: 140, z: 118, label: 'Iron & Thread' },
    hospital: { x: 140, z: -118, label: 'Hospital Verde' },
    docks: { x: 48, z: 182, label: 'Pier 9 docks' },
    casino: { x: 60, z: -100, label: 'Casino Verde' },
    plaza: { x: 0, z: 0, label: 'Plaza del Sol' },
    beach: { x: -60, z: 178, label: 'Playa Verde' },
    marina: { x: 60, z: 196, label: 'Marina' },
    northGate: { x: 0, z: -160, label: 'North gate' },
    playerSpawn: { x: -120, z: -100, label: 'Westside' },
  };

  // ---- per-frame life: sea shimmer, neon flicker, palm sway ----
  city.update = (dt, t) => {
    city.seaMat.emissiveIntensity = 0.35 + Math.sin(t * 0.7) * 0.12;
    for (let i = 0; i < city.neonMats.length; i++) {
      const m = city.neonMats[i];
      m.opacity = 1;
      if (Math.sin(t * 7 + i * 2.3) > 0.96) m.opacity = 0.35;
    }
    for (const p of city.palms) {
      p.top.rotation.z = Math.sin(t * 0.8 + p.phase) * 0.06;
      p.top.rotation.x = Math.cos(t * 0.6 + p.phase) * 0.05;
    }
  };

  return city;
}

// Circle (x,z,r) vs building AABBs: push the circle out, return corrected pos.
export function resolveCollisions(city, x, z, r) {
  for (const c of city.colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
  }
  const lim = WORLD_HALF - 4;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(SEA_Z + 40, z));
  return { x, z };
}

export function pointInCollider(city, x, z) {
  return city.colliders.some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
}

// Nearest road-grid coordinate to a value (traffic snaps to the grid).
export function nearestRoadCoord(v) {
  let best = ROAD_COORDS[0], bd = Infinity;
  for (const c of ROAD_COORDS) {
    const d = Math.abs(c - v);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// A random point on a road, for spawning traffic / police.
export function randomRoadPoint() {
  const horizontal = Math.random() < 0.5;
  const c = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
  const along = -180 + Math.random() * 360;
  return horizontal ? { x: along, z: c } : { x: c, z: along };
}
