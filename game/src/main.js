// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. main.js owns the round flow, the shooting ray, the bomb
// timers and the wiring between the modules; each module owns its own job.
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for
// a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { CFG, SITES, createState, resetRound } from './state.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createBomb } from './bomb.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const store = createState();
store.shot = shot;
const audio = createAudio();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color('#191c2b'), 24, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const player = createPlayer(map.colliders, map.playerSpawn);
const weapons = createWeaponSet(camera, store);
const bots = createBots(scene, map, store);
const grenades = createGrenades(scene, map.colliders, store, audio);
const bomb = createBomb(scene, store, audio);
const hud = createHud(store, {
  onBuy: (id) => buy(id),
});
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (store.phase === 'menu') startBuyPhase();
  else if (store.phase === 'roundEnd') nextRound();
  else if (store.phase === 'matchEnd') startMatch();
  else if (store.phase === 'live' && !input.state.locked) input.requestLock();
});
hud.onDeploy(() => {
  if (store.phase === 'buy') startRound();
});
const input = createInput(renderer.domElement, onLockChange);

// The player's hit boxes for bot fire: invisible boxes riding the camera.
const playerHitMeshes = [];
{
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshBasicMaterial());
  torso.position.set(0, -0.55, 0);
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshBasicMaterial());
  head.position.set(0, -0.02, 0);
  head.userData.part = 'head';
  torso.visible = false;
  head.visible = false;
  camera.add(torso, head);
  playerHitMeshes.push(torso, head);
}

// One reused tracer line from the muzzle to the impact point.
const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 });
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(tracerGeo, tracerMat);
tracer.frustumCulled = false;
scene.add(tracer);
let tracerTime = 0;

// One reused detonation flash for the bomb.
const blastMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0,
  depthWrite: false, blending: THREE.AdditiveBlending,
});
const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), blastMat);
blast.visible = false;
scene.add(blast);
const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 30, 1.5);
scene.add(blastLight);
let blastTime = 0;

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const shootables = map.shootables.concat(bots.hitMeshes);

let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevKeys = new Set();
let stepAccum = 0;
let roundEndAt = 0;
let defuser = null;

const body = player.state;

function feed(line) {
  hud.feed(line);
  store.feed.unshift(line);
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (store.shake > 0.001) {
    camera.position.x += (random() * 2 - 1) * store.shake * 0.05;
    camera.position.y += (random() * 2 - 1) * store.shake * 0.05;
    camera.rotation.z += (random() * 2 - 1) * store.shake * 0.02;
  }
}

function shake(amount) {
  store.shake = Math.min(1, store.shake + amount);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

// ---- Match flow -----------------------------------------------------------

function startMatch() {
  store.round = 1;
  store.wins = 0;
  store.losses = 0;
  store.money = CFG.startMoney;
  store.kit = { weapons: ['pistol'], grenades: 0, armor: false };
  store.weapon = 'pistol';
  weapons.equip('pistol');
  startBuyPhase();
}

function startBuyPhase() {
  store.phase = 'buy';
  store.buyOpen = true;
  resetRound(store);
  player.reset(map.playerSpawn);
  bots.reset(map.botSpawns);
  weapons.refillAll();
  grenades.reset();
  bomb.reset();
  defuser = null;
  hud.hideOverlay();
  hud.showBuy(true);
  hud.setScore(store.wins, store.losses, store.round);
  hud.setMoney(store.money);
  hud.setHealth(store.player.health, store.player.armor);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, weapons.def().name);
  hud.setTimer(CFG.roundSeconds, false);
  hud.setBomb('idle', 0, null);
  hud.setPlant(null);
  document.getElementById('buy-round').textContent = String(store.round);
  syncCamera();
}

function startRound() {
  store.phase = 'live';
  store.buyOpen = false;
  hud.showBuy(false);
  hud.hideOverlay();
  hud.setScore(store.wins, store.losses, store.round);
  if (!shot) input.requestLock();
}

function endRound(won, reason) {
  if (store.phase !== 'live') return;
  store.phase = 'roundEnd';
  if (won) {
    store.wins += 1;
    store.money += CFG.winBonus;
    audio.roundWin();
    feed('Round won — ' + reason + '  +$' + CFG.winBonus);
  } else {
    store.losses += 1;
    store.money += CFG.lossBonus;
    audio.roundLose();
    feed('Round lost — ' + reason + '  +$' + CFG.lossBonus);
  }
  hud.setMoney(store.money);
  hud.setScore(store.wins, store.losses, store.round);
  if (document.pointerLockElement) document.exitPointerLock();
  roundEndAt = elapsed;
  if (store.wins >= CFG.roundsToWin || store.losses >= CFG.roundsToWin) {
    store.phase = 'matchEnd';
    hud.showOverlay(store.wins > store.losses ? 'matchWin' : 'matchLose');
  } else {
    hud.showOverlay(won ? 'roundWin' : 'roundLose', reason);
  }
}

