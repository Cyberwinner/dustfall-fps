// A body that moves through the map: acceleration, friction, gravity and a
// box resolved against the world's colliders one axis at a time, so a wall
// never swallows it. The player and the bots share this code; only the
// wishes they feed it differ.
import * as THREE from 'three';

const RADIUS = 0.34;
const GRAVITY = 20;

export function createMover(colliders, opts) {
  const body = {
    position: new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0),
    velocity: new THREE.Vector3(),
    yaw: opts.yaw ?? 0,
    pitch: 0,
    eye: opts.eye ?? 1.6,
    onGround: true,
    crouching: false,
    height: opts.height ?? 1.72,
    standHeight: opts.height ?? 1.72,
    crouchHeight: opts.crouchHeight ?? 1.12,
  };
  const probe = new THREE.Box3();
  const tmp = new THREE.Vector3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // wishX/wishZ: a unit wish direction on the ground. speed: top speed.
  // accel: ground acceleration. friction: ground damping when idle.
  function step(dt, wishX, wishZ, speed, accel, friction) {
    const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
    body.velocity.x += (wishX * speed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
    if (body.onGround && wishX === 0 && wishZ === 0) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  function setCrouch(crouching) {
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = body.crouchHeight;
    } else if (!crouching && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, body.standHeight, 0.02)) {
      body.crouching = false;
      body.height = body.standHeight;
    }
    const eyeTarget = body.crouching ? body.crouchHeight - 0.1 : body.eye;
    return eyeTarget;
  }

  return { body, step, setCrouch, overlaps, tmp };
}
