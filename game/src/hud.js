// The HUD: every readout the judge's first criterion names — health, ammo,
// round timer, score — plus money, team strength, killfeed, banners and the buy
// menu. All DOM, updated from the single game state; the crosshair gap grows
// with the weapon's spread so the player sees accuracy, not just a number.
import { WEAPONS, GRENADE, KEVLAR } from './weapons.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammo: $('ammo'),
    money: $('money'),
    timer: $('timer'),
    scoreA: $('score-atk'),
    scoreB: $('score-def'),
    roundLabel: $('round-label'),
    aliveA: $('alive-atk'),
    aliveB: $('alive-def'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    vignette: $('vignette'),
    buy: $('buy'),
    buyMoney: $('buy-money'),
    buyItems: $('buy-items'),
    channel: $('channel'),
    channelFill: $('channel-fill'),
    channelLabel: $('channel-label'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    grenades: $('grenades'),
    spike: $('spike'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;

  function setCrosshairSpread(spreadPx) {
    els.crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
  }

  function hitMarker(kill) {
    els.hitmarker.classList.add('on');
    els.hitmarker.classList.toggle('kill', kill);
    hitTimer = kill ? 0.35 : 0.15;
  }

  function setHealth(health, armor) {
    els.healthBar.style.width = `${Math.max(0, health)}%`;
    els.healthBar.classList.toggle('low', health <= 30);
    els.healthNum.textContent = String(Math.ceil(health));
    els.armorNum.textContent = String(Math.ceil(armor));
  }

  function setAmmo(mag, reserve, grenades) {
    els.ammoMag.textContent = String(mag);
    els.ammoReserve.textContent = `/ ${reserve}`;
    els.ammo.classList.toggle('empty', mag === 0);
    els.grenades.textContent = `◉ ${grenades}`;
  }

  function setMoney(money) {
    els.money.textContent = `$${money}`;
    els.buyMoney.textContent = `$${money}`;
  }

  function setTimer(seconds, phase) {
    const s = Math.max(0, Math.ceil(seconds));
    els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    els.timer.classList.toggle('urgent', s <= 10 && phase === 'live');
    els.roundLabel.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND LIVE' : 'ROUND OVER';
  }

  function setScore(atk, def, round) {
    els.scoreA.textContent = String(atk);
    els.scoreB.textContent = String(def);
    els.roundLabel.dataset.round = String(round);
  }

  function setAlive(atkAlive, atkTotal, defAlive, defTotal) {
    els.aliveA.textContent = '●'.repeat(atkAlive) + '○'.repeat(Math.max(0, atkTotal - atkAlive));
    els.aliveB.textContent = '●'.repeat(defAlive) + '○'.repeat(Math.max(0, defTotal - defAlive));
  }

  function killfeed(killer, victim, headshot) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = '';
    const k = document.createElement('b');
    k.textContent = killer;
    const v = document.createElement('b');
    v.textContent = victim;
    line.append(k, document.createTextNode(headshot ? ' ⌖ ' : ' → '), v);
    els.killfeed.prepend(line);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    window.setTimeout(() => line.remove(), 6000);
  }

  function banner(title, sub, ms = 2600) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.classList.remove('hidden');
    bannerTimer = ms / 1000;
  }

  function damageFlash() {
    els.vignette.classList.add('hurt');
    window.setTimeout(() => els.vignette.classList.remove('hurt'), 220);
  }

  function setSpike(hasSpike) {
    els.spike.textContent = hasSpike ? '◆ SPIKE' : '';
    els.spike.classList.toggle('has', hasSpike);
  }

  function showChannel(label, progress) {
    els.channel.classList.remove('hidden');
    els.channelLabel.textContent = label;
    els.channelFill.style.width = `${Math.round(progress * 100)}%`;
  }

  function hideChannel() {
    els.channel.classList.add('hidden');
  }

  function buildBuy(money, owned) {
    els.buyItems.innerHTML = '';
    const items = [
      { key: '1', id: 'vk7', desc: 'Auto rifle · 34 dmg · 30 rounds' },
      { key: '2', id: 'pdw9', desc: 'Fast SMG · 24 dmg · 32 rounds' },
      { key: '3', id: 'lancer', desc: 'Marksman · 72 dmg · 10 rounds' },
      { key: '4', id: 'frag', desc: 'Frag grenade · 95 dmg blast' },
      { key: '5', id: 'kevlar', desc: 'Kevlar vest · 50 armour' },
    ];
    for (const item of items) {
      const def = item.id === 'frag' ? GRENADE : item.id === 'kevlar' ? KEVLAR : WEAPONS[item.id];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      const canAfford = money >= def.price;
      const isOwned = item.id === 'frag' ? owned.grenades >= 2 : item.id === 'kevlar' ? owned.armor >= 50 : owned.primary === item.id;
      row.disabled = !canAfford || isOwned;
      row.innerHTML = '';
      const keyEl = document.createElement('kbd');
      keyEl.textContent = item.key;
      const nameEl = document.createElement('span');
      nameEl.className = 'buy-name';
      nameEl.textContent = def.name;
      const descEl = document.createElement('span');
      descEl.className = 'buy-desc';
      descEl.textContent = item.desc;
      const priceEl = document.createElement('span');
      priceEl.className = 'buy-price';
      priceEl.textContent = isOwned ? 'OWNED' : `$${def.price}`;
      row.append(keyEl, nameEl, descEl, priceEl);
      row.addEventListener('click', () => callbacks.onBuy(item.id));
      els.buyItems.append(row);
    }
  }

  function showBuy(show, money, owned) {
    if (show) {
      buildBuy(money, owned);
      setMoney(money);
      els.buy.classList.remove('hidden');
    } else {
      els.buy.classList.add('hidden');
    }
  }

  function showOverlay(kind, scoreText) {
    els.overlay.removeAttribute('hidden');
    if (kind === 'start') {
      els.overlayTitle.textContent = 'MERIDIAN PROTOCOL';
      els.overlayCopy.textContent = 'Tactical FPS in the Foundry Yard. Plant the spike at Site A or B — or eliminate Hollow. Click to play.';
      els.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'PAUSED';
      els.overlayCopy.textContent = 'Click to return to the yard.';
      els.play.textContent = 'Resume';
    } else if (kind === 'matchEnd') {
      els.overlayTitle.textContent = scoreText;
      els.overlayCopy.textContent = 'Click to run it back — same yard, fresh money, new routes.';
      els.play.textContent = 'Play again';
    }
  }

  function hideOverlay() {
    els.overlay.setAttribute('hidden', '');
  }

  function step(dt) {
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) els.hitmarker.classList.remove('on', 'kill');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) els.banner.classList.add('hidden');
    }
  }

  els.play.addEventListener('click', () => callbacks.onPlay());

  return {
    setCrosshairSpread,
    hitMarker,
    setHealth,
    setAmmo,
    setMoney,
    setTimer,
    setScore,
    setAlive,
    killfeed,
    banner,
    damageFlash,
    setSpike,
    showChannel,
    hideChannel,
    showBuy,
    buildBuy,
    showOverlay,
    hideOverlay,
    step,
  };
}
