// main.js — Coral Verde: 3D open-world crime in a sunset coastal city.
// One clear job: wire every system together — renderer, camera, game loop,
// wanted level, carjacking, combat, shops, saves, menus, and the demo scenes
// used for screenshots. Original work: invented city, people and story.

import * as THREE from 'three';
import { buildCity, resolveCollisions } from './city.js';
import { Input } from './input.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { TrafficManager, PlayerCar, PoliceManager, Helicopter } from './vehicles.js';
import { Player, Pedestrians, Pickups } from './player.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { Shops } from './shops.js';
import { hasSave, saveGame, loadGame, saveSummary } from './save.js';

const params = new URLSearchParams(window.location.search);
const DEMO_SCENE = params.get('scene'); // chase | street | shop | drive
const AUTO_START = params.get('autostart') === '1' || !!DEMO_SCENE;
const LOW_FX = params.get('perf') === 'low'; // low graphics: no shadows, pixel ratio 1

// ---------- game state ----------
const state = {
  started: false,
  paused: false,
  cash: 0,
  wanted: 0,
  wantedTimer: 0,
  inCar: false,
  weapon: 'fists',
  weapons: { pistol: false, smg: false },
  ammo: { pistol: 0, smg: 0 },
  camYaw: Math.PI,
  camPitch: 0.32,
  camLift: 0, // raises the camera's look-at point (cover shot tilts up to the heli)
  demoChase: false, // cover staging: flankers + heli ride with the player
  dragTimer: 0,
  fireCooldown: 0,
  crimeCooldown: 0,
  parkedCar: null, // { group, wheels, color } when the player owns a car
};

// ---------- three setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(LOW_FX ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = !LOW_FX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
const raycaster = new THREE.Raycaster();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- systems ----------
const city = buildCity(scene);
const input = new Input();
const effects = new Effects(scene);
const audio = new AudioEngine();
const traffic = new TrafficManager(scene, city);
const playerCar = new PlayerCar(scene, city, effects, audio);
const police = new PoliceManager(scene, city, effects, audio);
const heli = new Helicopter(scene);
const player = new Player(scene);
const peds = new Pedestrians(scene, city);
const pickups = new Pickups(scene);
const hud = new Hud(city);
const shops = new Shops(city);

const events = {
  toast: (m) => hud.toast(m),
  banner: (t, s) => hud.banner(t, s),
  giveCash: (n) => { state.cash += n; },
  setWanted: (n) => { setWanted(n); },
  addWanted: (n) => { addWanted(n); },
  cash: () => audio.cash(),
};
const missions = new MissionManager(scene, events);

function setWanted(n) {
  state.wanted = THREE.MathUtils.clamp(n, 0, 5);
  state.wantedTimer = 25;
}

function addWanted(n) {
  if (state.crimeCooldown > 0) return;
  state.crimeCooldown = 1.5;
  setWanted(state.wanted + n);
}

function playerPos() {
  if (state.inCar && playerCar.pos) return { x: playerCar.pos.x, z: playerCar.pos.z };
  return player.pos;
}

function speedMph() {
  return state.inCar ? Math.abs(playerCar.speed) * 2.24 : 0;
}

function weaponName() {
  if (state.weapon === 'pistol') return `PISTOL · ${state.ammo.pistol} RDS`;
  if (state.weapon === 'smg') return `SMG · ${state.ammo.smg} RDS`;
  return 'FISTS';
}

// ---------- car enter / exit ----------
function tryEnterCar() {
  const p = player.pos;
  // own parked car first (no crime)
  if (state.parkedCar) {
    const d = Math.hypot(state.parkedCar.group.position.x - p.x, state.parkedCar.group.position.z - p.z);
    if (d < 5) {
      playerCar.attach(state.parkedCar, state.parkedCar.heading ?? 0);
      state.parkedCar = null;
      state.inCar = true;
      hud.toast('Back behind the wheel');
      return;
    }
  }
  const stolen = traffic.takeNearest(p.x, p.z, 5);
  if (stolen) {
    const heading = stolen.heading;
    playerCar.attach(stolen, heading);
    state.inCar = true;
    addWanted(1);
    hud.toast('Car stolen! The Verde PD noticed.');
    audio.horn();
  } else {
    hud.toast('No car close enough — get nearer and press F');
  }
}

