// MERIDIAN PROTOCOL — boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. The player shoots hitscan rays against bot
// bodies (headshots pay double) and the world; bots see, hear, route, plant and
// defuse; rounds pay out and start again. `?shot=start|play|buy|end&seed=N`
// stages a deterministic frame for a capture, renders it twice, then freezes
// it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp, pick, range } from './rng.js';
import { createWorld, WAYPOINTS } from './world.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE, KEVLAR } from './weapons.js';
import { createBot } from './bots.js';
import { createMatch, BUY_TIME } from './rounds.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const fx = createFx(scene);
const audio = createAudio();
const player = createPlayer(world.colliders, world.spawns.attack[1]);
const weapons = createWeaponSet(camera);
const input = createInput(renderer.domElement, { onLockChange });

// The spike: a small glowing charge that rides with its carrier and sits on
// the site once planted.
const spikeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.2, 0.2),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.4, roughness: 0.4 }),
);
spikeMesh.visible = false;
scene.add(spikeMesh);

const hud = createHud({
  onPlay: () => {
    audio.ensure();
    if (match.match.phase === 'matchEnd') restartMatch();
    if (shot) return;
    input.requestLock();
  },
  onBuy: (id) => buyItem(id),
});

const match = createMatch({
  onPhase: (phase) => {
    if (phase === 'buy') {
      buyOpen = true;
      hud.showBuy(true, match.match.money, { primary: weapons.slots.primary, armor: player.state.armor, grenades: weapons.slots.grenades });
      hud.banner(`ROUND ${match.match.round}`, 'Buy phase — press B to close, 1-5 to buy', 2200);
    } else if (phase === 'live') {
      buyOpen = false;
      hud.showBuy(false);
    }
  },
  onRoundEnd: (winner, reason) => {
    buyOpen = false;
    hud.showBuy(false);
    hud.hideChannel();
    hud.banner(
      winner === 'attack' ? 'ROUND WON' : 'ROUND LOST',
      reason,
      3600,
    );
    if (winner === 'attack') audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd: (winner) => {
    hud.showOverlay('matchEnd', winner === 'attack' ? 'MATCH WON' : 'MATCH LOST');
    input.releaseLock();
  },
  onRoundStart: () => resetRound(),
  onPlanted: () => {
    hud.banner('SPIKE PLANTED', 'Defend it — 35 seconds to detonation', 3000);
    hud.setSpike(false);
    assignDefuseDuty();
  },
  onExploded: (pos) => {
    fx.explosion(new THREE.Vector3(pos.x, 0.6, pos.z), 6.5);
    audio.explosion();
    fx.addShake(0.5);
  },
});

// Bots: two Vanguard allies, four Hollow defenders.
const bots = [];
const ALLY_NAMES = ['VEX', 'ORIN'];
const ENEMY_NAMES = ['RUST', 'ASH', 'GRIM', 'FANG'];
for (let i = 0; i < 2; i += 1) {
  const b = createBot(scene, { id: `ally${i}`, team: 'attack', rng, colliders: world.colliders });
  b.bot.name = ALLY_NAMES[i];
  b.bot.reaction = range(rng, 0.05, 0.2);
  b.bot.eyePos = new THREE.Vector3();
  bots.push(b);
}
for (let i = 0; i < 4; i += 1) {
  const b = createBot(scene, { id: `enemy${i}`, team: 'defend', rng, colliders: world.colliders });
  b.bot.name = ENEMY_NAMES[i];
  b.bot.reaction = range(rng, 0.05, 0.25);
  b.bot.eyePos = new THREE.Vector3();
  bots.push(b);
}
const playerEyePos = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const losRaycaster = new THREE.Raycaster();
losRaycaster.far = 60;
const shotRay = new THREE.Ray();
const hitPoint = new THREE.Vector3();
const bodyBox = new THREE.Box3();
const headBox = new THREE.Box3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const losOrigin = new THREE.Vector3();
const grenadeNext = new THREE.Vector3();
const plantCheckVec = new THREE.Vector3();

let spikeCarrier = 'player'; // 'player' or a bot id
let plantProgress = 0;
let lastPlantBeep = 0;
let buyOpen = false;
let frozen = false;
let started = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
const noise = [];
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22282e'), roughness: 0.5, metalness: 0.6 });

function livingBots(team) {
  return bots.filter((b) => b.bot.team === team && b.bot.alive);
}

function allBotMeshes() {
  const out = [];
  for (const b of bots) if (b.bot.alive) out.push(...b.bot.meshes);
  return out;
}

function hasLineOfSight(x1, y1, z1, x2, y2, z2) {
  tmpVec.set(x2 - x1, y2 - y1, z2 - z1);
  const dist = tmpVec.length();
  if (dist < 0.001) return true;
  tmpVec.multiplyScalar(1 / dist);
  losOrigin.set(x1, y1, z1);
  losRaycaster.set(losOrigin, tmpVec);
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(world.shootables, false).length === 0;
}

// One shot resolution for player and bots alike: the nearest of the world,
// any bot body, or the player's analytic hitbox wins.
function resolveShot(origin, dir, maxDist, shooterBot) {
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const targets = world.shootables.concat(
    allBotMeshes().filter((m) => m.userData.bot !== shooterBot && (!shooterBot || m.userData.bot.team !== shooterBot.team)),
  );
  const hits = raycaster.intersectObjects(targets, false);
  let best = hits.length ? { point: hits[0].point, distance: hits[0].distance, object: hits[0].object } : null;
  // The player's analytic box: body and head are separate so headshots pay.
  if (player.state.alive && shooterBot) {
    const p = player.state;
    bodyBox.min.set(p.position.x - 0.34, p.position.y, p.position.z - 0.34);
    bodyBox.max.set(p.position.x + 0.34, p.position.y + p.height, p.position.z + 0.34);
    headBox.min.set(p.position.x - 0.2, p.position.y + p.height - 0.34, p.position.z - 0.2);
    headBox.max.set(p.position.x + 0.2, p.position.y + p.height, p.position.z + 0.2);
    shotRay.origin.copy(origin);
    shotRay.direction.copy(dir);
    const headHit = shotRay.intersectBox(headBox, tmpVec);
    if (headHit && tmpVec.distanceTo(origin) < (best?.distance ?? Infinity)) {
      best = { point: tmpVec.clone(), distance: tmpVec.distanceTo(origin), playerPart: 'head' };
    } else {
      const bodyHit = shotRay.intersectBox(bodyBox, tmpVec2);
      if (bodyHit && tmpVec2.distanceTo(origin) < (best?.distance ?? Infinity)) {
        best = { point: tmpVec2.clone(), distance: tmpVec2.distanceTo(origin), playerPart: 'body' };
      }
    }
  }
  return best;
}

function applyShotDamage(hit, shooterTeam, shooterName, damage, isPlayerShot) {
  if (!hit) return;
  if (hit.playerPart) {
    const dealt = player.damage(damage, true);
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) {
      hud.killfeed(shooterName, 'YOU', hit.playerPart === 'head');
      transferSpike();
    }
    return dealt;
  }
  const bot = hit.object?.userData?.bot;
  if (!bot) return 0;
  const part = hit.object.userData.part;
  const dealt = damage * (part === 'head' ? 2 : 1);
  const killed = bot ? bots.find((b) => b.bot === bot)?.damage(dealt, part) : false;
  if (isPlayerShot) {
    hud.hitMarker(killed);
    audio.hit(killed);
    if (killed) {
      match.onKill('attack', bot.team);
      hud.killfeed('YOU', bot.name, part === 'head');
    }
  } else if (killed) {
    match.onKill(shooterTeam, bot.team);
    hud.killfeed(shooterName, bot.name, part === 'head');
  }
  return dealt;
}

