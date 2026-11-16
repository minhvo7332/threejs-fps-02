// The bots: six soldiers with a real state machine — route, hold, engage, plant,
// defuse — who walk the waypoint graph, see through line of sight, hear shots
// and react to them. Attackers pick a site and push it; defenders split across
// the sites and mid, hold corners, and defuse a planted spike.
import * as THREE from 'three';
import { WAYPOINTS, findRoute } from './world.js';
import { clamp, pick, range } from './rng.js';

const BOT_SPEED = 3.4;
const BOT_RUN = 4.3;
const EYE_HEIGHT = 1.55;
const REACT_MIN = 0.45;
const REACT_MAX = 0.65;
const VISION_RANGE = 46;
const HEAR_RADIUS = 26;

function buildBody(teamColor, accent) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b323a'), roughness: 0.85, metalness: 0.1 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c2126'), roughness: 0.9, metalness: 0.05 });
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(teamColor), emissiveIntensity: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.5, metalness: 0.2 });

  function part(w, h, d, x, y, z, material, name) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.part = name;
    group.add(mesh);
    return mesh;
  }
  const legs = part(0.36, 0.8, 0.24, 0, 0.4, 0, suit, 'body');
  const torso = part(0.52, 0.62, 0.3, 0, 1.11, 0, vest, 'body');
  const head = part(0.3, 0.28, 0.3, 0, 1.58, 0, suit, 'head');
  const visor = part(0.32, 0.06, 0.05, 0, 1.6, -0.16, teamMat, 'head');
  const shoulderL = part(0.1, 0.08, 0.32, -0.3, 1.36, 0, teamMat, 'body');
  const shoulderR = part(0.1, 0.08, 0.32, 0.3, 1.36, 0, teamMat, 'body');
  const gun = part(0.07, 0.09, 0.62, 0.2, 1.15, -0.35, accentMat, 'body');
  const pack = part(0.4, 0.5, 0.14, 0, 1.15, 0.22, vest, 'body');
  return { group, meshes: [legs, torso, head, visor, shoulderL, shoulderR, gun, pack] };
}