function exitCar() {
  if (!playerCar.mesh) return;
  const heading = playerCar.heading;
  const px = playerCar.mesh.position.x - Math.sin(heading) * 2.5;
  const pz = playerCar.mesh.position.z - Math.cos(heading) * 2.5;
  const fixed = resolveCollisions(city, px, pz, 0.7);
  player.x = fixed.x;
  player.z = fixed.z;
  player.heading = heading;
  state.parkedCar = {
    group: playerCar.mesh,
    wheels: playerCar.wheels,
    color: playerCar.color,
    heading,
  };
  playerCar.mesh = null;
  playerCar.speed = 0;
  state.inCar = false;
  audio.setEngine(0, false);
}

// ---------- combat ----------
function shoot() {
  if (state.fireCooldown > 0 || state.weapon === 'fists') return;
  const isSmg = state.weapon === 'smg';
  if (state.ammo[state.weapon] <= 0) {
    hud.toast('Out of ammo — buy more at Iron & Thread');
    state.fireCooldown = 0.4;
    return;
  }
  state.ammo[state.weapon]--;
  state.fireCooldown = isSmg ? 0.13 : 0.38;
  const p = player.pos;
  const fx = -Math.sin(state.camYaw), fz = -Math.cos(state.camYaw);
  const mx = p.x + fx * 1.2, mz = p.z + fz * 1.2;
  effects.muzzle(mx, 1.5, mz);
  audio.gunshot();
  peds.scare(p.x, p.z, 45);
  // hitscan against mission goons in the camera cone
  let best = null, bd = 42;
  for (const g of missions.goons) {
    if (g.dead) continue;
    const dx = g.x - p.x, dz = g.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 42) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.94 && d < bd) { bd = d; best = g; }
  }
  if (best) {
    const died = best.damage(isSmg ? 22 : 34);
    effects.sparks(best.x, 1.4, best.z, 8);
    if (died) {
      best.die();
      pickups.spawn(best.x, best.z, 40);
      hud.toast('Hostile down — $40 on the ground');
    }
  }
  addWanted(1);
}

function punch() {
  if (state.fireCooldown > 0) return;
  state.fireCooldown = 0.45;
  player.punchPose();
  audio.punch();
  const p = player.pos;
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  for (const g of missions.goons) {
    if (g.dead) continue;
    const dx = g.x - p.x, dz = g.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.4 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
      const died = g.damage(30);
      effects.sparks(g.x, 1.4, g.z, 6);
      if (died) {
        g.die();
        pickups.spawn(g.x, g.z, 40);
        hud.toast('Hostile down — $40 on the ground');
      }
      return;
    }
  }
}

// ---------- busted / wasted ----------
function respawnAtHospital() {
  const h = city.places.hospital;
  if (state.inCar) { playerCar.mesh = null; state.inCar = false; state.parkedCar = null; }
  player.x = h.x;
  player.z = h.z - 6;
  player.health = 100;
  player.armor = 0;
  missions.onCaught();
  audio.setSiren(false);
}

function onBusted() {
  setWanted(0);
  police.setWanted(0, playerPos());
  heli.setActive(false);
  state.cash = Math.max(0, state.cash - 150);
  respawnAtHospital();
  document.getElementById('busted-screen').classList.remove('hidden');
  input.enabled = false;
}

function onWasted() {
  setWanted(0);
  police.setWanted(0, playerPos());
  heli.setActive(false);
  state.cash = Math.max(0, state.cash - 100);
  respawnAtHospital();
  document.getElementById('wasted-screen').classList.remove('hidden');
  input.enabled = false;
}

// ---------- menus ----------
function startGame(fromSave) {
  audio.init();
  if (fromSave) {
    const data = loadGame();
    if (data) applySave(data);
  }
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('pause-menu').classList.add('hidden');
  hud.show();
  state.started = true;
  input.enabled = true;
  hud.banner('CORAL VERDE', 'Six jobs. One sunset. Make it count.');
  const t = missions.currentText();
  hud.toast(`${missions.mission.giver}: ${missions.mission.brief}`);
  if (DEMO_SCENE) setupDemoScene(DEMO_SCENE);
}

function applySave(data) {
  state.cash = data.cash ?? 0;
  player.health = data.health ?? 100;
  player.armor = data.armor ?? 0;
  missions.index = Math.min(data.missionIndex ?? 0, MISSIONS_LEN - 1);
  missions.stage = data.stage ?? 0;
  state.weapons = data.weapons ?? { pistol: false, smg: false };
  state.ammo = data.ammo ?? { pistol: 0, smg: 0 };
  if (data.shirtColor !== undefined) player.setShirt(data.shirtColor);
  if (data.playerX !== undefined) { player.x = data.playerX; player.z = data.playerZ; }
  if (state.weapons.smg) state.weapon = 'smg';
  else if (state.weapons.pistol) state.weapon = 'pistol';
}
const MISSIONS_LEN = 6;

