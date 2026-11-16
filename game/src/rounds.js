// The match: rounds, phases, money and the spike. Vanguard attacks, Hollow
// defends; first to 5 rounds takes the match. A round ends on elimination, on
// the spike exploding, on a defuse, or on the timer — and the economy pays out
// so the next buy phase matters.
import { clamp } from './rng.js';

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const FUSE_TIME = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch(hooks) {
  const match = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    round: 1,
    timer: BUY_TIME,
    score: { attack: 0, defend: 0 },
    money: 800,
    spike: { state: 'carried', site: 'A', position: { x: 0, z: 0 } },
    kills: { attack: 0, defend: 0 },
    roundWinner: null,
    roundReason: '',
    message: '',
  };

  function startRound() {
    match.phase = 'buy';
    match.timer = BUY_TIME;
    match.spike.state = 'carried';
    match.spike.site = Math.random() < 0.5 ? 'A' : 'B';
    match.roundWinner = null;
    match.roundReason = '';
    match.message = `ROUND ${match.round} — BUY PHASE`;
    hooks.onPhase('buy', match);
  }

  function beginLive() {
    match.phase = 'live';
    match.timer = ROUND_TIME;
    hooks.onPhase('live', match);
  }

  function award(winner, reason) {
    if (match.phase === 'roundEnd' || match.phase === 'matchEnd') return;
    match.phase = 'roundEnd';
    match.roundWinner = winner;
    match.roundReason = reason;
    match.score[winner] += 1;
    const playerWon = winner === 'attack';
    match.money += playerWon ? 300 : 150;
    match.money = clamp(match.money, 0, 16000);
    match.timer = 4;
    match.message = playerWon ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`;
    hooks.onRoundEnd(winner, reason, match);
    if (match.score.attack >= WIN_ROUNDS || match.score.defend >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.phase = 'matchEnd';
      const matchWinner = match.score.attack > match.score.defend ? 'attack' : 'defend';
      match.message = matchWinner === 'attack' ? 'MATCH WON — VANGUARD TAKES THE YARD' : 'MATCH LOST — HOLLOW HOLDS THE YARD';
      hooks.onMatchEnd(matchWinner, match);
    }
  }

  function nextRound() {
    match.round += 1;
    match.spike.state = 'carried';
    startRound();
    hooks.onRoundStart(match);
  }

  function step(dt) {
    if (match.phase === 'buy' || match.phase === 'live') {
      match.timer -= dt;
      if (match.timer <= 0) {
        if (match.phase === 'buy') beginLive();
        else award('defend', 'TIME EXPIRED');
      }
    } else if (match.phase === 'roundEnd') {
      match.timer -= dt;
      if (match.timer <= 0) {
        if (match.score.attack >= WIN_ROUNDS || match.score.defend >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
          match.phase = 'matchEnd';
        } else {
          nextRound();
        }
      }
    }
    if (match.spike.state === 'planted') {
      match.spike.fuse -= dt;
      if (match.spike.fuse <= 0) {
        match.spike.state = 'exploded';
        award('attack', 'SPIKE DETONATED');
        hooks.onExploded(match.spike.position);
      }
    }
  }

  return {
    match,
    startRound,
    beginLive,
    award,
    step,
    onKill(killerTeam, victimTeam) {
      if (killerTeam === 'attack') match.money += 300;
      match.kills[killerTeam] += 1;
    },
    onPlant() {
      match.spike.state = 'planted';
      match.spike.fuse = FUSE_TIME;
      match.money += 300;
      hooks.onPlanted(match);
    },
    onDefuse() {
      match.spike.state = 'defused';
      award('defend', 'SPIKE DEFUSED');
    },
    setSpikeSite(site) {
      match.spike.site = site;
    },
    setSpikePosition(x, z) {
      match.spike.position.x = x;
      match.spike.position.z = z;
    },
  };
}
