// missions.js — the six-job crime story of Coral Verde.
// One clear job: define the story arc, run its stage engine (go to, steal,
// fight, evade, channel, deliver), move the beacon, and pay out rewards.

import * as THREE from 'three';
import { Goon } from './player.js';

export const MISSIONS = [
  {
    name: 'JOB 1 — FIRST WHEELS',
    giver: 'Carmen Sol',
    brief: 'No wheels, no work. Take a car off the street and bring it to my house.',
    reward: 150,
    stages: [
      { kind: 'steal', text: 'Steal a car — walk up to traffic and press F', sub: 'Any car will do. The owner will not mind. Much.' },
      { kind: 'goto', x: -140, z: -118, radius: 8, text: 'Drive the car to Carmen\u2019s house (Old Town)', sub: 'Follow the yellow beacon.' },
    ],
  },
  {
    name: 'JOB 2 — COURIER RUN',
    giver: 'Carmen Sol',
    brief: 'A package for the Casino Verde. Fast. The house does not wait.',
    reward: 250,
    stages: [
      { kind: 'deliver', x: 60, z: -100, radius: 8, time: 75, text: 'Deliver the package to Casino Verde', sub: '75 seconds. Drive like the rent is due.' },
    ],
  },
  {
    name: 'JOB 3 — SHAKEDOWN',
    giver: 'Carmen Sol',
    brief: 'A debtor named Tito is holding court at Plaza del Sol. Remind him who he owes.',
    reward: 300,
    stages: [
      { kind: 'goto', x: 0, z: 0, radius: 10, text: 'Go to Plaza del Sol', sub: 'Tito and his friends are waiting.' },
      { kind: 'fight', x: 0, z: 0, goons: 3, text: 'Teach Tito\u2019s crew a lesson', sub: 'Click to punch. Get out of the car first.' },
    ],
  },
  {
    name: 'JOB 4 — HOT PURSUIT',
    giver: 'Carmen Sol',
    brief: 'The Verde PD is sniffing around my business. Make them chase you — and lose them.',
    reward: 400,
    stages: [
      { kind: 'evade', time: 45, text: 'Survive the heat — stay free for 45 seconds', sub: 'Wanted level 3. Do not get boxed in.' },
    ],
  },
  {
    name: 'JOB 5 — THE DROP',
    giver: 'Carmen Sol',
    brief: 'A crate at Pier 9. The dock crew got greedy. Take it back.',
    reward: 500,
    stages: [
      { kind: 'goto', x: 48, z: 182, radius: 9, text: 'Go to Pier 9 docks', sub: 'The crate is on the pier.' },
      { kind: 'fight', x: 48, z: 182, goons: 4, text: 'Clear the dock crew', sub: 'Four of them. Make it quick.' },
      { kind: 'goto', x: -140, z: -118, radius: 8, text: 'Bring the crate to Carmen\u2019s house', sub: 'Drive. Do not stop for anyone.' },
    ],
  },
  {
    name: 'JOB 6 — SUNSET SCORE',
    giver: 'Carmen Sol',
    brief: 'The marina vault. One job, one sunset, enough cash to leave this city — or own it.',
    reward: 1200,
    stages: [
      { kind: 'goto', x: 60, z: 196, radius: 9, text: 'Reach the marina vault', sub: 'Quiet so far. Too quiet.' },
      { kind: 'channel', x: 60, z: 196, radius: 7, time: 6, text: 'Crack the vault — stay in the circle', sub: 'Hold still. The alarm is already counting.' },
      { kind: 'goto', x: -140, z: -118, radius: 8, text: 'Escape to Carmen\u2019s house — wanted level 4', sub: 'Lose the helicopter if you can. Or just outrun it.' },
    ],
  },
];