function doSave() {
  const p = playerPos();
  const ok = saveGame({
    cash: state.cash, health: player.health, armor: player.armor,
    missionIndex: missions.index, stage: missions.stage,
    weapons: state.weapons, ammo: state.ammo,
    shirtColor: player.shirtColor,
    carColor: state.parkedCar ? state.parkedCar.color : playerCar.color,
    playerX: p.x, playerZ: p.z,
  });
  document.getElementById('pause-save-note').textContent = ok
    ? `Saved — $${Math.floor(state.cash)}, job ${Math.min(missions.index + 1, 6)} of 6.`
    : 'Save failed (browser storage unavailable).';
}

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
document.getElementById('btn-save').addEventListener('click', doSave);
document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
document.getElementById('btn-sound').addEventListener('click', (e) => {
  audio.setMuted(!audio.muted);
  e.target.textContent = `SOUND: ${audio.muted ? 'OFF' : 'ON'}`;
});
document.getElementById('btn-wasted').addEventListener('click', () => {
  document.getElementById('wasted-screen').classList.add('hidden');
  input.enabled = true;
});
document.getElementById('btn-busted').addEventListener('click', () => {
  document.getElementById('busted-screen').classList.add('hidden');
  input.enabled = true;
});

if (hasSave()) {
  const btn = document.getElementById('btn-continue');
  btn.classList.remove('hidden');
  const data = loadGame();
  if (data) btn.textContent = `CONTINUE — ${saveSummary(data)}`;
}

function togglePause(force) {
  if (!state.started) return;
  const to = force !== undefined ? force : !state.paused;
  state.paused = to;
  document.getElementById('pause-menu').classList.toggle('hidden', !to);
  input.enabled = !to;
  if (to) doSave();
}

// ---------- demo scenes for screenshots / testing ----------
function stealCarForDemo(x, z, heading) {
  const stolen = traffic.takeNearest(x, z, 400);
  if (!stolen) return false;
  playerCar.attach(stolen, heading);
  playerCar.mesh.position.set(x, 0, z);
  state.inCar = true;
  return true;
}

// Keep the cover composition staged: in the chase demo the two flankers
// and the helicopter ride with the player, always in frame.
function stageChaseShot() {
  const pp = playerPos();
  const place = (c, x, z) => {
    c.mesh.position.set(x, 0, z);
    c.heading = 0;
    c.mesh.rotation.y = 0;
  };
  if (police.cars[0]) place(police.cars[0], pp.x - 5.5, pp.z + 10);
  if (police.cars[1]) place(police.cars[1], pp.x + 5.5, pp.z + 16);
  heli.lock(pp.x - 2, 18, pp.z + 40);
}

function setupDemoScene(name) {
  if (name === 'chase') {
    // sunset boulevard car chase: player driving south toward the sea and
    // the sunset, 4-star heat, police + helicopter in pursuit
    if (stealCarForDemo(0, 100, 0)) {
      playerCar.speed = 26;
      // bright hero car so it reads at small size
      playerCar.mesh.children[0].material.color.setHex(0xe84a2e);
    }
    setWanted(4);
    // stage two police cars flanking ahead of the player (light bars visible)
    police.setWanted(4, playerPos());
    const p = playerPos();
    if (police.cars[0]) {
      police.cars[0].mesh.position.set(p.x - 5.5, 0, p.z + 10);
      police.cars[0].heading = 0;
    }
    if (police.cars[1]) {
      police.cars[1].mesh.position.set(p.x + 5.5, 0, p.z + 16);
      police.cars[1].heading = 0;
    }
    // helicopter low ahead over the boulevard, in frame
    heli.lock(p.x - 2, 18, p.z + 40);
    state.demoChase = true;
    state.camYaw = Math.PI;
    state.camPitch = 0.3;
    state.camLift = 2;
  } else if (name === 'street') {
    // on-foot mission moment at the plaza: Leo in the open plaza block,
    // goons at the fountain ahead, camera clear of the buildings
    missions.index = 2; missions.stage = 1; missions.stageStarted = false;
    player.x = 0; player.z = -10;
    player.heading = Math.PI;
    state.camYaw = 0;
    state.camPitch = 0.35;
    setWanted(1);
  } else if (name === 'shop') {
    // neon street: Leo on the road south of Spray & Shine, sign in frame
    player.x = -140; player.z = 160;
    player.heading = Math.PI;
    state.camYaw = 0;
    state.camPitch = 0.15;
    setWanted(0);
  } else if (name === 'drive') {
    // golden-hour cruise down the beach boulevard, sunset ahead
    if (stealCarForDemo(-40, 120, 0)) {
      playerCar.speed = 18;
      playerCar.mesh.children[0].material.color.setHex(0xe8b13c);
    }
    state.camYaw = Math.PI;
  }
}

