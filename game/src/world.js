// MERIDIAN PROTOCOL — the map: "Foundry Yard", an original 40 x 28 m industrial
// yard. Two spike sites (A north-west, B south-east), three lanes (west, mid,
// east) and cover that makes corners worth holding. Every box is a collider and
// a surface bullets stop on; the waypoint graph is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph: nodes the bots path through. Lanes run north-south; the sites
// sit at opposite corners so attackers must commit to a lane.
export const WAYPOINTS = {
  atk: { x: 0, z: 12.5 },
  atkW: { x: -6, z: 11 },
  atkE: { x: 6, z: 11 },
  midS: { x: 0, z: 6 },
  mid: { x: 0, z: 0 },
  midN: { x: 0, z: -6 },
  west1: { x: -14, z: 8 },
  west2: { x: -14, z: 0 },
  west3: { x: -14, z: -8 },
  east1: { x: 14, z: 8 },
  east2: { x: 14, z: 0 },
  east3: { x: 14, z: -8 },
  siteAin: { x: -10, z: -6 },
  siteA: { x: -14.5, z: -10.5 },
  siteBin: { x: 10, z: 6 },
  siteB: { x: 14.5, z: 10.5 },
  defA: { x: -11, z: -11.5 },
  defB: { x: 11, z: 11.5 },
  defMid: { x: 3, z: -9 },
};

const EDGES = {
  atk: ['atkW', 'atkE', 'midS'],
  atkW: ['atk', 'west1', 'midS'],
  atkE: ['atk', 'east1', 'midS'],
  midS: ['atk', 'atkW', 'atkE', 'mid', 'west1', 'east1'],
  mid: ['midS', 'midN', 'west2', 'east2'],
  midN: ['mid', 'west3', 'east3', 'siteAin', 'defMid'],
  west1: ['atkW', 'west2', 'midS'],
  west2: ['west1', 'west3', 'mid'],
  west3: ['west2', 'midN', 'siteAin'],
  east1: ['atkE', 'east2', 'midS'],
  east2: ['east1', 'east3', 'mid'],
  east3: ['east2', 'midN', 'siteBin'],
  siteAin: ['west3', 'midN', 'siteA', 'defA'],
  siteA: ['siteAin', 'defA'],
  siteBin: ['east3', 'siteB', 'defB'],
  siteB: ['siteBin', 'defB'],
  defA: ['siteA', 'siteAin'],
  defB: ['siteB', 'siteBin'],
  defMid: ['midN', 'east3'],
};

