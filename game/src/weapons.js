// The arsenal: four guns and a frag grenade. Each weapon owns its numbers —
// damage, headshot multiplier, fire rate, magazine, reload, spread and recoil —
// so gunplay is data, not special cases. Spread punishes moving and firing fast;
// standing still, crouching or walking slow is what makes shots land.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 2.0,
    mag: 12, reserve: 48, fireGap: 0.15, auto: false, reloadTime: 1.4,
    spreadStill: 0.003, spreadMove: 0.02, spreadAir: 0.05,
    recoilPitch: 0.011, recoilYaw: 0.004, falloff: 18, tracer: '#ffd9a0',
  },
  vk7: {
    id: 'vk7', name: 'VK-7 Carbine', price: 2700, damage: 34, headMult: 2.0,
    mag: 30, reserve: 90, fireGap: 0.096, auto: true, reloadTime: 2.0,
    spreadStill: 0.0022, spreadMove: 0.026, spreadAir: 0.055,
    recoilPitch: 0.013, recoilYaw: 0.005, falloff: 30, tracer: '#ffb36b',
  },
  pdw9: {
    id: 'pdw9', name: 'PDW-9 Rasp', price: 1500, damage: 24, headMult: 2.0,
    mag: 32, reserve: 96, fireGap: 0.07, auto: true, reloadTime: 1.7,
    spreadStill: 0.0035, spreadMove: 0.022, spreadAir: 0.05,
    recoilPitch: 0.009, recoilYaw: 0.006, falloff: 16, tracer: '#ffe9a8',
  },
  lancer: {
    id: 'lancer', name: 'Lancer-7 Marksman', price: 3800, damage: 72, headMult: 2.0,
    mag: 10, reserve: 30, fireGap: 0.9, auto: false, reloadTime: 2.6,
    spreadStill: 0.0006, spreadMove: 0.06, spreadAir: 0.09,
    recoilPitch: 0.05, recoilYaw: 0.008, falloff: 60, tracer: '#fff3c4',
  },
};

export const GRENADE = { id: 'frag', name: 'Frag Grenade', price: 300, maxCarry: 2, damage: 95, radius: 6.5 };
export const KEVLAR = { id: 'kevlar', name: 'Kevlar Vest', price: 650, armor: 50 };

function boxPart(material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// One view model per weapon: distinct silhouettes built from boxes, so the
// player can tell at a glance which gun is in hand.
function buildViewModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#20262d'), roughness: 0.6, metalness: 0.35 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa7b1'), roughness: 0.35, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.55, metalness: 0.2 });
  const group = new THREE.Group();
  let muzzle = new THREE.Vector3(0, 0, -0.8);
  if (def.id === 'p9') {
    group.add(boxPart(steel, 0.06, 0.07, 0.3, 0, 0.01, -0.1));
    group.add(boxPart(dark, 0.055, 0.11, 0.09, 0, -0.06, 0.05));
    muzzle.set(0, 0.01, -0.28);
  } else if (def.id === 'vk7') {
    group.add(boxPart(dark, 0.09, 0.1, 0.42, 0, 0, -0.05));
    group.add(boxPart(steel, 0.045, 0.045, 0.42, 0, 0.025, -0.44));
    group.add(boxPart(dark, 0.075, 0.08, 0.22, 0, -0.02, 0.26));
    group.add(boxPart(grip, 0.05, 0.14, 0.06, 0, -0.1, 0.02));
    group.add(boxPart(steel, 0.02, 0.05, 0.02, 0, 0.07, -0.28));
    muzzle.set(0, 0.025, -0.68);
  } else if (def.id === 'pdw9') {
    group.add(boxPart(dark, 0.1, 0.11, 0.34, 0, 0, -0.02));
    group.add(boxPart(steel, 0.06, 0.06, 0.3, 0, 0.01, -0.34));
    group.add(boxPart(dark, 0.06, 0.16, 0.07, 0, -0.11, 0.06));
    group.add(boxPart(grip, 0.05, 0.09, 0.2, 0, -0.09, -0.12));
    muzzle.set(0, 0.01, -0.5);
  } else {
    group.add(boxPart(dark, 0.08, 0.09, 0.55, 0, 0, -0.1));
    group.add(boxPart(steel, 0.035, 0.035, 0.55, 0, 0.02, -0.6));
    group.add(boxPart(dark, 0.06, 0.06, 0.16, 0, 0.07, -0.12));
    group.add(boxPart(grip, 0.05, 0.12, 0.06, 0, -0.09, 0.08));
    group.add(boxPart(dark, 0.07, 0.07, 0.18, 0, -0.02, 0.3));
    muzzle.set(0, 0.02, -0.9);
  }
  group.position.set(0.24, -0.21, -0.45);
  group.userData.muzzle = muzzle;
  return group;
}

export function createWeaponSet(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildViewModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(flashLight);

  const slots = {
    primary: null, // weapon id or null
    sidearm: 'p9',
    grenades: 0,
  };
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  let current = 'p9';
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0 };
  models[current].visible = true;

  function def() {
    return WEAPONS[current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === current;
    const muzzle = models[current].userData.muzzle;
    flash.position.set(0.24 + muzzle.x, -0.21 + muzzle.y, -0.45 + muzzle.z - 0.12);
    flashLight.position.set(0.24, -0.16, -0.6);
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.45 + state.kick;
    model.rotation.x = state.kick * 2.4;
    flash.visible = state.flash > 0;
    if (state.flash > 0) flash.rotation.z = state.flash * 40;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.5 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - ammo[current].mag;
        const take = Math.min(need, ammo[current].reserve);
        ammo[current].mag += take;
        ammo[current].reserve -= take;
      }
    }
  }

  return {
    slots,
    ammo,
    state,
    def,
    current() { return current; },
    step,
    ready() {
      return ammo[current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.05;
      state.bloom = Math.min(0.05, state.bloom + d.fireGap * 0.35);
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || ammo[current].mag === d.mag || ammo[current].reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed, airborne, crouching) {
      const d = def();
      const move = Math.min(1, speed / 5.0);
      let s = d.spreadStill + move * d.spreadMove + state.bloom;
      if (airborne) s += d.spreadAir;
      if (crouching) s *= 0.7;
      return s;
    },
    damageAt(distance) {
      const d = def();
      return distance > d.falloff ? d.damage * Math.max(0.5, 1 - (distance - d.falloff) / 60) : d.damage;
    },
    equip(id) {
      if (!WEAPONS[id] || (id !== slots.sidearm && id !== slots.primary)) return false;
      if (current === id) return false;
      current = id;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      showModel();
      return true;
    },
    buy(id) {
      if (!WEAPONS[id] || id === 'p9') return false;
      slots.primary = id;
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      current = id;
      state.reloadLeft = 0;
      showModel();
      return true;
    },
    hasPrimary() {
      return slots.primary !== null;
    },
    refill() {
      for (const d of Object.values(WEAPONS)) ammo[d.id] = { mag: d.mag, reserve: d.reserve };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetLoadout() {
      slots.primary = null;
      slots.grenades = 0;
      current = 'p9';
      this.refill();
      showModel();
    },
  };
}