// ---------- camera ----------
function updateCamera(dt) {
  const p = playerPos();
  const target = new THREE.Vector3(p.x, state.inCar ? 1.6 : 1.7, p.z);
  // mouse drag orbits; in a car the camera eases back behind the car
  state.camYaw -= input.mouseDX * 0.0045;
  state.camPitch = THREE.MathUtils.clamp(state.camPitch + input.mouseDY * 0.003, 0.12, 0.85);
  if (input.mouseDX !== 0 || input.mouseDY !== 0) state.dragTimer = 1.2;
  state.dragTimer -= dt;
  if (state.inCar && Math.abs(playerCar.speed) > 6 && state.dragTimer <= 0) {
    const want = playerCar.heading + Math.PI;
    let dh = want - state.camYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    state.camYaw += dh * Math.min(1, dt * 1.6);
  }
  const dist = state.inCar ? 11 : 7.5;
  const height = state.inCar ? 4.2 : 2.6 + state.camPitch * 2.4;
  const desired = new THREE.Vector3(
    target.x + Math.sin(state.camYaw) * dist,
    target.y + height,
    target.z + Math.cos(state.camYaw) * dist
  );
  // pull the camera in when a building blocks the view
  const dir = desired.clone().sub(target);
  const len = dir.length();
  raycaster.set(target, dir.clone().normalize());
  raycaster.far = len;
  const hits = raycaster.intersectObjects(city.solidMeshes, false);
  let finalDist = len;
  if (hits.length > 0) finalDist = Math.max(2.2, hits[0].distance - 0.6);
  camera.position.copy(target).addScaledVector(dir.normalize(), finalDist);
  camera.lookAt(target.x, target.y + 0.4 + state.camLift, target.z);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let firstFrame = true;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (state.started && !state.paused) {
    state.crimeCooldown -= dt;
    state.fireCooldown -= dt;
    // pause / radio / weapon keys
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) togglePause(true);
    if (input.wasPressed('KeyR')) {
      const name = audio.nextStation();
      hud.toast(`Radio: ${name}`);
    }
    if (input.wasPressed('Digit1')) { state.weapon = 'fists'; }
    if (input.wasPressed('Digit2') && state.weapons.pistol) { state.weapon = 'pistol'; }
    if (input.wasPressed('Digit3') && state.weapons.smg) { state.weapon = 'smg'; }
    if (input.wasPressed('KeyF')) { state.inCar ? exitCar() : tryEnterCar(); }
    // shops
    const shop = shops.nearbyShop(player.x, player.z);
    if (!state.inCar && shop && !shops.isOpen) {
      hud.prompt(`Press E — ${shop === 'spray' ? 'Spray & Shine' : 'Iron & Thread'}`);
      if (input.wasPressed('KeyE')) {
        shops.open(shop, shopState(), shopHooks());
      }
    } else if (shops.isOpen && input.wasPressed('KeyE')) {
      shops.close();
      hud.prompt(null);
    } else if (!shop) {
      hud.prompt(null);
    }
    // movement + combat
    if (state.inCar) {
      playerCar.update(dt, input, traffic);
      if (playerCar.wrecked) {
        effects.explosion(playerCar.mesh.position.x, 1, playerCar.mesh.position.z);
        audio.crash();
        const px = playerCar.mesh.position.x, pz = playerCar.mesh.position.z;
        playerCar.mesh = null;
        state.inCar = false;
        player.x = px + 3; player.z = pz + 3;
        player.hurt(25);
        hud.damageFlash();
        hud.toast('Your car is wrecked!');
      }
      if (input.mouseClicked) audio.horn();
    } else {
      player.update(dt, input, state.camYaw, city);
      if (input.mouseClicked || (input.mouseDown && state.weapon === 'smg')) {
        if (state.weapon === 'fists') punch();
        else shoot();
      }
    }
    // wanted decay: quiet streets cool the heat
    if (state.wanted > 0) {
      state.wantedTimer -= dt;
      const nearestCop = police.cars.reduce((m, c) => Math.min(m,
        Math.hypot(c.mesh.position.x - playerPos().x, c.mesh.position.z - playerPos().z)), Infinity);
      if (state.wantedTimer <= 0 && nearestCop > 70) {
        setWanted(state.wanted - 1);
        if (state.wanted === 0) hud.toast('You lost the cops. For now.');
      }
    }
    police.setWanted(state.wanted, playerPos());
    police.update(dt, playerPos(), speedMph() / 2.24, state.inCar, onBusted);
    heli.setActive(state.wanted >= 3, playerPos());
    heli.update(dt, playerPos());
    if (state.demoChase) stageChaseShot();
    audio.setSiren(police.count > 0);
    traffic.update(dt, playerPos(), effects);
    peds.update(dt);
    // mission goons fight back
    for (const g of missions.goons) {
      if (g.dead) continue;
      g.update(dt, player.pos, (dmg) => {
        if (!state.inCar) { player.hurt(dmg); hud.damageFlash(); }
      });
    }
    pickups.update(dt, player.pos, (amount) => {
      state.cash += amount;
      audio.cash();
      hud.toast(`+$${amount} picked up`);
    });
    missions.update(dt, { playerPos: playerPos(), inCar: state.inCar, wanted: state.wanted });
    if (player.health <= 0) onWasted();
    // HUD
    const mt = missions.currentText();
    hud.update(dt, {
      health: player.health, armor: player.armor, cash: state.cash, wanted: state.wanted,
      speedMph: speedMph(), weaponName: weaponName(), radioName: audio.stationName(),
      missionTitle: mt.title, missionObjective: mt.objective, missionSub: mt.sub,
      timerText: missions.timerText(),
      playerX: playerPos().x, playerZ: playerPos().z,
      heading: state.inCar ? playerCar.heading : player.heading,
      inCar: state.inCar, target: missions.currentTarget(),
      traffic: traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      police: police.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      heliActive: heli.active, heliX: heli.mesh.position.x, heliZ: heli.mesh.position.z,
      goons: missions.goons.filter((g) => !g.dead).map((g) => ({ x: g.x, z: g.z })),
      district: city.districtAt(playerPos().x, playerPos().z),
    });
  }
  city.update(dt, t);
  effects.update(dt);
  audio.updateMusic();
  if (state.started) updateCamera(dt);
  renderer.render(scene, camera);
  input.endFrame();
  if (firstFrame) {
    firstFrame = false;
    window.__gameReady = true;
  }
}

