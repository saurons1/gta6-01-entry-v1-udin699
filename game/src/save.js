// save.js — localStorage saves for Coral Verde.
// One clear job: serialize the player's progress (cash, health, jobs, guns,
// car, position) and restore it, with a safe fallback when nothing is saved.

const SAVE_KEY = 'coral-verde-save-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(state) {
  // state: { cash, health, armor, missionIndex, stage, weapons, ammo,
  //          shirtColor, carColor, playerX, playerZ, wanted }
  try {
    const data = {
      v: 1,
      savedAt: Date.now(),
      cash: Math.floor(state.cash),
      health: state.health,
      armor: state.armor,
      missionIndex: state.missionIndex,
      stage: state.stage,
      weapons: state.weapons,
      ammo: state.ammo,
      shirtColor: state.shirtColor,
      carColor: state.carColor,
      playerX: state.playerX,
      playerZ: state.playerZ,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// Human-readable summary of a save, for the Continue button label.
export function saveSummary(data) {
  if (!data) return '';
  const date = new Date(data.savedAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `Job ${Math.min(data.missionIndex + 1, 6)} · $${data.cash} · ${date}`;
}