function transferSpike() {
  if (match.match.spike.state !== 'carried') return;
  const ally = livingBots('attack')[0];
  if (ally) {
    spikeCarrier = ally.bot.id;
    ally.bot.hasSpike = true;
    hud.setSpike(false);
  } else {
    spikeCarrier = null;
  }
}

function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.pullTrigger();
    return;
  }
  player.eyePosition(tmpVec);
  camera.getWorldDirection(tmpDir);
  const spread = weapons.spread(player.groundSpeed(), !player.state.onGround, player.state.crouching);
  tmpDir.x += (rng() * 2 - 1) * spread;
  tmpDir.y += (rng() * 2 - 1) * spread;
  tmpDir.z += (rng() * 2 - 1) * spread;
  tmpDir.normalize();
  const hit = resolveShot(tmpVec, tmpDir, 90, null);
  const end = hit ? hit.point : tmpVec2.copy(tmpVec).addScaledVector(tmpDir, 60);
  const muzzle = tmpVec.clone();
  camera.getWorldDirection(tmpDir);
  muzzle.addScaledVector(tmpDir, 0.9);
  muzzle.y -= 0.12;
  fx.tracer(muzzle, end, def.tracer);
  if (hit) applyShotDamage(hit, 'attack', 'YOU', weapons.damageAt(hit.distance), true);
  noise.push({ x: tmpVec.x, z: tmpVec.z, time: elapsed, radius: 26 });
  weapons.pullTrigger();
  player.recoil(def.recoilPitch + rng() * 0.004, (rng() * 2 - 1) * def.recoilYaw);
  audio.shot(def.id);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.slots.grenades);
  hud.setCrosshairSpread(4 + weapons.spread(player.groundSpeed(), !player.state.onGround, player.state.crouching) * 900);
}

