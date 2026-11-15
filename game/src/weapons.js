// The armoury: four hitscan weapons, each with its own numbers, view model and
// feel. One module owns every weapon's magazine, reload and spread; main.js
// owns the ray and the damage. Spread grows with movement speed, so stopping
// to aim pays; crouching and walking slow tighten it further.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Sidewinder P9', kind: 'Pistol', price: 0, auto: false,
    mag: 12, reserve: 36, damage: 26, headDamage: 65, gap: 0.16, reload: 1.3,
    spreadStill: 0.003, spreadMove: 0.02, pellets: 1, kick: 0.006, buyKey: '1',
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Longshot', kind: 'Rifle', price: 2700, auto: true,
    mag: 30, reserve: 90, damage: 30, headDamage: 75, gap: 0.096, reload: 1.9,
    spreadStill: 0.0022, spreadMove: 0.028, pellets: 1, kick: 0.009, buyKey: '2',
  },
  smg: {
    id: 'smg', name: 'Hornet-9', kind: 'SMG', price: 1500, auto: true,
    mag: 25, reserve: 100, damage: 22, headDamage: 55, gap: 0.062, reload: 1.7,
    spreadStill: 0.004, spreadMove: 0.03, pellets: 1, kick: 0.005, buyKey: '3',
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', kind: 'Shotgun', price: 1800, auto: false,
    mag: 6, reserve: 18, damage: 12, headDamage: 24, gap: 0.85, reload: 2.4,
    spreadStill: 0.02, spreadMove: 0.05, pellets: 8, kick: 0.02, buyKey: '4',
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

const MOVE_REFERENCE = 5.2;

export function createWeaponSet(camera, store) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#454b57'), roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rustDark), roughness: 0.6, metalness: 0.3 });

  // One view model per weapon, built from boxes; only the equipped one shows.
  const models = {};
  function buildModel(def) {
    const model = new THREE.Group();
    const len = def.id === 'pistol' ? 0.22 : def.id === 'shotgun' ? 0.62 : def.id === 'smg' ? 0.4 : 0.52;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), def.id === 'shotgun' ? darkMat : bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.7), grip);
    barrel.position.set(0, 0.025, -len * 0.55);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, len * 0.42);
    model.add(receiver, barrel, stock);
    if (def.id === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.2), darkMat);
      pump.position.set(0, -0.02, -len * 0.35);
      model.add(pump);
    }
    if (def.id === 'rifle') {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), darkMat);
      sight.position.set(0, 0.08, -0.05);
      model.add(sight);
    }
    model.position.set(0.26, -0.23, -0.5);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.21, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 5);
  flashLight.position.set(0.26, -0.19, -0.7);
  camera.add(flashLight);

  // Per-weapon live state; ammo persists between rounds only as refills.
  const live = {};
  for (const def of Object.values(WEAPONS)) {
    live[def.id] = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  }
  let current = 'pistol';
  let switchLeft = 0;
  models[current].visible = true;

  function def() {
    return WEAPONS[current];
  }
  function state() {
    return live[current];
  }

  function step(dt) {
    const st = state();
    st.cooldown = Math.max(0, st.cooldown - dt);
    st.flash = Math.max(0, st.flash - dt);
    st.kick += (0 - st.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.5 + st.kick;
    model.rotation.x = st.kick * 2.2;
    flash.visible = st.flash > 0;
    flash.rotation.z = st.flash * 30;
    flashLight.intensity = st.flash > 0 ? 18 : 0;
    if (st.reloadLeft > 0) {
      st.reloadLeft = Math.max(0, st.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - st.reloadLeft) * 2);
      if (st.reloadLeft === 0) {
        const need = def().mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
      }
    }
    if (switchLeft > 0) {
      switchLeft = Math.max(0, switchLeft - dt);
      model.position.y = -0.23 - Math.sin((switchLeft / 0.4) * Math.PI) * 0.12;
    }
  }

  return {
    def,
    state,
    step,
    currentId() {
      return current;
    },
    owned(id) {
      return store.kit.weapons.includes(id);
    },
    equip(id) {
      if (!store.kit.weapons.includes(id) || id === current || switchLeft > 0) return false;
      models[current].visible = false;
      current = id;
      store.weapon = id;
      models[current].visible = true;
      switchLeft = 0.4;
      return true;
    },
    cycle() {
      const owned = store.kit.weapons;
      const next = owned[(owned.indexOf(current) + 1) % owned.length];
      return this.equip(next);
    },
    ready() {
      const st = state();
      return st.mag > 0 && st.cooldown === 0 && st.reloadLeft === 0 && switchLeft === 0;
    },
    fire() {
      const st = state();
      if (st.mag <= 0) return false;
      st.mag -= 1;
      st.cooldown = def().gap;
      st.flash = 0.06;
      st.kick = 0.055;
      return true;
    },
    reload() {
      const st = state();
      if (st.reloadLeft > 0 || st.mag === def().mag || st.reserve === 0) return;
      st.reloadLeft = def().reload;
    },
    spread(speed, crouching) {
      const d = def();
      const move = Math.min(1, speed / MOVE_REFERENCE);
      let spread = d.spreadStill + move * d.spreadMove;
      if (crouching) spread *= 0.7;
      return spread;
    },
    refillAll() {
      for (const defn of Object.values(WEAPONS)) {
        live[defn.id].mag = defn.mag;
        live[defn.id].reserve = defn.reserve;
        live[defn.id].cooldown = 0;
        live[defn.id].reloadLeft = 0;
        live[defn.id].flash = 0;
        live[defn.id].kick = 0;
      }
      if (!store.kit.weapons.includes(current)) this.equip('pistol');
    },
  };
}
