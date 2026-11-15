// The Wardens: four defenders who patrol Foundry Row, hold the sites, react
// to what they see and hear, and shoot back. Each bot is a small state
// machine — patrol, hold, investigate, engage, defuse — driven by a vision
// check against the world and a hearing radius for gunfire. They share the
// mover with the player, so their movement collides the same way.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CFG, SITES } from './state.js';
import { createMover } from './mover.js';

const NAMES = ['Ash', 'Cinder', 'Rook', 'Slag'];
const BOT_SPEED = 3.6;
const VISION_RANGE = 38;
const VISION_HALF_FOV = 1.05;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.7;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.11;
const BODY_DAMAGE = 22;
const HEAD_DAMAGE = 55;

export function createBots(scene, map, store) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.bot), roughness: 0.6, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.botDark), roughness: 0.5, metalness: 0.1 });
  const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.5, metalness: 0.5 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const eyePos = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  function makeBot(index, spawn, route) {
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.58;
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.25, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.2, 1.1, -0.2);
    group.add(torso, head, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      id: index,
      name: NAMES[index],
      group,
      torso,
      head,
      health: CFG.botHealth,
      alive: true,
      mover: createMover(map.colliders, { x: spawn.x, z: spawn.z }),
      route,
      routeIndex: index % route.length,
      mode: index < 2 ? 'hold' : 'patrol',
      holdPos: { x: spawn.x, z: spawn.z },
      target: new THREE.Vector3(spawn.x, 0, spawn.z),
      lastSeen: new THREE.Vector3(),
      seenAt: -100,
      reactAt: 0,
      burstLeft: 0,
      shotTimer: 0,
      strafeDir: index % 2 === 0 ? 1 : -1,
      strafeTimer: 0,
      investigateUntil: 0,
      fall: 0,
      visionTimer: index * 0.04,
      yaw: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    store.bots.push({ id: index, name: NAMES[index], health: CFG.botHealth, alive: true });
    return bot;
  }

  for (let i = 0; i < CFG.botCount; i += 1) {
    makeBot(i, map.botSpawns[i], map.routes[i]);
  }

  function eyeOf(bot) {
    eyePos.set(bot.group.position.x, 1.55, bot.group.position.z);
    return eyePos;
  }

  function hasLineOfSight(bot, point, shootables) {
    const eye = eyeOf(bot);
    toPlayer.copy(point).sub(eye);
    const dist = toPlayer.length();
    if (dist > VISION_RANGE) return false;
    aimDir.copy(toPlayer).normalize();
    raycaster.set(eye, aimDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  function canSee(bot, ctx) {
    if (!ctx.playerAlive) return false;
    tmpPos.set(ctx.playerPos.x, ctx.playerPos.y + 1.2, ctx.playerPos.z);
    const eye = eyeOf(bot);
    toPlayer.copy(tmpPos).sub(eye);
    const dist = toPlayer.length();
    if (dist > VISION_RANGE) return false;
    // Facing: the bot looks along its yaw; the player must be in front of it.
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    const dot = (toPlayer.x * forwardX + toPlayer.z * forwardZ) / Math.max(dist, 0.001);
    if (dot < Math.cos(VISION_HALF_FOV)) return false;
    return hasLineOfSight(bot, tmpPos, ctx.shootables);
  }

  function moveToward(bot, dt, x, z, speed) {
    const dx = x - bot.group.position.x;
    const dz = z - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) return true;
    const wx = dx / dist;
    const wz = dz / dist;
    bot.mover.step(dt, wx, wz, speed, 30, 8);
    bot.group.position.copy(bot.mover.body.position);
    bot.yaw = Math.atan2(-wx, -wz);
    return false;
  }

  function facePoint(bot, x, z) {
    const dx = x - bot.group.position.x;
    const dz = z - bot.group.position.z;
    bot.yaw = Math.atan2(-dx, -dz);
  }

  function botShoot(bot, ctx, now) {
    if (bot.shotTimer > 0) return;
    // Never shoot through a wall: the shot needs a live line of sight.
    tmpPos.set(ctx.playerPos.x, ctx.playerPos.y + 1.2, ctx.playerPos.z);
    if (!hasLineOfSight(bot, tmpPos, ctx.shootables)) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = BURST_MIN + Math.floor(ctx.random() * (BURST_MAX - BURST_MIN + 1));
      bot.shotTimer = 0.45 + ctx.random() * 0.5;
      return;
    }
    bot.burstLeft -= 1;
    bot.shotTimer = SHOT_GAP;
    // Aim at the chest, sometimes the head, with error that grows with
    // distance, the player's speed and the bot's own movement.
    const headAim = ctx.random() < 0.15;
    const aimY = ctx.playerPos.y + (headAim ? 1.5 : 1.15);
    tmpPos.set(ctx.playerPos.x, aimY, ctx.playerPos.z);
    const eye = eyeOf(bot);
    aimDir.copy(tmpPos).sub(eye).normalize();
    const dist = eye.distanceTo(tmpPos);
    const move = Math.hypot(bot.mover.body.velocity.x, bot.mover.body.velocity.z);
    const error = 0.02 + dist * 0.0012 + ctx.playerSpeed * 0.004 + move * 0.003;
    aimDir.x += (ctx.random() * 2 - 1) * error;
    aimDir.y += (ctx.random() * 2 - 1) * error;
    aimDir.z += (ctx.random() * 2 - 1) * error;
    aimDir.normalize();
    raycaster.set(eye, aimDir);
    raycaster.far = 60;
    const hits = raycaster.intersectObjects(ctx.playerHitMeshes, false);
    if (hits.length > 0) {
      const part = hits[0].object.userData.part;
      ctx.damagePlayer(part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE, bot);
    }
    ctx.onBotShot(bot);
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    const entry = store.bots[bot.id];
    entry.health = Math.max(0, bot.health);
    if (bot.health > 0) {
      // Being shot at snaps the bot's attention to the shooter, and it
      // stays alerted until the round ends.
      bot.mode = 'engage';
      bot.alerted = true;
      bot.reactAt = 0;
      return false;
    }
    bot.alive = false;
    entry.alive = false;
    bot.fall = 0.001;
    bot.group.rotation.x = -1.45;
    return true;
  }

  function hearShot(bot, x, z) {
    if (!bot.alive) return;
    const dist = Math.hypot(x - bot.group.position.x, z - bot.group.position.z);
    if (dist > CFG.hearRadius) return;
    if (bot.mode === 'engage') return;
    bot.mode = 'investigate';
    bot.target.set(x, 0, z);
    bot.investigateUntil = 1000000;
  }

  function step(dt, now, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.shotTimer = Math.max(0, bot.shotTimer - dt);
      bot.visionTimer -= dt;
      if (bot.visionTimer <= 0) {
        bot.visionTimer = 0.15;
        if (canSee(bot, ctx)) {
          if (bot.mode !== 'engage') {
            bot.mode = 'engage';
            bot.reactAt = now + REACTION_MIN + ctx.random() * (REACTION_MAX - REACTION_MIN);
            bot.burstLeft = 0;
          }
          bot.lastSeen.copy(ctx.playerPos);
          bot.seenAt = now;
        } else if (bot.mode === 'engage' && now - bot.seenAt > 2.5 && !bot.alerted) {
          bot.mode = 'investigate';
          bot.target.copy(bot.lastSeen);
          bot.investigateUntil = now + 4;
        }
      }

      // After the bomb is planted, the nearest living bot goes to defuse it.
      if (store.bomb.state === 'planted' && ctx.defuser === bot) {
        const site = SITES[store.bomb.site];
        facePoint(bot, site.x, site.z);
        const arrived = moveToward(bot, dt, site.x, site.z, BOT_SPEED);
        if (arrived) {
          bot.mode = 'defuse';
          store.bomb.state = 'defusing';
          store.bomb.defuser = bot;
        }
        continue;
      }

      if (bot.mode === 'engage') {
        facePoint(bot, ctx.playerPos.x, ctx.playerPos.z);
        const dist = Math.hypot(ctx.playerPos.x - bot.group.position.x, ctx.playerPos.z - bot.group.position.z);
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.9 + ctx.random() * 0.9;
          bot.strafeDir *= -1;
        }
        // Close the distance when far, strafe when in range.
        let wx = 0;
        let wz = 0;
        if (dist > 20) {
          wx = (ctx.playerPos.x - bot.group.position.x) / dist;
          wz = (ctx.playerPos.z - bot.group.position.z) / dist;
        } else if (dist < 7) {
          wx = -(ctx.playerPos.x - bot.group.position.x) / dist;
          wz = -(ctx.playerPos.z - bot.group.position.z) / dist;
        } else {
          const fx = (ctx.playerPos.x - bot.group.position.x) / dist;
          const fz = (ctx.playerPos.z - bot.group.position.z) / dist;
          wx = -fz * bot.strafeDir;
          wz = fx * bot.strafeDir;
        }
        bot.mover.step(dt, wx, wz, BOT_SPEED * 0.8, 30, 8);
        bot.group.position.copy(bot.mover.body.position);
        if (now >= bot.reactAt) botShoot(bot, ctx, now);
        continue;
      }

      if (bot.mode === 'investigate') {
        const arrived = moveToward(bot, dt, bot.target.x, bot.target.z, BOT_SPEED);
        if (arrived) {
          bot.yaw += dt * 1.4;
          if (now > bot.investigateUntil) {
            bot.mode = bot.routeIndex < 2 ? 'hold' : 'patrol';
          }
        }
        continue;
      }

      if (bot.mode === 'hold') {
        const dx = bot.holdPos.x - bot.group.position.x;
        const dz = bot.holdPos.z - bot.group.position.z;
        if (Math.hypot(dx, dz) > 0.6) {
          moveToward(bot, dt, bot.holdPos.x, bot.holdPos.z, BOT_SPEED);
        } else {
          // Hold and scan: slow yaw sweep over the approach.
          bot.yaw += Math.sin(now * 0.5 + bot.id * 1.3) * dt * 0.5;
        }
        continue;
      }

      // Patrol: walk the route, pausing a beat at each node.
      const node = bot.route[bot.routeIndex % bot.route.length];
      const arrived = moveToward(bot, dt, node.x, node.z, BOT_SPEED);
      if (arrived) bot.routeIndex += 1;
    }
    // Keep the meshes facing their yaw.
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.group.rotation.y = bot.yaw;
    }
  }

  function reset(spawns) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.health = CFG.botHealth;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.set(spawns[i].x, 0, spawns[i].z);
      bot.mover.body.position.set(spawns[i].x, 0, spawns[i].z);
      bot.mover.body.velocity.set(0, 0, 0);
      bot.routeIndex = i % bot.route.length;
      bot.mode = i < 2 ? 'hold' : 'patrol';
      bot.holdPos = { x: spawns[i].x, z: spawns[i].z };
      bot.target.set(spawns[i].x, 0, spawns[i].z);
      bot.burstLeft = 0;
      bot.shotTimer = 0;
      bot.seenAt = -100;
      bot.alerted = false;
      const entry = store.bots[bot.id];
      entry.health = CFG.botHealth;
      entry.alive = true;
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    damage,
    hearShot,
    reset,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    nearestAliveTo(x, z) {
      let best = null;
      let bestDist = Infinity;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.group.position.x - x, bot.group.position.z - z);
        if (d < bestDist) {
          bestDist = d;
          best = bot;
        }
      }
      return best;
    },
  };
}