export class MissionManager {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events; // { toast, banner, giveCash, setWanted, addWanted }
    this.index = 0;
    this.stage = 0;
    this.done = false;
    this.goons = [];
    this.timer = 0;
    this.channelTime = 0;
    this.stageStarted = false;
    // beacon: light pillar + ring + floating diamond
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.y = 30;
    this.beacon.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    this.beacon.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd23c })
    );
    diamond.position.y = 9;
    this.beacon.add(diamond);
    this.diamond = diamond;
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.beaconT = 0;
  }

  get mission() { return MISSIONS[this.index]; }
  get stageDef() { return this.mission ? this.mission.stages[this.stage] : null; }
  get goonsAlive() { return this.goons.filter((g) => !g.dead).length; }

  currentTarget() {
    const s = this.stageDef;
    if (!s || s.x === undefined) return null;
    return { x: s.x, z: s.z };
  }

  currentText() {
    if (this.done) return { title: 'CORAL VERDE — ALL JOBS DONE', objective: 'The sunset score is yours. Free roam: steal, race, and outrun the Verde PD.', sub: 'Carmen owes you a drink. The city owes you everything.' };
    const s = this.stageDef;
    return { title: this.mission.name, objective: s.text, sub: s.sub };
  }

  startStage() {
    const s = this.stageDef;
    this.stageStarted = true;
    this.timer = s.time ?? 0;
    this.channelTime = 0;
    if (s.kind === 'fight') {
      this.clearGoons();
      for (let i = 0; i < s.goons; i++) {
        const a = (i / s.goons) * Math.PI * 2;
        this.goons.push(new Goon(this.scene, s.x + Math.cos(a) * 6, s.z + Math.sin(a) * 6, 100));
      }
      this.events.toast(`Hostiles at ${s.text.split('—')[0] || 'the spot'} — ${s.goons} of them`);
    }
    if (s.kind === 'evade') {
      this.events.setWanted(3);
      this.events.toast('The Verde PD is on you — survive!');
    }
    if (s.kind === 'channel') {
      this.events.setWanted(2);
    }
    const t = this.currentTarget();
    this.beacon.visible = !!t;
    if (t) this.beacon.position.set(t.x, 0, t.z);
  }

  clearGoons() {
    for (const g of this.goons) this.scene.remove(g.mesh);
    this.goons = [];
  }

  // Skip the current job (debug / free-roam choice): forfeits its reward.
  skipJob() {
    if (this.done) return;
    this.clearGoons();
    this.index++;
    this.stage = 0;
    this.stageStarted = false;
    if (this.index >= MISSIONS.length) {
      this.done = true;
      this.beacon.visible = false;
    }
    this.events.toast('Job skipped — free roam');
  }

  // Called when the player gets busted or wasted mid-mission: restart the stage.
  onCaught() {
    this.clearGoons();
    this.stageStarted = false;
    this.events.toast('Job interrupted — back to the start of this stage');
  }

  completeStage() {
    const s = this.stageDef;
    this.clearGoons();
    this.stage++;
    this.stageStarted = false;
    if (this.stage >= this.mission.stages.length) {
      const reward = this.mission.reward;
      this.events.giveCash(reward);
      this.events.banner('JOB COMPLETE', `${this.mission.name} — +$${reward}`);
      this.events.cash();
      this.index++;
      this.stage = 0;
      if (this.index >= MISSIONS.length) {
        this.done = true;
        this.beacon.visible = false;
        this.events.banner('THE SUNSET SCORE', 'All six jobs done. Coral Verde is yours, Leo.');
        return;
      }
      const next = this.mission;
      this.events.toast(`New job from ${next.giver}: ${next.brief}`);
    }
    this.startStage();
  }

  failStage(reason) {
    this.clearGoons();
    this.stageStarted = false;
    this.events.toast(reason);
  }

  update(dt, ctx) {
    // ctx: { playerPos, inCar, wanted }
    if (this.done || !this.mission) { this.beacon.visible = false; return; }
    if (!this.stageStarted) this.startStage();
    const s = this.stageDef;
    this.beaconT += dt;
    this.beacon.visible = !!this.currentTarget();
    if (this.beacon.visible) {
      this.diamond.position.y = 9 + Math.sin(this.beaconT * 2.4) * 1.2;
      this.diamond.rotation.y = this.beaconT;
    }
    const p = ctx.playerPos;
    const dist = s.x !== undefined ? Math.hypot(p.x - s.x, p.z - s.z) : Infinity;
    if (s.kind === 'goto') {
      if (dist < s.radius) this.completeStage();
    } else if (s.kind === 'steal') {
      if (ctx.inCar) this.completeStage();
    } else if (s.kind === 'fight') {
      if (this.goonsAlive === 0) this.completeStage();
    } else if (s.kind === 'deliver') {
      this.timer -= dt;
      if (dist < s.radius) this.completeStage();
      else if (this.timer <= 0) this.failStage('Too slow — the package went cold. Try the run again.');
    } else if (s.kind === 'evade') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.events.setWanted(0);
        this.completeStage();
      }
    } else if (s.kind === 'channel') {
      if (dist < s.radius) {
        this.channelTime += dt;
        if (this.channelTime >= s.time) {
          this.events.setWanted(4);
          this.events.banner('VAULT CRACKED', 'Grab the cash and run!');
          this.completeStage();
        }
      } else {
        this.channelTime = Math.max(0, this.channelTime - dt);
      }
    }
  }

  // Countdown text for timed stages, or channel progress.
  timerText() {
    const s = this.stageDef;
    if (!s || this.done) return '';
    if (s.kind === 'deliver' || s.kind === 'evade') return `⏱ ${Math.max(0, Math.ceil(this.timer))}s`;
    if (s.kind === 'channel') return `CRACKING ${Math.min(100, Math.floor((this.channelTime / s.time) * 100))}%`;
    return '';
  }
}
