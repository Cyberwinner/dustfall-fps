// Synthesised sound: every effect is built from oscillators and filtered
// noise, so the game ships no audio files and loads nothing over the network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx !== null;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'shotgun') {
        noise(0.16, 0.5, 900);
        tone(160, 0.12, 'square', 0.2, 60);
      } else if (kind === 'smg') {
        noise(0.07, 0.32, 1600);
        tone(220, 0.05, 'square', 0.12, 90);
      } else if (kind === 'pistol') {
        noise(0.09, 0.38, 1200);
        tone(200, 0.07, 'square', 0.15, 80);
      } else {
        noise(0.11, 0.42, 1400);
        tone(180, 0.08, 'square', 0.16, 70);
      }
    },
    dryFire() {
      tone(1400, 0.03, 'square', 0.08);
    },
    reload() {
      tone(900, 0.04, 'square', 0.1);
      setTimeout(() => tone(700, 0.04, 'square', 0.1), 120);
    },
    hit() {
      tone(1250, 0.05, 'sine', 0.22);
    },
    kill() {
      tone(660, 0.07, 'sine', 0.22);
      setTimeout(() => tone(990, 0.1, 'sine', 0.22), 70);
    },
    hurt() {
      tone(140, 0.15, 'sawtooth', 0.2, 70);
    },
    beep(freq = 880, dur = 0.06) {
      tone(freq, dur, 'sine', 0.18);
    },
    blip(freq, dur, vol) {
      tone(freq, dur, 'sine', vol);
    },
    plantDone() {
      tone(520, 0.09, 'sine', 0.2);
      setTimeout(() => tone(780, 0.12, 'sine', 0.2), 90);
    },
    explosion() {
      noise(0.9, 0.7, 320);
      tone(70, 0.7, 'sine', 0.5, 30);
    },
    step() {
      noise(0.05, 0.06, 500);
    },
    roundWin() {
      tone(523, 0.12, 'sine', 0.2);
      setTimeout(() => tone(659, 0.12, 'sine', 0.2), 120);
      setTimeout(() => tone(784, 0.2, 'sine', 0.2), 240);
    },
    roundLose() {
      tone(392, 0.15, 'sine', 0.2);
      setTimeout(() => tone(311, 0.25, 'sine', 0.2), 150);
    },
    buy() {
      tone(980, 0.05, 'sine', 0.15);
    },
  };
}
