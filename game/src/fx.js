// Effects with no per-frame allocation: a pool of tracer lines, one explosion
// flash mesh and a shake value the camera reads. Hot loops reuse these objects;
// nothing here news a Vector3 or a geometry while the game runs.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;

export function createFx(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color('#ffb36b'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;
  let shake = 0;
  const tmpColor = new THREE.Color();

  return {
    tracer(from, to, color = '#ffb36b') {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.material.color.copy(tmpColor.set(color));
      t.line.material.opacity = 0.9;
      t.line.visible = true;
      t.life = 0.09;
    },
    explosion(at, radius) {
      boom.position.copy(at);
      boom.scale.setScalar(0.5);
      boom.visible = true;
      boom.material.opacity = 0.9;
      boomLight.position.copy(at);
      boomLight.position.y += 1;
      boomLight.intensity = 60;
      boomLife = 0.45;
      boom.userData.radius = radius;
      shake = Math.max(shake, 0.35);
    },
    addShake(amount) {
      shake = Math.min(0.6, shake + amount);
    },
    shakeAmount() {
      return shake;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) {
          t.line.visible = false;
        } else {
          t.line.material.opacity = (t.life / 0.09) * 0.9;
        }
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = Math.max(0, boomLife / 0.45);
        boom.scale.setScalar(0.5 + (1 - k) * boom.userData.radius);
        boom.material.opacity = k * 0.9;
        boomLight.intensity = k * 60;
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      shake = Math.max(0, shake - dt * 1.4);
    },
  };
}
