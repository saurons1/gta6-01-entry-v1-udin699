// shops.js — Spray & Shine and Iron & Thread.
// One clear job: the two shop zones, their DOM panels, and what money buys
// (repairs, paint, guns, ammo, armour, clothes).

const PAINT_COLORS = [0xd23c2e, 0x2e7dd2, 0xe8b13c, 0x3aa86b, 0x8a5fc0, 0xe87a2e, 0x111111, 0xd2d2d2];

export class Shops {
  constructor(city) {
    this.city = city;
    this.panel = document.getElementById('shop-panel');
    this.title = document.getElementById('shop-title');
    this.desc = document.getElementById('shop-desc');
    this.itemsEl = document.getElementById('shop-items');
    this.openShop = null; // 'spray' | 'gun' | null
    this.onClose = null;
    document.getElementById('btn-shop-close').addEventListener('click', () => this.close());
  }

  // Which shop (if any) the player is standing in front of.
  nearbyShop(x, z) {
    const s = this.city.places.sprayShop;
    const g = this.city.places.gunShop;
    if (Math.hypot(x - s.x, z - s.z) < 16) return 'spray';
    if (Math.hypot(x - g.x, z - g.z) < 16) return 'gun';
    return null;
  }

  // Toggle: open if closed, close if this shop is already open.
  toggle(kind, state, hooks) {
    if (this.openShop === kind) { this.close(); return; }
    this.open(kind, state, hooks);
  }

  open(kind, state, hooks) {
    // state: { cash, carHealth, carColor, weapons, armor, shirtColor }
    // hooks: { spend(n), toast(msg), setCarColor(c), giveWeapon(id), setArmor(n), setShirt(c), audio }
    this.openShop = kind;
    const isSpray = kind === 'spray';
    this.title.textContent = isSpray ? 'SPRAY & SHINE' : 'IRON & THREAD';
    this.desc.textContent = isSpray
      ? 'Repairs, fresh paint, and a clean record — the Verde PD looks the other way for a price.'
      : 'Guns, ammo, armour and fresh threads. Cash only, no questions.';
    this.itemsEl.innerHTML = '';
    const items = isSpray ? [
      { name: 'Full repair', price: 60, can: () => state.inCar && state.carHealth < 100,
        hint: state.inCar ? 'Fixes your car' : 'Get in a car first',
        run: () => hooks.repairCar() },
      { name: 'Fresh paint job', price: 120, can: () => state.inCar,
        hint: state.inCar ? 'New colour, new you' : 'Get in a car first',
        run: () => hooks.setCarColor(PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)]) },
      { name: 'Lose the heat (1 star)', price: 200, can: () => state.wanted > 0,
        hint: 'Bribes the dispatcher',
        run: () => hooks.lowerWanted(1) },
    ] : [
      { name: 'Pistol — Verde 9', price: 250, can: () => !state.weapons.pistol,
        hint: state.weapons.pistol ? 'Owned' : '12 rounds, fast hands',
        run: () => hooks.giveWeapon('pistol') },
      { name: 'SMG — Chatterbox', price: 600, can: () => !state.weapons.smg,
        hint: state.weapons.smg ? 'Owned' : 'Sprays lead, holds 32',
        run: () => hooks.giveWeapon('smg') },
      { name: 'Ammo box', price: 40, can: () => state.weapons.pistol || state.weapons.smg,
        hint: 'Refills every gun you own',
        run: () => hooks.refillAmmo() },
      { name: 'Kevlar vest', price: 150, can: () => state.armor < 100,
        hint: 'Absorbs damage first',
        run: () => hooks.setArmor(100) },
      { name: 'New jacket', price: 80, can: () => true,
        hint: 'A fresh look for Leo',
        run: () => hooks.setShirt([0x2e7dd2, 0x3aa86b, 0x111111, 0xe8b13c][Math.floor(Math.random() * 4)]) },
    ];
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'shop-item';
      const label = document.createElement('span');
      label.textContent = `${it.name} — ${it.hint}`;
      const btn = document.createElement('button');
      btn.textContent = `$${it.price}`;
      btn.disabled = !it.can() || state.cash < it.price;
      btn.addEventListener('click', () => {
        if (state.cash < it.price) { hooks.toast('Not enough cash'); return; }
        hooks.spend(it.price);
        it.run();
        hooks.audio.blip(880);
        hooks.toast(`${it.name} — bought for $${it.price}`);
        this.open(kind, state, hooks); // refresh the panel
      });
      row.appendChild(label);
      row.appendChild(btn);
      this.itemsEl.appendChild(row);
    }
    this.panel.classList.remove('hidden');
  }

  close() {
    this.openShop = null;
    this.panel.classList.add('hidden');
    if (this.onClose) this.onClose();
  }

  get isOpen() { return this.openShop !== null; }
}