export function createBot(scene, opts) {
  const { id, team, rng, colliders } = opts;
  const teamColor = team === 'attack' ? '#35a7ff' : '#ff4d4d';
  const accent = team === 'attack' ? '#1c5f8f' : '#8f1c1c';
  const body = buildBody(teamColor, accent);
  scene.add(body.group);
  const bot = {
    id,
    team,
    group: body.group,
    meshes: body.meshes,
    position: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    health: 100,
    alive: true,
    crouching: false,
    state: 'route', // route | hold | engage | plant | defuse | investigate | dead
    route: [],
    routeIndex: 0,
    holdUntil: 0,
    target: null, // {ref, pos, isPlayer}
    seenAt: -10,
    aimError: 0.05,
    burstLeft: 0,
    burstTimer: 0,
    pauseTimer: 0,
    strafeDir: 1,
    strafeTimer: 0,
    investigate: null,
    investigateUntil: 0,
    channel: 0, // plant/defuse progress 0..1
    channelKind: null,
    hasSpike: false,
    // Per-bot reaction spread: identical bots feel robotic and melt a
    // stationary target in the same instant; 0.45–0.85 s total.
    reaction: range(rng, 0, 0.4),
    speed: BOT_SPEED,
    fallT: 0,
  };
  for (const mesh of body.meshes) mesh.userData.bot = bot;
  const probe = new THREE.Box3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // The probe is shrunk by a hair (0.32 vs the 0.34 body): Box3 counts
  // face-touching as intersecting, so a full-size probe stops exactly flush
  // with a wall face and can then never slide along it — the bot wedges
  // against the first cover it meets and never reaches its route.
  function overlaps(x, z) {
    probe.min.set(x - 0.32, 0.02, z - 0.32);
    probe.max.set(x + 0.32, 1.7, z + 0.32);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveToward(tx, tz, dt, speed) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const step = Math.min(dist, speed * dt);
    const nx = bot.position.x + (dx / dist) * step;
    const nz = bot.position.z + (dz / dist) * step;
    if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
    if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    return dist < 0.3;
  }

  function setRoute(nodeNames) {
    bot.route = nodeNames;
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function nearestWaypoint() {
    let best = null;
    let bestD = Infinity;
    for (const [name, p] of Object.entries(WAYPOINTS)) {
      const d = (p.x - bot.position.x) ** 2 + (p.z - bot.position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return best;
  }

  function routeTo(node, time) {
    const from = nearestWaypoint();
    const path = findRoute(from, node);
    setRoute(path);
    bot.holdUntil = time;
  }

  function reset(spawn, time) {
    bot.position.set(spawn.x, 0, spawn.z);
    bot.health = 100;
    bot.alive = true;
    bot.state = 'route';
    bot.route = [];
    bot.routeIndex = 0;
    bot.target = null;
    bot.channel = 0;
    bot.channelKind = null;
    bot.hasSpike = false;
    bot.fallT = 0;
    bot.group.rotation.set(0, 0, 0);
    bot.group.position.set(spawn.x, 0, spawn.z);
    bot.group.visible = true;
    for (const m of body.meshes) m.material.transparent = false;
    bot.holdUntil = time;
  }

  function damage(amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.fallT = 0.001;
    }
    return !bot.alive;
  }

  function step(dt, ctx) {
    const time = ctx.time;
    if (!bot.alive) {
      if (bot.fallT > 0 && bot.fallT < 1) {
        bot.fallT = Math.min(1, bot.fallT + dt * 3);
        bot.group.rotation.x = -Math.PI / 2 * bot.fallT * 0.9;
        bot.group.position.y = 0.25 * bot.fallT;
      }
      return;
    }

    // Vision: scan for a living enemy every 0.15 s (staggered per bot).
    // No fighting during the buy phase: bots walk their routes and hold,
    // but nobody acquires a target (and nobody shoots) before the round
    // goes live — otherwise the defenders melt the attackers at spawn
    // while the player is still in the buy menu.
    if (ctx.phase === 'live' && time - (bot.lastScan ?? -1) > 0.15) {
      bot.lastScan = time;
      // Keep the previous target's firstSeen: the scan clears bot.target
      // before re-picking, so reading it afterwards would reset firstSeen
      // every scan and aimTime could never pass the reaction delay — the
      // bot would aim forever and never fire a shot.
      const prevTarget = bot.target?.ref;
      const prevFirstSeen = bot.target?.firstSeen ?? time;
      bot.target = null;
      let bestD = VISION_RANGE;
      for (const enemy of ctx.enemies) {
        if (!enemy.alive) continue;
        tmp.copy(enemy.eyePos);
        const dx = tmp.x - bot.position.x;
        const dy = tmp.y - (bot.position.y + EYE_HEIGHT);
        const dz = tmp.z - bot.position.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > VISION_RANGE) continue;
        // Field of view: ~115 degrees around facing.
        const facingX = -Math.sin(bot.yaw);
        const facingZ = -Math.cos(bot.yaw);
        const dot = (dx * facingX + dz * facingZ) / Math.max(0.001, Math.hypot(dx, dz));
        if (dot < 0.35 && dist > 4) continue;
        if (!ctx.hasLineOfSight(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z, tmp.x, tmp.y, tmp.z)) continue;
        if (dist < bestD) {
          bestD = dist;
          bot.target = { ref: enemy, dist, firstSeen: prevTarget === enemy ? prevFirstSeen : time };
        }
      }
      if (bot.target) bot.seenAt = time;
    }

    // Hearing: a recent shot nearby pulls the bot to investigate.
    if (!bot.target) {
      for (const noise of ctx.noise) {
        if (time - noise.time > 1.5) continue;
        const d = Math.hypot(noise.x - bot.position.x, noise.z - bot.position.z);
        if (d < HEAR_RADIUS && (!bot.investigate || time > bot.investigateUntil)) {
          bot.investigate = { x: noise.x, z: noise.z };
          bot.investigateUntil = time + 4;
          bot.state = 'investigate';
          break;
        }
      }
    }

    // Engage: aim with error that shrinks as the bot tracks, fire in bursts.
    if (bot.target) {
      const enemy = bot.target.ref;
      tmp.copy(enemy.eyePos);
      const dx = tmp.x - bot.position.x;
      const dz = tmp.z - bot.position.z;
      const dist = Math.hypot(dx, tmp.y - (bot.position.y + EYE_HEIGHT), dz);
      bot.yaw = Math.atan2(-dx, -dz);
      const aimTime = time - bot.target.firstSeen;
      const reaction = REACT_MIN + (bot.reaction ?? 0);
      const tracking = clamp(aimTime / 1.2, 0, 1);
      const targetSpeed = enemy.speed ?? 0;
      bot.aimError = (0.055 - 0.03 * tracking) * (1 + targetSpeed * 0.12) * (1 + dist / 60);
      if (aimTime > reaction) {
        bot.state = 'engage';
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
          bot.strafeTimer = range(rng, 0.7, 1.4);
        }
        // Sidestep while shooting, but never walk through a wall.
        const sx = Math.cos(bot.yaw) * bot.strafeDir;
        const sz = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = bot.position.x + sx * BOT_SPEED * 0.5 * dt;
        const nz = bot.position.z + sz * BOT_SPEED * 0.5 * dt;
        if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
        if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
        // Close the distance: a bot that only strafes at 25 m plinks away
        // with a wide spread and the fight never resolves — walk at the
        // target until inside effective range, then hold and shoot.
        if (dist > 10) moveToward(tmp.x, tmp.z, dt, BOT_SPEED);

        bot.burstTimer -= dt;
        bot.pauseTimer -= dt;
        if (bot.burstLeft <= 0 && bot.pauseTimer <= 0) {
          bot.burstLeft = 3 + Math.floor(rng() * 3);
          bot.pauseTimer = range(rng, 0.7, 1.3);
        }
        if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
          bot.burstTimer = 0.13;
          bot.burstLeft -= 1;
          ctx.botShoot(bot, tmp, bot.aimError, dist);
        }
      }
      // Keep the mesh facing the fight.
      bot.group.position.set(bot.position.x, bot.crouching ? -0.45 : 0, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      return;
    }

    // Plant: the spike carrier walks to the assigned site and channels.
    if (bot.hasSpike && bot.state !== 'plant' && ctx.spike.state === 'carried') {
      const site = ctx.spike.site;
      const dest = site === 'A' ? 'siteA' : 'siteB';
      if (bot.route.length === 0 || bot.route[bot.route.length - 1] !== dest) routeTo(dest, time);
    }
    if (bot.hasSpike && bot.state === 'route' && bot.route.length > 0) {
      const dest = bot.route[bot.route.length - 1];
      if ((dest === 'siteA' || dest === 'siteB') && ctx.spike.state === 'carried') {
        const site = ctx.spike.site;
        const center = site === 'A' ? WAYPOINTS.siteA : WAYPOINTS.siteB;
        if (Math.hypot(center.x - bot.position.x, center.z - bot.position.z) < 1.6) {
          bot.state = 'plant';
          bot.channel = 0;
          bot.channelKind = 'plant';
        }
      }
    }
    if (bot.state === 'plant') {
      bot.channel += dt / 3;
      ctx.onChannel(bot, 'plant', bot.channel);
      if (bot.channel >= 1) {
        bot.channel = 0;
        bot.channelKind = null;
        ctx.onPlanted(bot);
      }
      bot.group.position.set(bot.position.x, 0, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      return;
    }

    // Defuse: when the spike is planted, the nearest defender walks to it.
    if (ctx.spike.state === 'planted' && bot.team === 'defend' && bot.defuseDuty) {
      const s = ctx.spike.position;
      const d = Math.hypot(s.x - bot.position.x, s.z - bot.position.z);
      if (d < 1.4) {
        bot.state = 'defuse';
        bot.channel += dt / 5;
        ctx.onChannel(bot, 'defuse', bot.channel);
        if (bot.channel >= 1) {
          bot.channel = 0;
          ctx.onDefused(bot);
        }
        bot.group.position.set(bot.position.x, 0, bot.position.z);
        bot.group.rotation.y = bot.yaw;
        return;
      }
      if (bot.state !== 'defuse') {
        moveToward(s.x, s.z, dt, BOT_RUN);
        bot.group.position.set(bot.position.x, 0, bot.position.z);
        bot.group.rotation.y = bot.yaw;
        return;
      }
    }

    // Investigate a heard shot, then resume the route.
    if (bot.state === 'investigate' && bot.investigate) {
      const fdx = bot.investigate.x - bot.position.x;
      const fdz = bot.investigate.z - bot.position.z;
      if (Math.hypot(fdx, fdz) > 0.3) bot.yaw = Math.atan2(-fdx, -fdz);
      const done = moveToward(bot.investigate.x, bot.investigate.z, dt, BOT_RUN);
      if (done || time > bot.investigateUntil) {
        bot.investigate = null;
        bot.state = 'route';
        if (bot.route.length === 0) routeTo(bot.defaultNode, time);
      }
      bot.group.position.set(bot.position.x, 0, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      return;
    }

    // Route: walk the waypoint path, hold briefly at the end.
    if (bot.state === 'route') {
      if (bot.routeIndex >= bot.route.length) {
        bot.state = 'hold';
        bot.holdUntil = time + range(rng, 2.5, 5);
        bot.crouching = bot.holdCrouch === true;
        return;
      }
      const node = WAYPOINTS[bot.route[bot.routeIndex]];
      if (!node) {
        bot.routeIndex += 1;
        return;
      }
      // Face where the bot walks: without this its vision cone points at its
      // spawn yaw and it walks backwards into the fight, never seeing anyone.
      const fdx = node.x - bot.position.x;
      const fdz = node.z - bot.position.z;
      if (Math.hypot(fdx, fdz) > 0.3) bot.yaw = Math.atan2(-fdx, -fdz);
      const arrived = moveToward(node.x, node.z, dt, BOT_RUN);
      if (arrived) bot.routeIndex += 1;
      bot.group.position.set(bot.position.x, bot.crouching ? -0.45 : 0, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      return;
    }

    // Hold: stay put and sweep the surroundings, so a holding bot's vision
    // cone actually covers the lane instead of staring at one wall.
    if (bot.state === 'hold') {
      bot.yaw += dt * 0.5;
      bot.group.position.set(bot.position.x, bot.crouching ? -0.45 : 0, bot.position.z);
      bot.group.rotation.y = bot.yaw;
      if (time > bot.holdUntil) {
        bot.crouching = false;
        const next = pick(rng, bot.patrolNodes ?? ['mid', 'west2', 'east2']);
        routeTo(next, time);
      }
      return;
    }

    bot.group.position.set(bot.position.x, 0, bot.position.z);
    bot.group.rotation.y = bot.yaw;
  }

  return {
    bot,
    step,
    reset,
    damage,
    routeTo,
    setRoute,
    eye(out) {
      out.set(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
      return out;
    },
  };
}
