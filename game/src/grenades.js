// Frag grenades: a thrown sphere with gravity, a bounce off the world's
// boxes, and a fuse. The explosion is a radius falloff, a flash of light,
// a shake and a sound; it hurts bots and the player alike.
import * as THREE from 'three';
import { CFG } from './state.js';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const BOUNCE = 0.45;

export function createGrenades(scene, colliders, store, audio) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.4, metalness: 0.7 });
  const flashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flashGeo = new THREE.SphereGeometry(1, 12, 10);
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 18, 1.5);
  scene.add(flashLight);
  const probe = new THREE.Box3();
  let flashTime = 0;

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function throwGrenade(origin, direction) {
    if (store.kit.grenades <= 0) return false;
    store.kit.grenades -= 1;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    store.grenades.push({
      mesh,
      vx: direction.x * 13,
      vy: direction.y * 13 + 3.2,
      vz: direction.z * 13,
      fuse: CFG.grenadeFuse,
      bounced: false,
    });
    audio.blip(520, 0.05, 0.12);
    return true;
  }

  function explode(g, ctx) {
    const pos = g.mesh.position;
    flash.position.copy(pos);
    flash.visible = true;
    flash.scale.setScalar(0.5);
    flashTime = 0.22;
    flashLight.position.copy(pos);
    flashLight.intensity = 60;
    audio.explosion();
    ctx.shake(0.55);
    // Damage every living body inside the radius, falling off with distance.
    const victims = [{ pos: ctx.playerPos, alive: ctx.playerAlive, hit: ctx.damagePlayer }];
    for (const bot of ctx.bots) {
      victims.push({ pos: bot.group.position, alive: bot.alive, hit: (amount) => ctx.damageBot(bot, amount) });
    }
    for (const victim of victims) {
      if (!victim.alive) continue;
      const d = Math.hypot(victim.pos.x - pos.x, (victim.pos.y + 1 - pos.y), victim.pos.z - pos.z);
      if (d > CFG.grenadeRadius) continue;
      const amount = Math.round(CFG.grenadeMax - (CFG.grenadeMax - CFG.grenadeMin) * (d / CFG.grenadeRadius));
      victim.hit(amount);
    }
    scene.remove(g.mesh);
  }

  function step(dt, ctx) {
    if (flashTime > 0) {
      flashTime -= dt;
      flash.scale.setScalar(0.5 + (0.22 - flashTime) * 22);
      flashMat.opacity = Math.max(0, flashTime / 0.22) * 0.85;
      flashLight.intensity = Math.max(0, flashTime / 0.22) * 60;
      if (flashTime <= 0) flash.visible = false;
    }
    for (let i = store.grenades.length - 1; i >= 0; i -= 1) {
      const g = store.grenades[i];
      g.fuse -= dt;
      g.vy -= GRAVITY * dt;
      const p = g.mesh.position;
      const nx = p.x + g.vx * dt;
      const ny = p.y + g.vy * dt;
      const nz = p.z + g.vz * dt;
      if (overlaps(nx, p.y, p.z)) { g.vx = -g.vx * BOUNCE; g.bounced = true; }
      else p.x = nx;
      if (overlaps(p.x, ny, p.z)) { g.vy = -g.vy * BOUNCE; g.bounced = true; }
      else p.y = ny;
      if (overlaps(p.x, p.y, nz)) { g.vz = -g.vz * BOUNCE; g.bounced = true; }
      else p.z = nz;
      if (p.y < 0.09) { p.y = 0.09; g.vy = Math.abs(g.vy) * BOUNCE; g.bounced = true; }
      if (g.fuse <= 0) {
        explode(g, ctx);
        store.grenades.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const g of store.grenades) scene.remove(g.mesh);
    store.grenades.length = 0;
    flash.visible = false;
    flashLight.intensity = 0;
  }

  return { throwGrenade, step, reset };
}