function botShoot(bot, targetPos, aimError, dist) {
  // bot is the state object: its eye position is the precomputed eyePos
  // (refreshed once per step); only the wrapper carries an eye() method.
  tmpVec.copy(bot.eyePos);
  tmpDir.copy(targetPos).sub(tmpVec).normalize();
  tmpDir.x += (rng() * 2 - 1) * aimError;
  tmpDir.y += (rng() * 2 - 1) * aimError;
  tmpDir.z += (rng() * 2 - 1) * aimError;
  tmpDir.normalize();
  const hit = resolveShot(tmpVec, tmpDir, 60, bot);
  const end = hit ? hit.point : tmpVec2.copy(tmpVec).addScaledVector(tmpDir, 45);
  const muzzle = tmpVec.clone().addScaledVector(tmpDir, 0.7);
  muzzle.y -= 0.1;
  fx.tracer(muzzle, end, '#ff8a7a');
  if (hit) {
    const dmg = 17 * (hit.playerPart === 'head' ? 2 : 1) * Math.max(0.5, 1 - dist / 90);
    applyShotDamage(hit, bot.team, bot.name, dmg, false);
  }
  noise.push({ x: tmpVec.x, z: tmpVec.z, time: elapsed, radius: 26 });
  const playerDist = Math.hypot(player.state.position.x - tmpVec.x, player.state.position.z - tmpVec.z);
  audio.enemyShot(playerDist);
}

function throwGrenade() {
  if (weapons.slots.grenades <= 0 || match.match.phase !== 'live') return;
  weapons.slots.grenades -= 1;
  player.eyePosition(tmpVec);
  camera.getWorldDirection(tmpDir);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(tmpVec).addScaledVector(tmpDir, 0.6);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: tmpDir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4, 0)),
    fuse: 2.2,
    bounced: false,
  });
  audio.click();
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.slots.grenades);
}

