// input.js — keyboard state, edge-triggered presses, and mouse-drag camera look.
// One clear job: turn raw DOM events into a clean per-frame input snapshot.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;
    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.keys.delete(e.code); };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.target.closest('button') || e.target.closest('#shop-panel')) return;
      this.mouseDown = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseUp = (e) => {
      if (!this.enabled) return;
      if (this.mouseDown && Math.abs(e.clientX - this.lastX) < 6 &&
          Math.abs(e.clientY - this.lastY) < 6) {
        this.mouseClicked = true;
      }
      this.mouseDown = false;
      this.dragging = false;
    };
    this._onBlur = () => { this.keys.clear(); this.dragging = false; this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  // Movement axes in -1..1, from WASD or arrow keys.
  moveAxis() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }

  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }

  // True while any driving key is held (used to wake the engine sound).
  get driving() {
    return this.down('KeyW') || this.down('KeyS') || this.down('ArrowUp') || this.down('ArrowDown');
  }

  // Consume the frame's deltas; call once per frame after all systems read input.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