function nextRound() {
  store.round += 1;
  startBuyPhase();
}

function buy(id) {
  if (store.phase !== 'buy') return;
  if (id === 'grenade') {
    if (store.money < GRENADE_PRICE) return;
    store.money -= GRENADE_PRICE;
    store.kit.grenades += 1;
  } else if (id === 'armor') {
    if (store.money < ARMOR_PRICE || store.kit.armor) return;
    store.money -= ARMOR_PRICE;
    store.kit.armor = true;
    store.player.armor = CFG.armorPool;
  } else {
    const def = WEAPONS[id];
    if (!def || store.money < def.price || store.kit.weapons.includes(id)) return;
    store.money -= def.price;
    store.kit.weapons.push(id);
    weapons.equip(id);
  }
  audio.buy();
  hud.setMoney(store.money);
  hud.updateBuy();
  hud.setHealth(store.player.health, store.player.armor);
}

// ---- Combat ---------------------------------------------------------------

function playerShoot() {
  const def = weapons.def();
  if (!weapons.fire()) {
    audio.dryFire();
    return;
  }
  audio.shot(def.kind.toLowerCase());
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed(), body.crouching);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hits = raycaster.intersectObjects(shootables, false);
  const hit = hits[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 60);
  hitPoint.copy(end);
  showTracer(muzzle, hitPoint);
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  shake(def.kick * 4);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const part = hit.object.userData.part;
    const amount = part === 'head' ? def.headDamage : def.damage;
    const killed = bots.damage(bot, amount);
    audio.hit();
    hud.hitMarker(killed, 4000);
    store.lastHit = { at: elapsed, killed };
    if (killed) {
      audio.kill();
      store.money += CFG.killBonus;
      store.roundKills += 1;
      store.matchKills += 1;
      feed('You dropped ' + bot.name + '  +$' + CFG.killBonus);
      hud.setMoney(store.money);
    }
  }
  for (const b of bots.bots) {
    if (b.alive) bots.hearShot(b, body.position.x, body.position.z);
  }
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, def.name);
}

function showTracer(from, to) {
  const pos = tracerGeo.getAttribute('position');
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  tracerMat.opacity = 0.7;
  tracerTime = 0.06;
}

function damagePlayer(amount, bot) {
  if (!store.player.alive || store.phase !== 'live') return;
  let rest = amount;
  if (store.player.armor > 0) {
    const absorbed = Math.min(store.player.armor, Math.round(amount * CFG.armorAbsorb));
    store.player.armor -= absorbed;
    rest -= absorbed;
  }
  store.player.health -= rest;
  hud.setHealth(store.player.health, store.player.armor);
  hud.damageFlash();
  audio.hurt();
  if (bot) feed(bot.name + ' hit you for ' + rest);
  if (store.player.health <= 0) {
    store.player.health = 0;
    store.player.alive = false;
    hud.setHealth(0, store.player.armor);
  }
}

function damageBot(bot, amount) {
  if (!bot.alive) return;
  const killed = bots.damage(bot, amount);
  if (killed) {
    store.money += CFG.killBonus;
    store.roundKills += 1;
    store.matchKills += 1;
    feed('Frag dropped ' + bot.name + '  +$' + CFG.killBonus);
    hud.setMoney(store.money);
  }
}

function onDetonated() {
  blast.position.copy(bomb.group.position);
  blast.visible = true;
  blastTime = 0.9;
  blastLight.position.copy(bomb.group.position).y += 2;
  blastLight.intensity = 120;
  audio.explosion();
  shake(1);
  endRound(true, 'Charge detonated at Site ' + store.bomb.site);
}

function onDefused() {
  endRound(false, 'Charge defused at Site ' + store.bomb.site);
}

function onLockChange(locked) {
  if (shot) return;
  if (store.phase === 'live') {
    if (locked) hud.hideOverlay();
    else hud.showOverlay('paused');
  }
}

// ---- Fixed-step simulation ------------------------------------------------

const botCtx = {
  playerPos: body.position,
  playerAlive: true,
  playerSpeed: 0,
  playerHitMeshes,
  shootables: map.shootables,
  random,
  defuser: null,
  damagePlayer,
  onBotShot: () => audio.shot('rifle'),
};

const grenadeCtx = {
  playerPos: body.position,
  playerAlive: true,
  bots: bots.bots,
  damagePlayer: (amount) => damagePlayer(amount, null),
  damageBot,
  shake,
};

const bombCtx = {
  playerPos: body.position,
  feed,
  onDetonated,
  onDefused,
};