const grenadeProbe = new THREE.Box3();
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 13 * dt;
    const next = grenadeNext.copy(g.mesh.position).addScaledVector(g.vel, dt);
    grenadeProbe.min.set(next.x - 0.12, next.y - 0.12, next.z - 0.12);
    grenadeProbe.max.set(next.x + 0.12, next.y + 0.12, next.z + 0.12);
    let hitWall = false;
    for (const c of world.colliders) {
      if (grenadeProbe.intersectsBox(c)) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      g.vel.multiplyScalar(-0.42);
      g.vel.y = Math.abs(g.vel.y) * 0.42 + 1.2;
      g.bounced = true;
      g.mesh.position.y = Math.max(g.mesh.position.y, 0.15);
    } else {
      g.mesh.position.copy(next);
    }
    if (g.mesh.position.y < 0.12) {
      g.mesh.position.y = 0.12;
      g.vel.y = Math.abs(g.vel.y) * 0.42;
      g.vel.x *= 0.8;
      g.vel.z *= 0.8;
      g.bounced = true;
    }
    if (g.fuse <= 0 || (g.bounced && g.fuse < 0.8)) {
      explodeGrenade(g.mesh.position);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(at) {
  fx.explosion(at, GRENADE.radius);
  audio.explosion();
  const distToPlayer = Math.hypot(player.state.position.x - at.x, player.state.position.z - at.z);
  if (distToPlayer < 2) fx.addShake(0.5);
  noise.push({ x: at.x, z: at.z, time: elapsed, radius: 30 });
  const victims = [];
  if (player.state.alive && distToPlayer < GRENADE.radius) {
    const dmg = GRENADE.damage * (1 - distToPlayer / (GRENADE.radius * 1.4));
    player.damage(Math.max(12, dmg), false);
    hud.damageFlash();
    if (!player.state.alive) transferSpike();
  }
  for (const b of bots) {
    if (!b.bot.alive) continue;
    const d = Math.hypot(b.bot.position.x - at.x, b.bot.position.z - at.z);
    if (d < GRENADE.radius) victims.push({ b, d });
  }
  for (const { b, d } of victims) {
    const dmg = Math.max(15, GRENADE.damage * (1 - d / (GRENADE.radius * 1.4)));
    const killed = b.damage(dmg, 'body');
    if (killed) {
      match.onKill('attack', b.bot.team);
      hud.killfeed('YOU', b.bot.name, false);
      audio.hit(true);
    }
  }
}

// Buy-menu order, matching the 1-5 keys shown on its rows.
const BUY_IDS = ['vk7', 'pdw9', 'lancer', 'frag', 'kevlar'];

function buyItem(id) {
  if (match.match.phase !== 'buy') return;
  const def = id === 'frag' ? GRENADE : id === 'kevlar' ? KEVLAR : WEAPONS[id];
  if (!def || match.match.money < def.price) return;
  if (id === 'frag') {
    if (weapons.slots.grenades >= GRENADE.maxCarry) return;
    weapons.slots.grenades += 1;
  } else if (id === 'kevlar') {
    if (player.state.armor >= KEVLAR.armor) return;
    player.state.armor = KEVLAR.armor;
  } else {
    if (weapons.slots.primary === id) return;
    weapons.buy(id);
  }
  match.match.money -= def.price;
  audio.buy();
  hud.setMoney(match.match.money);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.slots.grenades);
  hud.setHealth(player.state.health, player.state.armor);
  hud.buildBuy(match.match.money, { primary: weapons.slots.primary, armor: player.state.armor, grenades: weapons.slots.grenades });
}

function assignDefuseDuty() {
  const defenders = livingBots('defend');
  defenders.sort((a, b) => {
    const da = Math.hypot(a.bot.position.x - match.match.spike.position.x, a.bot.position.z - match.match.spike.position.z);
    const db = Math.hypot(b.bot.position.x - match.match.spike.position.x, b.bot.position.z - match.match.spike.position.z);
    return da - db;
  });
  for (const b of bots) b.bot.defuseDuty = false;
  for (const b of defenders.slice(0, 2)) b.bot.defuseDuty = true;
}