// Breadth-first route between two waypoints; returns node names, start excluded.
export function findRoute(from, to) {
  if (from === to) return [];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    for (const next of EDGES[node] ?? []) {
      if (prev[next] !== undefined) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let cur = to;
        while (prev[cur] !== from) {
          cur = prev[cur];
          path.unshift(cur);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'siteA' || name === 'siteB' ? 0.5 : 0.94,
      metalness: 0.04,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor: one slab plus alternating tiles so the ground reads at a glance.
  box(41, 0.4, 29, 0, -0.2, 0, 'ground');
  for (let ix = -4; ix <= 4; ix += 1) {
    for (let iz = -3; iz <= 3; iz += 1) {
      if ((ix + iz) % 2 === 0) continue;
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 0.02, 4.2),
        materials.groundAlt,
      );
      tile.position.set(ix * 4.4, 0.011, iz * 4.2);
      tile.receiveShadow = true;
      group.add(tile);
    }
  }

  // Perimeter walls, 4.6 m, open to a dusk sky.
  box(41, 4.6, 0.5, 0, 2.3, -14.25, 'wall');
  box(41, 4.6, 0.5, 0, 2.3, 14.25, 'wall');
  box(0.5, 4.6, 29, -20.25, 2.3, 0, 'wall');
  box(0.5, 4.6, 29, 20.25, 2.3, 0, 'wall');

  // Mid: a broken wall with two gaps — the fast lane, and the risky one.
  box(3.2, 3.4, 0.6, -3.4, 1.7, 0, 'wallDark');
  box(3.2, 3.4, 0.6, 3.4, 1.7, 0, 'wallDark');
  box(1.6, 1.1, 1.6, -6.5, 0.55, 3.5, 'crate');
  box(1.6, 1.1, 1.6, 6.5, 0.55, -3.5, 'crate');

  // West lane cover: a long container and a crate stack to duck behind.
  box(6, 2.4, 2.4, -16.5, 1.2, 3.5, 'container');
  box(1.2, 1.1, 1.2, -11.5, 0.55, 0.5, 'crateB');
  box(1.2, 1.1, 1.2, -11.5, 0.55, -0.9, 'crateB');
  box(1.2, 2.2, 1.2, -11.5, 1.1, -0.2, 'crate');

  // East lane cover: rust container, low wall, crate pair.
  box(2.4, 2.4, 6, 16.5, 1.2, -3.5, 'containerB');
  box(4.5, 1.1, 0.6, 11, 0.55, 3.5, 'wallDark');
  box(1.2, 1.1, 1.2, 11.5, 0.55, -0.5, 'crate');
  box(1.2, 1.1, 1.2, 12.9, 0.55, -0.5, 'crateB');

  // Site A (north-west): container wall on the north side, crates inside.
  box(6, 2.4, 2.4, -14.5, 1.2, -12.6, 'container');
  box(1.2, 1.1, 1.2, -17.5, 0.55, -8.5, 'crateB');
  box(1.2, 1.1, 1.2, -12.5, 0.55, -9.5, 'crate');
  box(2.4, 1.1, 1.2, -14.5, 0.55, -6.5, 'wallDark');

  // Site B (south-east): rust container on the east side, crates inside.
  box(2.4, 2.4, 6, 18.6, 1.2, 10.5, 'containerB');
  box(1.2, 1.1, 1.2, 11.5, 0.55, 8.5, 'crate');
  box(1.2, 1.1, 1.2, 17.5, 0.55, 12.5, 'crateB');
  box(1.2, 1.1, 2.4, 13.5, 0.55, 12.2, 'wallDark');

  // Attacker spawn cover and a central pillar that splits the yard.
  // The gap between the two spawn walls is only 1.2 m: a defender at mid
  // can barely see the spawn through it, so the attackers are not shot
  // dead in the first seconds of the round while they are still buying.
  box(3.6, 1.1, 1.2, -2.4, 0.55, 10.5, 'wallDark');
  box(3.6, 1.1, 1.2, 2.4, 0.55, 10.5, 'wallDark');
  box(1.4, 3.6, 1.4, -6, 1.8, -3, 'wallDark');
  box(1.4, 3.6, 1.4, 6, 1.8, 3, 'wallDark');

  // Site floor markings: flat coloured slabs + corner posts, no textures.
  function siteMarker(cx, cz, color, label) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.04, 5.4),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.6, metalness: 0.05, emissive: new THREE.Color(color), emissiveIntensity: 0.25 }),
    );
    slab.position.set(cx, 0.02, cz);
    slab.receiveShadow = true;
    group.add(slab);
    for (const [dx, dz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 1.5, 0.18),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.7, roughness: 0.4 }),
      );
      post.position.set(cx + dx, 0.75, cz + dz);
      group.add(post);
    }
    return { label, center: { x: cx, z: cz } };
  }
  const siteA = siteMarker(-14.5, -10.5, PALETTE.siteA, 'A');
  const siteB = siteMarker(14.5, 10.5, PALETTE.siteB, 'B');

  // Distant skyline silhouettes outside the walls, for depth in screenshots.
  const skyline = new THREE.Group();
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a0f14') });
  const skyBoxes = [[-26, 9, -18, 8, 18], [26, 12, -16, 10, 22], [-14, 14, -26, 12, 8], [18, 8, -28, 9, 14], [-30, 7, 10, 8, 14], [30, 10, 14, 8, 18], [0, 16, -30, 14, 10]];
  for (const [x, h, z, w, d] of skyBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMat);
    m.position.set(x, h / 2 - 1, z);
    skyline.add(m);
  }
  scene.add(skyline);

  // Light: low dusk sun from the west, cool sky fill, warm bounce from the east.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8fa8bf'), new THREE.Color('#1a2027'), 0.85);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.4);
  sun.position.set(-18, 16, 6);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fa8cc'), 0.5);
  fill.position.set(14, 10, -10);
  scene.add(fill);

  const sites = {
    A: { ...siteA, box: new THREE.Box3(new THREE.Vector3(-17.7, 0, -13.2), new THREE.Vector3(-11.3, 3, -7.8)) },
    B: { ...siteB, box: new THREE.Box3(new THREE.Vector3(11.3, 0, 7.8), new THREE.Vector3(17.7, 3, 13.2)) },
  };

  return {
    colliders,
    shootables,
    sites,
    group,
    spawns: {
      attack: [{ x: -2, z: 12.5 }, { x: 0, z: 12.5 }, { x: 2, z: 12.5 }],
      defend: [{ x: -11, z: -11.5 }, { x: -17, z: -6 }, { x: 11, z: 11.5 }, { x: 17, z: 6 }],
    },
  };
}