function shopState() {
  return {
    cash: state.cash,
    inCar: state.inCar,
    carHealth: playerCar.health,
    carColor: playerCar.color,
    weapons: state.weapons,
    armor: player.armor,
    wanted: state.wanted,
  };
}

function shopHooks() {
  return {
    spend: (n) => { state.cash -= n; },
    toast: (m) => hud.toast(m),
    audio,
    repairCar: () => { playerCar.health = 100; },
    setCarColor: (c) => {
      if (!playerCar.mesh) return;
      playerCar.mesh.children[0].material.color.setHex(c);
      playerCar.color = c;
    },
    giveWeapon: (id) => {
      state.weapons[id] = true;
      state.ammo[id] = id === 'pistol' ? 24 : 64;
      state.weapon = id;
    },
    refillAmmo: () => {
      if (state.weapons.pistol) state.ammo.pistol += 24;
      if (state.weapons.smg) state.ammo.smg += 64;
    },
    lowerWanted: (n) => setWanted(state.wanted - n),
    setArmor: (n) => { player.armor = n; },
    setShirt: (c) => player.setShirt(c),
  };
}

// debug / test handle (used by the maker's own playtests)
window.__game = {
  state, player, playerCar, missions, traffic, police, heli, input, renderer,
  setWanted, addWanted,
  teleport(x, z) { player.x = x; player.z = z; if (playerCar.mesh) { playerCar.mesh.position.x = x; playerCar.mesh.position.z = z; } },
  giveCash(n) { state.cash += n; },
  start() { if (!state.started) startGame(false); },
};

if (AUTO_START) startGame(false);
frame();