function assignRoutes() {
  const site = match.match.spike.site;
  const lanes = ['west2', 'mid', 'east2'];
  const siteNode = site === 'A' ? 'siteA' : 'siteB';
  const approach = site === 'A' ? 'siteAin' : 'siteBin';
  for (const b of bots) {
    if (b.bot.team === 'attack') {
      const lane = pick(rng, lanes);
      const path = [lane, approach, siteNode];
      b.setRoute(path);
      b.bot.patrolNodes = [siteNode, approach, 'mid'];
      b.bot.defaultNode = siteNode;
      b.bot.holdCrouch = false;
    } else {
      b.bot.patrolNodes = ['mid', 'west2', 'east2', 'defMid'];
      b.bot.defaultNode = 'defMid';
      b.bot.holdCrouch = true;
      if (b.bot.name === 'RUST' || b.bot.name === 'ASH') {
        b.setRoute(site === 'A' ? ['west3', 'siteAin', 'defA'] : ['east3', 'siteBin', 'defB']);
        b.bot.defaultNode = site === 'A' ? 'defA' : 'defB';
      } else if (b.bot.name === 'GRIM') {
        b.setRoute(site === 'A' ? ['east3', 'siteBin', 'defB'] : ['west3', 'siteAin', 'defA']);
        b.bot.defaultNode = site === 'A' ? 'defB' : 'defA';
      } else {
        b.setRoute(['midN', 'defMid']);
        b.bot.defaultNode = 'defMid';
      }
    }
  }
}

function resetRound() {
  player.reset(world.spawns.attack[1]);
  weapons.refill();
  spikeCarrier = 'player';
  plantProgress = 0;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  const atkSpawns = world.spawns.attack;
  const defSpawns = world.spawns.defend;
  let ai = 0;
  let di = 0;
  for (const b of bots) {
    const spawn = b.bot.team === 'attack' ? atkSpawns[ai++ % atkSpawns.length] : defSpawns[di++ % defSpawns.length];
    b.reset(spawn, elapsed);
    b.bot.yaw = b.bot.team === 'attack' ? Math.PI : 0;
    b.bot.defuseDuty = false;
  }
  assignRoutes();
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.slots.grenades);
  hud.setMoney(match.match.money);
  hud.setScore(match.match.score.attack, match.match.score.defend, match.match.round);
  hud.setSpike(true);
  hud.hideChannel();
}

function restartMatch() {
  match.match.round = 1;
  match.match.score.attack = 0;
  match.match.score.defend = 0;
  match.match.money = 800;
  match.match.kills.attack = 0;
  match.match.kills.defend = 0;
  weapons.resetLoadout();
  player.state.armor = 0;
  match.startRound();
  hud.hideOverlay();
  input.requestLock();
}

// One bot context, built once and refreshed in place every step: the hot loop
// allocates nothing — no fresh enemy lists, no fresh spike object, no closures.
// Enemy descriptors are preallocated per bot; the two target lists are refilled
// (length = 0, then push) instead of rebuilt. Eye positions are refreshed once
// per step, not once per bot.
const playerEnemy = { alive: true, eyePos: playerEyePos, speed: 0, isPlayer: true, ref: 'player' };
const botEnemyDescs = bots.map((b) => ({ alive: true, eyePos: b.bot.eyePos, speed: 3.4, isPlayer: false, ref: b.bot }));
const enemiesForAttack = [];
const enemiesForDefend = [];
const botCtx = {
  time: 0,
  noise,
  spike: { state: 'carried', site: 'A', position: match.match.spike.position },
  hasLineOfSight,
  botShoot,
  phase: 'buy',
  onChannel(bot, kind, progress) {
    if (kind === 'plant') hud.showChannel('PLANTING SPIKE', progress);
    else hud.showChannel('DEFUSING SPIKE', progress);
    if (elapsed - lastPlantBeep > 0.45) {
      lastPlantBeep = elapsed;
      audio.plantBeep(progress);
    }
  },
  onPlanted(bot) {
    match.setSpikePosition(bot.position.x, bot.position.z);
    match.onPlant();
    bot.hasSpike = false;
    hud.hideChannel();
  },
  onDefused() {
    match.onDefuse();
    hud.hideChannel();
  },
  enemies: null,
};