function step(dt) {
  elapsed += dt;
  store.elapsed = elapsed;
  if (store.phase === 'live') {
    store.timer -= dt;
    // Planting: hold E inside a site while the bomb is idle.
    const siteKey = bomb.nearestSite(body.position.x, body.position.z);
    if (store.bomb.state === 'idle' && siteKey && input.state.keys.has('KeyE') && store.player.alive) {
      store.bomb.state = 'planting';
      store.bomb.site = siteKey;
      store.bomb.plant = 0;
    }
    if (store.bomb.state === 'planting') {
      if (!input.state.keys.has('KeyE') || !siteKey || siteKey !== store.bomb.site || !store.player.alive) {
        store.bomb.state = 'idle';
        store.bomb.site = null;
        store.bomb.plant = 0;
      }
    }
    // Defuse assignment: the nearest living Warden goes to the planted bomb.
    if (store.bomb.state === 'planted') {
      if (!defuser || !defuser.alive) {
        const site = SITES[store.bomb.site];
        defuser = bots.nearestAliveTo(site.x, site.z);
      }
    } else if (store.bomb.state === 'defusing') {
      if (!defuser || !defuser.alive) {
        store.bomb.state = 'planted';
        store.bomb.defuse = 0;
        store.bomb.defuser = null;
        defuser = null;
      }
    }
    botCtx.defuser = defuser;
    botCtx.playerAlive = store.player.alive;
    botCtx.playerSpeed = player.groundSpeed();

    player.step(dt, input.state.keys);
    weapons.step(dt);
    scene.updateMatrixWorld(true);
    bots.step(dt, elapsed, botCtx);
    grenades.step(dt, grenadeCtx);
    bomb.step(dt, elapsed, bombCtx);

    // Footsteps: distance walked, and the bots hear the shots.
    stepAccum += player.groundSpeed() * dt;
    if (stepAccum > CFG.footstepMeters && player.groundSpeed() > 1 && body.onGround) {
      stepAccum = 0;
      audio.step();
    }

    // Round end checks.
    if (store.phase === 'live') {
      if (bots.aliveCount() === 0) {
        endRound(true, 'All Wardens down');
      } else if (!store.player.alive && store.bomb.state !== 'planted' && store.bomb.state !== 'defusing') {
        endRound(false, 'You were dropped');
      } else if (store.timer <= 0 && store.bomb.state !== 'planted' && store.bomb.state !== 'defusing') {
        endRound(false, 'Time expired before the plant');
      }
    }
  } else {
    // Between rounds the world idles: bots hold, weapons settle.
    weapons.step(dt);
    bots.step(dt, elapsed, botCtx);
  }
  // Shared decay.
  store.shake = Math.max(0, store.shake - dt * 2.2);
  if (tracerTime > 0) {
    tracerTime -= dt;
    tracerMat.opacity = Math.max(0, tracerTime / 0.06) * 0.7;
  }
  if (blastTime > 0) {
    blastTime -= dt;
    const f = Math.max(0, blastTime / 0.9);
    blast.scale.setScalar((1 - f) * 9 + 1);
    blastMat.opacity = f * 0.8;
    blastLight.intensity = f * 120;
    if (blastTime <= 0) blast.visible = false;
  }
}

// ---- Frame loop -----------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    // Newly pressed keys, once per frame.
    const fresh = new Set();
    for (const code of input.state.keys) if (!prevKeys.has(code)) fresh.add(code);
    prevKeys = new Set(input.state.keys);

    const look = input.takeLook();
    player.look(look.x, look.y);

    if (store.phase === 'live' && store.player.alive) {
      const def = weapons.def();
      const trigger = def.auto ? input.state.firing : input.takePressed();
      if (trigger && weapons.ready()) playerShoot();
      if (fresh.has('KeyR')) weapons.reload();
      if (fresh.has('KeyQ')) weapons.cycle();
      if (fresh.has('Digit1')) weapons.equip('pistol');
      if (fresh.has('Digit2')) weapons.equip('rifle');
      if (fresh.has('Digit3')) weapons.equip('smg');
      if (fresh.has('Digit4')) weapons.equip('shotgun');
      if (input.takeGrenade()) {
        camera.getWorldDirection(direction);
        grenades.throwGrenade(camera.position, direction);
      }
    }
    if (store.phase === 'buy') {
      if (fresh.has('KeyB') || fresh.has('Enter')) startRound();
      if (fresh.has('Digit2')) buy('rifle');
      if (fresh.has('Digit3')) buy('smg');
      if (fresh.has('Digit4')) buy('shotgun');
      if (fresh.has('Digit5')) buy('grenade');
      if (fresh.has('Digit6')) buy('armor');
    }

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();

    // HUD, every frame from the store.
    hud.setHealth(store.player.health, store.player.armor);
    hud.setAmmo(weapons.state().mag, weapons.state().reserve, weapons.def().name);
    hud.setMoney(store.money);
    hud.setScore(store.wins, store.losses, store.round);
    hud.setTimer(store.timer, store.timer < 15 && store.phase === 'live');
    hud.setBomb(store.bomb.state, store.bomb.timer, store.bomb.site);
    hud.setPlant(store.bomb.state === 'planting' ? store.bomb.plant / CFG.plantSeconds : null);
    hud.setCrosshairGap(2 + weapons.spread(player.groundSpeed(), body.crouching) * 900);
  }
  renderer.render(scene, camera);
}

