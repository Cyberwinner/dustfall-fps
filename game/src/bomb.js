// The bomb: plant it at a site, guard it while it ticks, lose it if a
// Warden channels the defuse. The bomb itself is a small box with a blinking
// light and a beeper that quickens as the timer runs down.
import * as THREE from 'three';
import { CFG, SITES } from './state.js';
import { PALETTE } from './palette.js';

export function createBomb(scene, store, audio) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
  );
  body.position.y = 0.1;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  lamp.position.set(0.1, 0.22, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);
  let beepTimer = 0;
  let blink = 0;

  function nearestSite(x, z) {
    for (const key of Object.keys(SITES)) {
      const site = SITES[key];
      if (Math.hypot(x - site.x, z - site.z) <= site.radius) return key;
    }
    return null;
  }

  function step(dt, now, ctx) {
    const bomb = store.bomb;
    if (bomb.state === 'planting') {
      bomb.plant += dt;
      if (bomb.plant >= CFG.plantSeconds) {
        bomb.state = 'planted';
        bomb.timer = CFG.bombSeconds;
        group.position.set(ctx.playerPos.x, 0, ctx.playerPos.z);
        group.visible = true;
        store.money += CFG.plantBonus;
        ctx.feed('Bomb planted at Site ' + bomb.site + '  +$' + CFG.plantBonus);
        audio.plantDone();
      }
    } else if (bomb.state === 'planted' || bomb.state === 'defusing') {
      bomb.timer -= dt;
      beepTimer -= dt;
      blink += dt;
      lamp.material.color.setHex(Math.sin(blink * 8) > 0 ? 0xe5484d : 0x571114);
      const interval = 0.4 + (bomb.timer / CFG.bombSeconds) * 0.8;
      if (beepTimer <= 0) {
        beepTimer = interval;
        audio.beep(880, 0.06);
      }
      if (bomb.state === 'defusing' && bomb.defuser) {
        bomb.defuse += dt;
        if (bomb.defuse >= CFG.defuseSeconds) {
          bomb.state = 'defused';
          ctx.onDefused();
        }
      }
      if (bomb.timer <= 0) {
        bomb.state = 'detonated';
        ctx.onDetonated();
      }
    }
  }

  function reset() {
    group.visible = false;
    beepTimer = 0;
    blink = 0;
  }

  return { group, nearestSite, step, reset };
}