function step(dt) {
  elapsed += dt;
  match.step(dt);
  // Prune old noise.
  for (let i = noise.length - 1; i >= 0; i -= 1) if (elapsed - noise[i].time > 2) noise.splice(i, 1);

  if (match.match.phase === 'buy' || match.match.phase === 'live') {
    const look = input.takeLook();
    if (!shot) player.look(look.x, look.y);
    player.step(dt, input.keys);
    weapons.step(dt);
    fx.step(dt);
    stepGrenades(dt);

    if (input.takeBuyToggle() && match.match.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, match.match.money, { primary: weapons.slots.primary, armor: player.state.armor, grenades: weapons.slots.grenades });
    }
    if (input.takeReload()) {
      if (weapons.reload()) audio.reload();
    }
    const slot = input.takeSlot();
    const buyKey = input.takeBuyKey();
    // With the buy menu open, 1-5 buy (as the menu says); otherwise 1/2
    // switch weapon slots. The buy key wins so one press never does both.
    if (buyOpen && match.match.phase === 'buy' && buyKey) {
      buyItem(BUY_IDS[Number(buyKey) - 1]);
    } else if (slot === 'primary' && weapons.hasPrimary()) weapons.equip(weapons.slots.primary);
    else if (slot === 'sidearm') weapons.equip('p9');
    if (input.takeGrenade()) throwGrenade();

    if (match.match.phase === 'live') {
      if (input.isFiring() && weapons.ready()) playerShoot();
      else if (input.isFiring() && weapons.ammo[weapons.current()].mag === 0 && weapons.state.cooldown === 0) audio.dryFire();
    }

    // Planting: hold E inside the target site while carrying the spike.
    if (match.match.phase === 'live' && match.match.spike.state === 'carried' && spikeCarrier === 'player' && player.state.alive) {
      const site = world.sites[match.match.spike.site];
      const p = player.state.position;
      const inside = site.box.containsPoint(plantCheckVec.set(p.x, 1, p.z));
      if (inside && input.isPlantHeld()) {
        plantProgress += dt / 3;
        hud.showChannel('PLANTING SPIKE', plantProgress);
        if (elapsed - lastPlantBeep > 0.45) {
          lastPlantBeep = elapsed;
          audio.plantBeep(plantProgress);
        }
        if (plantProgress >= 1) {
          plantProgress = 0;
          match.setSpikePosition(p.x, p.z);
          match.onPlant();
          hud.hideChannel();
        }
      } else {
        if (plantProgress > 0) hud.hideChannel();
        plantProgress = Math.max(0, plantProgress - dt / 1.5);
      }
    }

    // Bots: refresh the shared context in place, then step each bot against it.
    botCtx.time = elapsed;
    botCtx.phase = match.match.phase;
    botCtx.spike.state = match.match.spike.state;
    botCtx.spike.site = match.match.spike.site;
    botCtx.spike.position = match.match.spike.position;
    enemiesForAttack.length = 0;
    enemiesForDefend.length = 0;
    player.eyePosition(playerEyePos);
    if (player.state.alive) {
      playerEnemy.speed = player.groundSpeed();
      enemiesForDefend.push(playerEnemy);
    }
    for (let i = 0; i < bots.length; i += 1) {
      const w = bots[i];
      const b = w.bot;
      if (!b.alive) continue;
      w.eye(b.eyePos);
      if (b.team === 'attack') enemiesForDefend.push(botEnemyDescs[i]);
      else enemiesForAttack.push(botEnemyDescs[i]);
    }
    for (const b of bots) {
      botCtx.enemies = b.bot.team === 'defend' ? enemiesForDefend : enemiesForAttack;
      b.step(dt, botCtx);
    }

    // Living counts, counted once per step (no filter allocations).
    let atkAlive = player.state.alive ? 1 : 0;
    let defAlive = 0;
    for (const b of bots) {
      if (!b.bot.alive) continue;
      if (b.bot.team === 'attack') atkAlive += 1;
      else defAlive += 1;
    }

    // Elimination ends the round.
    if (match.match.phase === 'live') {
      if (defAlive === 0) match.award('attack', 'TEAM ELIMINATED');
      else if (atkAlive === 0) match.award('defend', 'TEAM ELIMINATED');
    }

    // HUD sync.
    hud.setTimer(match.match.timer, match.match.phase);
    hud.setScore(match.match.score.attack, match.match.score.defend, match.match.round);
    hud.setAlive(atkAlive, 3, defAlive, 4);
    hud.setHealth(player.state.health, player.state.armor);
    hud.step(dt);
  }

  // Spike mesh follows its carrier, or sits on the site when planted.
  if (match.match.spike.state === 'planted' || match.match.spike.state === 'exploded') {
    spikeMesh.visible = match.match.spike.state === 'planted';
    spikeMesh.position.set(match.match.spike.position.x, 0.35, match.match.spike.position.z);
    spikeMesh.rotation.y += dt * 2;
  } else if (match.match.spike.state === 'carried' && spikeCarrier === 'player' && player.state.alive) {
    spikeMesh.visible = true;
    spikeMesh.position.set(player.state.position.x, 0.5, player.state.position.z + 0.4);
    spikeMesh.rotation.y += dt * 2;
  } else if (match.match.spike.state === 'carried' && spikeCarrier) {
    const carrier = bots.find((b) => b.bot.id === spikeCarrier);
    if (carrier && carrier.bot.alive) {
      spikeMesh.visible = true;
      spikeMesh.position.set(carrier.bot.position.x, 0.5, carrier.bot.position.z + 0.4);
    } else {
      spikeMesh.visible = false;
    }
  } else {
    spikeMesh.visible = false;
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (match.match.phase !== 'matchEnd') {
    hud.showOverlay(started ? 'paused' : 'start', '');
  }
}

