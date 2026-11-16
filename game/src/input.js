// Input: keyboard state, mouse look through pointer lock, and the action keys.
// The game never reads input outside this module; main.js asks it what the
// player is doing each fixed step. Pointer lock is requested on the canvas
// click, and releasing it pauses the game.
export function createInput(canvas, hooks) {
  const keys = new Set();
  // Reused look accumulator: takeLook() returns the same object every step.
  const lookOut = { x: 0, y: 0 };
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;
  let buyToggleQueued = false;
  let grenadeQueued = false;
  let reloadQueued = false;
  let plantHeld = false;
  let slotQueued = null;
  let buyKeyQueued = null;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyB') buyToggleQueued = true;
    if (event.code === 'KeyG') grenadeQueued = true;
    if (event.code === 'KeyR') reloadQueued = true;
    if (event.code === 'KeyE') plantHeld = true;
    if (event.code === 'Digit1') slotQueued = 'primary';
    if (event.code === 'Digit2') slotQueued = 'sidearm';
    if (event.code === 'Digit3') slotQueued = 'grenade';
    if (event.code.startsWith('Digit')) {
      const d = event.code.slice(5);
      if (d >= '1' && d <= '5') buyKeyQueued = d;
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    if (event.code === 'KeyE') plantHeld = false;
  }

  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }

  function onMouseDown(event) {
    // Fire only while the pointer is locked, as the starter does: a click on
    // an overlay button must never become a shot.
    if (locked && event.button === 0) firing = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }

  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      // Releasing the lock pauses the game: drop held keys and fire state so
      // nothing stays stuck while the player is away.
      keys.clear();
      firing = false;
    }
    hooks.onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    keys,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    isLocked() {
      return locked;
    },
    isFiring() {
      return firing;
    },
    takeLook() {
      lookOut.x = lookX;
      lookOut.y = lookY;
      lookX = 0;
      lookY = 0;
      return lookOut;
    },
    takeBuyToggle() {
      const v = buyToggleQueued;
      buyToggleQueued = false;
      return v;
    },
    takeGrenade() {
      const v = grenadeQueued;
      grenadeQueued = false;
      return v;
    },
    takeReload() {
      const v = reloadQueued;
      reloadQueued = false;
      return v;
    },
    takeSlot() {
      const v = slotQueued;
      slotQueued = null;
      return v;
    },
    takeBuyKey() {
      const v = buyKeyQueued;
      buyKeyQueued = null;
      return v;
    },
    isPlantHeld() {
      return plantHeld;
    },
    clearTransient() {
      firing = false;
      buyToggleQueued = false;
      grenadeQueued = false;
      reloadQueued = false;
      slotQueued = null;
      buyKeyQueued = null;
    },
  };
}
