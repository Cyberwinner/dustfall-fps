// The one state store: every number the match cares about lives here, and the
// modules read and write it instead of keeping their own copies. Rendering
// reads it; the fixed-step simulation writes it; nothing else holds match state.
export const CFG = {
  roundsToWin: 5,
  maxRounds: 9,
  roundSeconds: 100,
  plantSeconds: 3.5,
  bombSeconds: 40,
  defuseSeconds: 5,
  startMoney: 800,
  winBonus: 650,
  lossBonus: 350,
  killBonus: 300,
  plantBonus: 300,
  playerHealth: 100,
  botHealth: 100,
  botCount: 4,
  headshotMult: 2.5,
  armorAbsorb: 0.5,
  armorPool: 50,
  grenadeFuse: 2.4,
  grenadeRadius: 7,
  grenadeMax: 120,
  grenadeMin: 18,
  footstepMeters: 2.4,
  hearRadius: 26,
};

export const SITES = {
  A: { name: 'Furnace', x: -14, z: -12, radius: 3.6 },
  B: { name: 'Silos', x: 14, z: -12, radius: 3.6 },
};

export function createState() {
  return {
    // Match flow: 'menu' | 'buy' | 'live' | 'roundEnd' | 'matchEnd'
    phase: 'menu',
    round: 1,
    wins: 0,
    losses: 0,
    money: CFG.startMoney,
    timer: CFG.roundSeconds,
    elapsed: 0,
    roundKills: 0,
    matchKills: 0,
    // Bomb: 'idle' | 'planting' | 'planted' | 'defusing' | 'detonated' | 'defused'
    bomb: { state: 'idle', site: null, plant: 0, timer: 0, defuse: 0, defuser: null },
    // Player vitals (the body lives in player.js, the numbers live here)
    player: { health: CFG.playerHealth, armor: 0, alive: true, crouching: false },
    // Per-bot entries are created by bots.js and stored here: { id, health, alive, ... }
    bots: [],
    // Grenades in flight, created by grenades.js
    grenades: [],
    // Kill feed lines, newest first, capped by hud.js
    feed: [],
    // Round-end banner text set by main.js
    banner: { title: '', sub: '' },
    // Buy menu selection state
    buyOpen: false,
    // Owned kit: weapon ids, grenade count, armour flag
    kit: { weapons: ['pistol'], grenades: 0, armor: false },
    weapon: 'pistol',
    // Diagnostics the HUD and the shot stager read
    lastHit: { at: 0, killed: false },
    shake: 0,
    // Deterministic capture mode (?shot=...): the sim runs scripted, no input
    shot: null,
  };
}

export function resetRound(state) {
  state.timer = CFG.roundSeconds;
  state.elapsed = 0;
  state.roundKills = 0;
  state.bomb = { state: 'idle', site: null, plant: 0, timer: 0, defuse: 0, defuser: null };
  state.player.health = CFG.playerHealth;
  state.player.alive = true;
  state.grenades.length = 0;
  state.feed.length = 0;
  state.shake = 0;
}
