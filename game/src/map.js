// Foundry Row: a dusk industrial yard, 40 x 36 m, built from boxes. Three lanes
// run north to the two bomb sites: the west alley, the open middle, the east
// alley, cut by two cross walls with door gaps. Every box is a collider for
// bodies and a surface a bullet stops on. No textures: the palette and the
// sodium lamps do the work.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './state.js';

const WALL_H = 4.5;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'steel' ? 0.45 : name === 'amber' ? 0.5 : 0.92,
      metalness: name === 'steel' ? 0.55 : name === 'rust' || name === 'rustDark' ? 0.25 : 0.03,
      emissive: new THREE.Color(PALETTE[name]),
      emissiveIntensity: name === 'amber' ? 0.55 : name === 'teal' ? 0.35 : 0,
    });
  }
  // The lamp glass is the only strongly emissive material.
  const lampMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber),
    emissiveIntensity: 2.4, roughness: 0.4,
  });
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal),
    emissiveIntensity: 1.4, roughness: 0.5, transparent: true, opacity: 0.9,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
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

  function cylinder(rt, rb, h, x, y, z, mat, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mats[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the yard's edge.
  box(40.4, 0.4, 36.4, 0, -0.2, 0, 'ground');
  box(0.5, WALL_H, 36.4, -20.2, WALL_H / 2, 0, 'wall');
  box(0.5, WALL_H, 36.4, 20.2, WALL_H / 2, 0, 'wall');
  box(40.4, WALL_H, 0.5, 0, WALL_H / 2, -18.2, 'wall');
  box(40.4, WALL_H, 0.5, 0, WALL_H / 2, 18.2, 'wall');

  // The furnace block at Site A: a squat foundry with a chimney.
  box(7, 3.4, 4.5, -14, 1.7, -14.5, 'rustDark');
  box(5, 1.4, 3, -14, 4.1, -14.5, 'rust');
  cylinder(0.7, 0.9, 6, -16.5, 3, -15.5, 'steel');
  box(1.2, 0.9, 1.2, -11, 0.45, -12.5, 'crate');
  box(1.2, 0.9, 1.2, -17, 0.45, -10.5, 'crate');

  // The silos at Site B: two tall tanks with a pipe gantry.
  cylinder(1.7, 1.7, 5.4, 12.2, 2.7, -14.5, 'steel');
  cylinder(1.7, 1.7, 5.4, 16, 2.7, -14.5, 'steel');
  box(6.4, 0.5, 0.5, 14, 5.6, -14.5, 'rust');
  box(1.2, 0.9, 1.2, 11, 0.45, -11, 'crate');
  box(1.2, 0.9, 1.2, 17.5, 0.45, -10.5, 'crate');

  // First cross wall (z = -6): gaps at the west alley, the middle and the east alley.
  box(7, 3.6, 0.6, -9.5, 1.8, -6, 'concrete');
  box(7, 3.6, 0.6, 9.5, 1.8, -6, 'concrete');
  // Second cross wall (z = 3): one door in the middle.
  box(17, 3.6, 0.6, -11.5, 1.8, 3, 'concrete');
  box(17, 3.6, 0.6, 11.5, 1.8, 3, 'concrete');

  // Mid cover: a container row and crates that split the middle lane.
  box(5, 2.4, 2.2, -2.5, 1.2, -1.5, 'crateDark');
  box(2.2, 2.4, 5, 4.5, 1.2, -1.5, 'crate');
  box(1.2, 1.1, 1.2, 0, 0.55, -9.5, 'crate');
  box(1.2, 1.1, 1.2, -6, 0.55, -9.5, 'crate');
  box(1.2, 1.1, 1.2, 6.5, 0.55, -9.5, 'crate');
  // Alley cover: crates to crouch behind on both sides.
  box(1.2, 1.1, 1.2, -16.5, 0.55, 2, 'crate');
  box(1.2, 1.1, 1.2, -16.5, 0.55, -2, 'crate');
  box(1.2, 1.1, 1.2, 16.5, 0.55, 2, 'crate');
  box(1.2, 1.1, 1.2, 16.5, 0.55, -2, 'crate');
  box(2.4, 1.1, 1.2, -16.5, 0.55, 8, 'crateDark');
  box(2.4, 1.1, 1.2, 16.5, 0.55, 8, 'crateDark');
  // Spawn cover for the attackers.
  box(2.4, 1.1, 1.2, -4, 0.55, 12, 'crate');
  box(2.4, 1.1, 1.2, 4, 0.55, 12, 'crate');
  // Pillars along the lanes.
  box(0.9, 3.6, 0.9, -9.5, 1.8, 10, 'concrete');
  box(0.9, 3.6, 0.9, 9.5, 1.8, 10, 'concrete');
  box(0.9, 3.6, 0.9, -9.5, 1.8, -13, 'concrete');
  box(0.9, 3.6, 0.9, 9.5, 1.8, -13, 'concrete');

  // Sodium lamp posts: a pole, a glowing head, and a warm point light.
  const lampLights = [];
  function lamp(x, z) {
    box(0.18, 5.2, 0.18, x, 2.6, z, 'steel', false);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), lampMat);
    head.position.set(x, 5.2, z);
    group.add(head);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 55, 26, 1.8);
    light.position.set(x, 5.0, z);
    scene.add(light);
    lampLights.push(light);
  }
  lamp(-14, -6);
  lamp(14, -6);
  lamp(0, -13);
  lamp(-17, 8);
  lamp(17, 8);

  // Bomb site rings: flat teal rings on the ground, with a marker pole.
  const siteRings = {};
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.28, site.radius, 40), siteMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    siteRings[key] = ring;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), siteMat);
    pole.position.set(site.x, 1.3, site.z);
    group.add(pole);
  }

  // Light: a cold moon key with shadows, a dusk hemisphere, and the lamp warmth.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2c3454'), new THREE.Color('#17130f'), 1.15);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#9fb4ff'), 2.0);
  moon.position.set(-14, 22, 10);
  moon.target.position.set(0, 0, -4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 26;
  moon.shadow.camera.bottom = -26;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 0.4);
  fill.position.set(12, 10, 14);
  scene.add(fill);

  // Routes the defenders walk: holds, patrol loops and approaches.
  const waypoints = {
    siteA: { x: -14, z: -11 },
    siteB: { x: 14, z: -11 },
    mid: { x: 0, z: -2 },
    westMid: { x: -16.5, z: 0 },
    eastMid: { x: 16.5, z: 0 },
    approachA: { x: -14, z: -3.5 },
    approachB: { x: 14, z: -3.5 },
    connector: { x: 0, z: -9 },
    spawn: { x: 0, z: 14 },
  };
  const routes = [
    [waypoints.siteA, waypoints.approachA],
    [waypoints.siteB, waypoints.approachB],
    [waypoints.mid, waypoints.connector, waypoints.mid, waypoints.westMid],
    [waypoints.mid, waypoints.connector, waypoints.mid, waypoints.eastMid],
  ];

  return {
    colliders,
    shootables,
    group,
    waypoints,
    routes,
    siteRings,
    lampLights,
    playerSpawn: { x: 0, z: 14, yaw: 0 },
    botSpawns: [
      { x: -14, z: -10 },
      { x: 14, z: -10 },
      { x: -4, z: -8 },
      { x: 4, z: -8 },
    ],
  };
}
