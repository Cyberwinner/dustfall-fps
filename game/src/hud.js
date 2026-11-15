// The DOM HUD: crosshair, hit marker, health, ammo, money, round score,
// timer, bomb status, kill feed, the buy menu and the overlay panels. It
// never touches the simulation; main.js pushes numbers in and reads the
// button callbacks out. All reads are cached so the DOM is only written
// when a value actually changes.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { CFG } from './state.js';

const COPY = {
  start: {
    title: 'DUSTFALL',
    copy: 'Foundry Row, dusk. You are the Vanguard: plant the charge at Furnace or Silos, or drop all four Wardens. First to five rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTFALL',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWin: {
    title: 'Round won',
    copy: '',
    action: 'Next round',
  },
  roundLose: {
    title: 'Round lost',
    copy: '',
    action: 'Next round',
  },
  matchWin: {
    title: 'Yard taken',
    copy: 'The Wardens are done. Foundry Row is yours.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Yard held',
    copy: 'The Wardens kept Foundry Row. Run it back.',
    action: 'Play again',
  },
};

export function createHud(store, callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthText = $('health-text');
  const armorFill = $('armor-fill');
  const armorRow = $('armor-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const scoreValue = $('score-value');
  const timerValue = $('timer-value');
  const bombStatus = $('bomb-status');
  const feedEl = $('feed');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const damageEl = $('damage');
  const buyPanel = $('buy');
  const buyMoney = $('buy-money');
  const buyList = $('buy-list');
  const deployBtn = $('deploy');
  const roundLabel = $('round-label');

  let hitTimer = 0;
  let damageTimer = 0;
  let last = {};
  const feedLines = [];

  // Build the buy menu once; updateBuy refreshes the afford states.
  const buyButtons = {};
  function buyRow(id, label, price, key) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    const name = document.createElement('span');
    name.className = 'buy-name';
    name.textContent = label;
    const cost = document.createElement('span');
    cost.className = 'buy-price';
    cost.textContent = price === 0 ? 'Owned' : '$' + price;
    const keyEl = document.createElement('kbd');
    keyEl.textContent = key;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buy-btn';
    btn.textContent = 'Buy';
    btn.addEventListener('click', () => callbacks.onBuy(id));
    row.append(name, cost, keyEl, btn);
    buyList.appendChild(row);
    buyButtons[id] = { row, btn, cost };
  }
  buyRow('rifle', WEAPONS.rifle.name + ' — Rifle', WEAPONS.rifle.price, '2');
  buyRow('smg', WEAPONS.smg.name + ' — SMG', WEAPONS.smg.price, '3');
  buyRow('shotgun', WEAPONS.shotgun.name + ' — Shotgun', WEAPONS.shotgun.price, '4');
  buyRow('grenade', 'Frag-9 — Grenade', GRENADE_PRICE, '5');
  buyRow('armor', 'Kevlar vest — 50 damage soak', ARMOR_PRICE, '6');

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(health, armor) {
      setText(healthText, 'hp', String(Math.max(0, Math.ceil(health))));
      healthFill.style.width = Math.max(0, health) + '%';
      healthFill.classList.toggle('low', health <= 30);
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      if (armor > 0) {
        armorFill.style.width = Math.min(100, (armor / CFG.armorPool) * 100) + '%';
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', '/ ' + reserve);
      setText(weaponName, 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      setText(moneyValue, 'money', '$' + money);
      setText(buyMoney, 'buymoney', '$' + money);
    },
    setScore(wins, losses, round) {
      setText(scoreValue, 'score', wins + ' — ' + losses);
      setText(roundLabel, 'round', 'Round ' + round + ' / ' + CFG.maxRounds);
    },
    setTimer(seconds, urgent) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      setText(timerValue, 'timer', text);
      timerValue.classList.toggle('urgent', urgent);
    },
    setBomb(bombState, timer, site) {
      let text = '';
      if (bombState === 'planted' || bombState === 'defusing') {
        text = '● BOMB — Site ' + site + ' ' + Math.ceil(timer) + 's';
      } else if (bombState === 'planting') {
        text = 'Planting…';
      }
      setText(bombStatus, 'bomb', text);
      bombStatus.classList.toggle('live', bombState === 'planted' || bombState === 'defusing');
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', px.toFixed(1) + 'px');
    },
    setPlant(frac) {
      if (frac === null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = Math.round(frac * 100) + '%';
    },
    feed(line) {
      feedLines.unshift(line);
      while (feedLines.length > 4) feedLines.pop();
      feedEl.innerHTML = '';
      for (const text of feedLines) {
        const div = document.createElement('div');
        div.textContent = text;
        feedEl.appendChild(div);
      }
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageEl.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageEl.classList.remove('on'), 180);
    },
    showBuy(open) {
      buyPanel.hidden = !open;
      if (open) {
        setText($('buy-round'), 'buyround', String(store.round));
        this.updateBuy();
      }
    },
    updateBuy() {
      for (const [id, parts] of Object.entries(buyButtons)) {
        const owned = id === 'grenade'
          ? store.kit.grenades > 0
          : id === 'armor'
            ? store.kit.armor
            : store.kit.weapons.includes(id);
        const price = id === 'grenade' ? GRENADE_PRICE : id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
        const afford = store.money >= price;
        parts.btn.disabled = owned || !afford;
        parts.btn.textContent = owned ? 'Owned' : afford ? 'Buy' : 'Need $' + price;
        parts.row.classList.toggle('owned', owned);
      }
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'roundWin' || mode === 'roundLose') {
        copy.textContent = extra + '  ' + store.wins + ' — ' + store.losses + ' after round ' + (store.round - 1) + '.';
      } else {
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onDeploy(handler) {
      deployBtn.addEventListener('click', handler);
    },
  };
}
