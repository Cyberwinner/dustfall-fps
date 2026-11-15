// The player: mouse look, acceleration movement, crouch, jump and recoil,
// on top of the shared mover. It owns no match state; the store does.
import * as THREE from 'three';
import { createMover } from './mover.js';

const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const WALK_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders, { x: spawn.x, z: spawn.z, yaw: spawn.yaw, eye: STAND_EYE });
  const body = mover.body;
  body.eye = STAND_EYE;
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    mover.setCrouch(crouching);
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const slow = keys.has('ShiftLeft') || keys.has('ShiftRight');
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = (body.crouching ? CROUCH_SPEED : WALK_SPEED) * (slow ? 0.55 : 1);
    mover.step(dt, wish.x, wish.z, speed, body.onGround ? WALK_ACCEL : AIR_ACCEL, FRICTION);
    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawnPoint.yaw;
    body.pitch = 0;
    body.eye = STAND_EYE;
    body.crouching = false;
    body.height = body.standHeight;
    body.onGround = true;
  }

  return {
    state: body,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
