// hud.js — the heads-up display and the minimap.
// One clear job: turn game state into the DOM (health, cash, stars, mission
// tracker, speed, radio) and draw the round 2D minimap from the city layout.

import { ROAD_COORDS, WORLD_HALF, SEA_Z } from './city.js';

export class Hud {
  constructor(city) {
    this.city = city;
    this.el = {
      missionTitle: document.getElementById('mission-title'),
      missionObjective: document.getElementById('mission-objective'),
      missionSub: document.getElementById('mission-sub'),
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      healthFill: document.getElementById('health-fill'),
      armorFill: document.getElementById('armor-fill'),
      speed: document.getElementById('speed'),
      weapon: document.getElementById('weapon-label'),
      radio: document.getElementById('radio-label'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      toast: document.getElementById('toast'),
      prompt: document.getElementById('interact-prompt'),
      district: document.getElementById('district-label'),
      damage: document.getElementById('damage-vignette'),
      crosshair: document.getElementById('crosshair'),
      hud: document.getElementById('hud'),
    };
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.lastDistrict = '';
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  banner(title, sub = '') {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerTimer = 2.8;
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastTimer = 3.2;
  }

  prompt(text) {
    if (!text) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.textContent = text;
    this.el.prompt.classList.remove('hidden');
  }

  // One-line objective ticker for the top-left box during timed stages.
  setObjective(text, sub = '') {
    this.el.missionObjective.textContent = text;
    this.el.missionSub.textContent = sub;
  }

  damageFlash() {
    this.el.damage.style.opacity = '1';
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 140);
  }

  update(dt, s) {
    // s: { health, armor, cash, wanted, speedMph, weaponName, radioName,
    //      missionTitle, missionObjective, missionSub, timerText,
    //      playerX, playerZ, heading, inCar, target, traffic, police,
    //      heliActive, heliX, heliZ, goons, district }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    this.el.missionTitle.textContent = s.missionTitle;
    this.el.missionObjective.textContent = s.missionObjective + (s.timerText ? `  ${s.timerText}` : '');
    this.el.missionSub.textContent = s.missionSub;
    const starSpans = this.el.stars.children;
    for (let i = 0; i < 5; i++) {
      const lit = i < s.wanted;
      starSpans[i].textContent = lit ? '★' : '☆';
      starSpans[i].className = lit ? (s.wanted >= 3 ? 'hot' : 'lit') : '';
    }
    this.el.cash.textContent = `$${Math.floor(s.cash).toLocaleString('en-US')}`;
    this.el.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.el.armorFill.style.width = `${Math.max(0, s.armor)}%`;
    this.el.speed.innerHTML = `${Math.round(s.speedMph)} <small>MPH</small>`;
    this.el.weapon.textContent = s.weaponName;
    this.el.radio.textContent = `RADIO: ${s.radioName}`;
    if (s.district !== this.lastDistrict) {
      this.lastDistrict = s.district;
      this.el.district.textContent = s.district;
    }
    this.el.crosshair.classList.toggle('hidden', s.inCar);
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const ctx = this.mm;
    const W = 220, R = W / 2;
    const scale = W / (WORLD_HALF * 2 + 60);
    const toMap = (x, z) => [R + x * scale, R + z * scale];
    ctx.clearRect(0, 0, W, W);
    // sea (south)
    ctx.fillStyle = '#0e3a5c';
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = '#1e6f9e';
    const [, seaY] = toMap(0, SEA_Z - 8);
    ctx.fillRect(0, seaY, W, W - seaY);
    // land
    ctx.fillStyle = '#3a3345';
    ctx.fillRect(0, 0, W, seaY);
    // buildings
    ctx.fillStyle = '#6b6480';
    for (const c of this.city.colliders) {
      const [x0, y0] = toMap(c.minX, c.minZ);
      const [x1, y1] = toMap(c.maxX, c.maxZ);
      ctx.fillRect(x0, y0, Math.max(1.5, x1 - x0), Math.max(1.5, y1 - y0));
    }
    // roads
    ctx.strokeStyle = '#8a8496';
    ctx.lineWidth = 2;
    for (const c of ROAD_COORDS) {
      const [x0] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, seaY); ctx.stroke();
      const [, y0] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    }
    // mission target
    if (s.target) {
      const [tx, ty] = toMap(s.target.x, s.target.z);
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, ty, 10 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // traffic (white), police (blue/red), goons (orange)
    ctx.fillStyle = '#dddddd';
    for (const t of s.traffic) {
      const [x, y] = toMap(t.x, t.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const p of s.police) {
      const [x, y] = toMap(p.x, p.z);
      ctx.fillStyle = '#4a8cff';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const g of s.goons) {
      const [x, y] = toMap(g.x, g.z);
      ctx.fillStyle = '#ff7a2a';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (s.heliActive) {
      const [x, y] = toMap(s.heliX, s.heliZ);
      ctx.fillStyle = '#ff5340';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.fillText('H', x - 2.5, y + 3);
    }
    // player arrow
    const [px, py] = toMap(s.playerX, s.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.heading);
    ctx.fillStyle = s.inCar ? '#7dff9a' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // view circle edge
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.stroke();
  }
}
