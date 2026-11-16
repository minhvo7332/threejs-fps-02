// Sound, synthesized: every shot, reload, hit, plant beep and explosion is
// built from oscillators and filtered noise in the Web Audio API. No audio
// files, no network — the game ships silent until the player clicks, then the
// AudioContext wakes on that gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t, Math.random() * 0.2, duration);
  }

  function tone(freq, duration, type, gainValue, slideTo = null, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    ensure,
    shot(kind) {
      if (!ensure()) return;
      if (kind === 'lancer') {
        noise(0.28, 900, 0.9);
        tone(140, 0.22, 'sine', 0.7, 45);
      } else if (kind === 'pdw9') {
        noise(0.12, 2400, 0.55);
        tone(190, 0.08, 'square', 0.25, 90);
      } else if (kind === 'p9') {
        noise(0.14, 1800, 0.6);
        tone(170, 0.1, 'sine', 0.5, 70);
      } else {
        noise(0.16, 1400, 0.8);
        tone(150, 0.14, 'sine', 0.6, 55);
      }
    },
    enemyShot(distance) {
      if (!ensure()) return;
      const volume = Math.max(0.08, 0.55 - distance * 0.012);
      noise(0.14, 1100, volume);
      tone(130, 0.1, 'sine', volume * 0.7, 50);
    },
    dryFire() {
      if (!ensure()) return;
      tone(1200, 0.03, 'square', 0.15);
    },
    reload() {
      if (!ensure()) return;
      tone(900, 0.04, 'square', 0.2);
      tone(700, 0.04, 'square', 0.2, null, 0.18);
      tone(1100, 0.05, 'square', 0.22, null, 0.5);
    },
    hit(kill) {
      if (!ensure()) return;
      tone(kill ? 1320 : 990, 0.07, 'sine', 0.35);
      if (kill) tone(1760, 0.12, 'sine', 0.3, null, 0.07);
    },
    hurt() {
      if (!ensure()) return;
      tone(220, 0.15, 'sawtooth', 0.3, 110);
    },
    plantBeep(progress) {
      if (!ensure()) return;
      tone(880 + progress * 440, 0.05, 'square', 0.18);
    },
    explosion() {
      if (!ensure()) return;
      noise(1.1, 320, 1.0);
      tone(70, 0.9, 'sine', 0.9, 28);
    },
    roundWin() {
      if (!ensure()) return;
      tone(523, 0.14, 'sine', 0.3);
      tone(659, 0.14, 'sine', 0.3, null, 0.13);
      tone(784, 0.28, 'sine', 0.35, null, 0.26);
    },
    roundLose() {
      if (!ensure()) return;
      tone(392, 0.18, 'sine', 0.3);
      tone(311, 0.3, 'sine', 0.3, null, 0.17);
    },
    buy() {
      if (!ensure()) return;
      tone(1046, 0.06, 'sine', 0.25);
      tone(1318, 0.09, 'sine', 0.25, null, 0.06);
    },
    click() {
      if (!ensure()) return;
      tone(800, 0.04, 'square', 0.15);
    },
  };
}