// ---- Deterministic captures -----------------------------------------------

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function placeBot(index, x, z, mode, yaw) {
  const bot = bots.bots[index];
  bot.group.position.set(x, 0, z);
  bot.mover.body.position.set(x, 0, z);
  bot.mover.body.velocity.set(0, 0, 0);
  bot.mode = mode;
  bot.yaw = yaw;
  bot.holdPos = { x, z };
  bot.target.set(x, 0, z);
  bot.group.rotation.y = yaw;
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    startBuyPhase();
    store.money = 2350;
    hud.setMoney(store.money);
    hud.updateBuy();
    body.position.set(0, 0, 14);
    syncCamera();
    settle(30);
  } else if (name === 'play') {
    startBuyPhase();
    store.money = 2350;
    store.round = 2;
    store.kit.weapons = ['pistol', 'rifle'];
    store.kit.grenades = 1;
    weapons.refillAll();
    weapons.equip('rifle');
    startRound();
    store.timer = 72;
    store.wins = 1;
    store.losses = 0;
    // Bots hold their ground so the frame is exact: one in the sights north
    // of the mid door, one holding the connector, one patrolling mid.
    placeBot(0, 4.5, -7, 'hold', Math.PI);
    placeBot(1, 8, -9.5, 'hold', Math.PI * 0.6);
    placeBot(2, -8, -6, 'patrol', 0);
    // One Warden already down, in frame to the right of the target.
    bots.damage(bots.bots[3], 500);
    bots.bots[3].group.position.set(2.5, 0, -2.5);
    bots.bots[3].group.rotation.y = 0.7;
    settle(30);
    body.position.set(0, 0, 1);
    aimAt(new THREE.Vector3(4.5, 1.25, -7));
    // Four rifle hits drop the Warden in the sights; the shots go out fast
    // so the target cannot strafe clear, and the last shot's flash is
    // still lit when the frame is taken.
    for (let round = 0; round < 4; round += 1) {
      playerShoot();
      settle(1);
    }
    settle(1);
  } else if (name === 'plant') {
    startBuyPhase();
    store.round = 4;
    store.money = 1100;
    store.kit.weapons = ['pistol', 'rifle', 'smg'];
    store.kit.grenades = 1;
    weapons.refillAll();
    weapons.equip('rifle');
    startRound();
    store.timer = 58;
    store.wins = 2;
    store.losses = 1;
    store.bomb.state = 'planted';
    store.bomb.site = 'A';
    store.bomb.timer = 32;
    bomb.group.position.set(-14, 0, -12);
    bomb.group.visible = true;
    feed('Bomb planted at Site A  +$300');
    placeBot(0, -9.5, -8, 'hold', Math.PI * 0.8);
    placeBot(1, -16.5, -4, 'hold', 0);
    bots.damage(bots.bots[2], 500);
    bots.bots[2].group.position.set(-11, 0, -10);
    settle(30);
    body.position.set(-13, 0, -7.5);
    aimAt(new THREE.Vector3(-9.5, 1.2, -8));
    playerShoot();
    settle(8);
  } else {
    // end: the round just won by detonation.
    startBuyPhase();
    hud.showBuy(false);
    store.wins = 2;
    store.losses = 0;
    store.round = 3;
    store.phase = 'roundEnd';
    hud.showOverlay('roundWin', 'Charge detonated at Site A');
    body.position.set(-10, 0, -8);
    settle(20);
    aimAt(new THREE.Vector3(-14, 0.6, -12));
    blast.position.set(-14, 0.5, -12);
    blast.visible = true;
    blast.scale.setScalar(6);
    blastMat.opacity = 0.5;
    blastLight.position.set(-14, 2, -12);
    blastLight.intensity = 60;
  }
  hud.setScore(store.wins, store.losses, store.round);
  hud.setMoney(store.money);
  hud.setHealth(store.player.health, store.player.armor);
  hud.setTimer(store.timer, store.timer < 15 && store.phase === 'live');
  hud.setBomb(store.bomb.state, store.bomb.timer, store.bomb.site);
  hud.setAmmo(weapons.state().mag, weapons.state().reserve, weapons.def().name);
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

// Read-only debug handle for local testing (state, bots, weapons).
window.__dustfall = { store, bots, weapons, player, map };

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