function syncCamera() {
  if (!player.state.alive && match.match.phase === 'live') {
    const ally = livingBots('attack')[0];
    if (ally) {
      ally.eye(tmpVec);
      camera.position.copy(tmpVec);
      camera.rotation.set(0, ally.bot.yaw, 0, 'YXZ');
      return;
    }
  }
  player.eyePosition(camera.position);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  const shake = fx.shakeAmount();
  if (shake > 0.001) {
    camera.rotation.x += (rng() * 2 - 1) * shake * 0.02;
    camera.rotation.y += (rng() * 2 - 1) * shake * 0.02;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  player.eyePosition(tmpVec);
  const dx = point.x - tmpVec.x;
  const dy = point.y - tmpVec.y;
  const dz = point.z - tmpVec.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  match.match.money = 2700;
  if (name === 'start') {
    player.state.position.set(0.6, 0, 8.6);
    player.state.yaw = 0;
    player.state.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', '');
  } else if (name === 'play') {
    match.match.phase = 'live';
    match.match.timer = 92;
    player.state.position.set(0, 0, 8);
    const enemy = bots.find((b) => b.bot.name === 'GRIM');
    const ally = bots.find((b) => b.bot.name === 'VEX');
    ally.bot.position.set(-3.5, 0, 4);
    ally.bot.state = 'hold';
    ally.bot.holdUntil = 9999;
    ally.bot.group.position.set(-3.5, 0, 4);
    settle(20);
    // Stage the enemy in the lane after the sim settles, then hold it there.
    enemy.bot.position.set(1.5, 0, -4);
    enemy.bot.yaw = Math.PI;
    enemy.bot.state = 'hold';
    enemy.bot.holdUntil = 9999;
    enemy.bot.reaction = 5; // staged: it holds still for the capture
    enemy.bot.group.position.set(1.5, 0, -4);
    enemy.bot.group.rotation.y = Math.PI;
    aimAt(new THREE.Vector3(1.5, 1.4, -4));
    for (let r = 0; r < 3; r += 1) {
      playerShoot();
      settle(6);
    }
    aimAt(new THREE.Vector3(1.5, 1.4, -4));
    playerShoot();
    settle(2);
    hud.setAmmo(weapons.ammo[weapons.current()].mag, weapons.ammo[weapons.current()].reserve, weapons.slots.grenades);
  } else if (name === 'buy') {
    match.match.phase = 'buy';
    match.match.timer = 12;
    player.state.position.set(0, 0, 10);
    player.state.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.2, -8));
    hud.showBuy(true, match.match.money, { primary: weapons.slots.primary, armor: player.state.armor, grenades: weapons.slots.grenades });
    hud.setMoney(match.match.money);
  } else {
    // end: a won round, spike detonated, one enemy down, banner up.
    match.match.phase = 'roundEnd';
    match.match.score.attack = 1;
    match.match.score.defend = 0;
    match.match.round = 1;
    const enemy = bots.find((b) => b.bot.name === 'RUST');
    enemy.bot.position.set(-2, 0, -6);
    enemy.bot.health = 0;
    enemy.bot.alive = false;
    enemy.bot.state = 'dead';
    enemy.bot.fallT = 1;
    enemy.bot.group.rotation.x = -Math.PI / 2 * 0.9;
    enemy.bot.group.position.set(-2, 0.25, -6);
    player.state.position.set(0, 0, 6);
    settle(10);
    aimAt(new THREE.Vector3(-2, 1.2, -6));
    hud.setScore(1, 0, 1);
    hud.setAlive(3, 3, 3, 4);
    hud.banner('ROUND WON', 'SPIKE DETONATED — SITE A SECURED', 60000);
  }
  hud.setTimer(match.match.timer, match.match.phase);
  hud.setScore(match.match.score.attack, match.match.score.defend, match.match.round);
  hud.setMoney(match.match.money);
  hud.setHealth(player.state.health, player.state.armor);
  // Flush HUD timers so the boot round banner (2.6 s) is gone at capture; the
  // end shot's banner was just shown with a 60 s hold, so it stays up.
  hud.step(3);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('error', (event) => {
  window.__error = String(event.message ?? event.error);
});

// Debug snapshot for automated play-testing.
window.__game = {
  state() {
    return {
      phase: match.match.phase,
      round: match.match.round,
      timer: Math.round(match.match.timer),
      score: { ...match.match.score },
      money: match.match.money,
      playerAlive: player.state.alive,
      playerHealth: Math.round(player.state.health),
      pos: [Math.round(player.state.position.x * 100) / 100, Math.round(player.state.position.z * 100) / 100],
      ammo: { ...weapons.ammo[weapons.current()] },
      weapon: weapons.current(),
      grenades: weapons.slots.grenades,
      botsAlive: bots.filter((b) => b.bot.alive).length,
      bots: bots.map((b) => [b.bot.name, Math.round(b.bot.position.x * 10) / 10, Math.round(b.bot.position.z * 10) / 10, b.bot.state, Math.round(b.bot.health), JSON.stringify(b.bot.route), b.bot.routeIndex, b.bot.target ? (b.bot.target.ref?.name ?? b.bot.target.ref?.bot?.name ?? '?') : null]),
      atkAlive: livingBots('attack').length + (player.state.alive ? 1 : 0),
      defAlive: livingBots('defend').length,
      spike: match.match.spike.state,
      error: window.__error ?? null,
    };
  },
};

syncCamera();
resetRound();
match.startRound();
assignRoutes(); // startRound re-rolls the site; routes must match the new one
hud.setScore(0, 0, 1);
hud.setMoney(match.match.money);
hud.setHealth(100, 0);
hud.setAmmo(weapons.ammo.p9.mag, weapons.ammo.p9.reserve, 0);
hud.showOverlay('start', '');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
