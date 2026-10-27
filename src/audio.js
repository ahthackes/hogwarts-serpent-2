/* Copyright (c) 2026 Ahtsham - Hogwarts Serpent. Non-commercial source-available license, see LICENSE. */
/* ============================================================
   Hogwarts Serpent — synthesised audio (no external files)
   ============================================================ */
(function () {
  const HPS = (window.HPS = window.HPS || {});

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let musicTimer = null;
  let musicStep = 0;
  let started = false;

  const settings = () => (HPS.Save ? HPS.Save.data.settings : { sound: true, music: true });

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = settings().sound === false ? 0 : 0.6;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = settings().music === false ? 0 : 0.26;
      musicBus.connect(master);

      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(opt) {
    if (!ctx) return;
    const t0 = (opt.when || ctx.currentTime) + (opt.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opt.type || "sine";
    osc.frequency.setValueAtTime(opt.freq || 440, t0);
    if (opt.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.slideTo), t0 + (opt.dur || 0.2));
    const vol = opt.vol == null ? 0.2 : opt.vol;
    const attack = opt.attack == null ? 0.008 : opt.attack;
    const dur = opt.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(opt.bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(opt) {
    if (!ctx || !noiseBuf) return;
    const t0 = (opt.when || ctx.currentTime) + (opt.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || "bandpass";
    f.frequency.setValueAtTime(opt.freq || 800, t0);
    if (opt.slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.slideTo), t0 + (opt.dur || 0.3));
    f.Q.value = opt.q || 0.8;
    const g = ctx.createGain();
    const vol = opt.vol == null ? 0.18 : opt.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opt.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opt.dur || 0.3));
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + (opt.dur || 0.3) + 0.05);
  }

  const EAT_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

  const SFX = {
    click() {
      tone({ freq: 720, slideTo: 480, dur: 0.07, vol: 0.08, type: "triangle" });
    },
    hover() {
      tone({ freq: 900, dur: 0.04, vol: 0.03, type: "sine" });
    },
    eat(combo) {
      const n = EAT_NOTES[Math.min(EAT_NOTES.length - 1, Math.max(0, (combo || 1) - 1))];
      tone({ freq: n, dur: 0.16, vol: 0.16, type: "triangle" });
      tone({ freq: n * 2, dur: 0.22, vol: 0.06, type: "sine", delay: 0.02 });
    },
    power() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.28, vol: 0.1, type: "triangle", delay: i * 0.055 }));
      tone({ freq: 2093, dur: 0.4, vol: 0.03, type: "sine", delay: 0.18 });
    },
    portal() {
      tone({ freq: 220, slideTo: 1200, dur: 0.32, vol: 0.1, type: "sine" });
      tone({ freq: 880, slideTo: 260, dur: 0.3, vol: 0.06, type: "triangle", delay: 0.08 });
    },
    revive() {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.65, vol: 0.09, type: "sine", delay: i * 0.09, attack: 0.04 }));
    },
    death() {
      tone({ freq: 180, slideTo: 42, dur: 1.1, vol: 0.22, type: "sawtooth", attack: 0.01 });
      noise({ freq: 900, slideTo: 120, dur: 0.7, vol: 0.16, filter: "lowpass" });
    },
    hit() {
      noise({ freq: 500, slideTo: 90, dur: 0.35, vol: 0.2, filter: "lowpass" });
      tone({ freq: 90, slideTo: 45, dur: 0.3, vol: 0.15, type: "square" });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone({ freq: f, dur: 0.8, vol: 0.12, type: "triangle", delay: i * 0.1, attack: 0.02 }));
      tone({ freq: 1567.98, dur: 1.4, vol: 0.06, type: "sine", delay: 0.45 });
    },
    boss() {
      tone({ freq: 70, slideTo: 48, dur: 1.4, vol: 0.24, type: "sawtooth", attack: 0.12 });
      noise({ freq: 260, dur: 1.2, vol: 0.09, filter: "lowpass", attack: 0.2 });
    },
    warn() {
      tone({ freq: 330, dur: 0.18, vol: 0.07, type: "square" });
      tone({ freq: 330, dur: 0.18, vol: 0.07, type: "square", delay: 0.26 });
    },
    slam() {
      noise({ freq: 200, slideTo: 40, dur: 0.6, vol: 0.28, filter: "lowpass" });
      tone({ freq: 55, slideTo: 32, dur: 0.5, vol: 0.2, type: "sine" });
    },
    flame() {
      noise({ freq: 1400, slideTo: 300, dur: 0.9, vol: 0.16, filter: "bandpass", q: 0.4 });
    },
    beam() {
      tone({ freq: 300, slideTo: 700, dur: 0.5, vol: 0.09, type: "sawtooth" });
      noise({ freq: 2400, dur: 0.5, vol: 0.06, filter: "highpass" });
    },
    combo() {
      tone({ freq: 1200, dur: 0.1, vol: 0.05, type: "sine" });
    }
  };

  /* ------------------------- ambient music ------------------------- */
  const CHORDS = [
    [146.83, 174.61, 220.0, 261.63],   // Dm
    [116.54, 146.83, 174.61, 220.0],   // Bb
    [98.0, 123.47, 146.83, 196.0],     // G
    [110.0, 130.81, 164.81, 196.0]     // Am
  ];
  const BELLS = [587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];

  function scheduleChord() {
    if (!ctx) return;
    const now = ctx.currentTime + 0.1;
    const chord = CHORDS[musicStep % CHORDS.length];
    chord.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 4;
      const vol = i === 0 ? 0.12 : 0.055;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol, now + 2.8);
      g.gain.setValueAtTime(vol, now + 4.4);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 8.6);
      osc.connect(g); g.connect(musicBus);
      osc.start(now); osc.stop(now + 9);
    });
    // sparse bell
    if (musicStep % 2 === 0) {
      const f = BELLS[(musicStep * 3) % BELLS.length];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + 1.2);
      g.gain.exponentialRampToValueAtTime(0.035, now + 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 5.2);
      osc.connect(g); g.connect(musicBus);
      osc.start(now + 1.2); osc.stop(now + 5.4);
    }
    musicStep++;
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    if (settings().music === false) return;
    scheduleChord();
    musicTimer = setInterval(scheduleChord, 8200);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  const Audio = {
    init() {
      ensure();
      if (ctx && !started) { started = true; startMusic(); }
      this.applySettings();
    },
    play(name, opt) {
      if (!ctx || settings().sound === false) return;
      const fn = SFX[name];
      if (fn) {
        try { fn(opt); } catch (e) { /* ignore audio errors */ }
      }
    },
    applySettings() {
      const s = settings();
      if (sfxBus) sfxBus.gain.value = s.sound === false ? 0 : 0.6;
      if (musicBus) musicBus.gain.value = s.music === false ? 0 : 0.26;
      if (s.music === false) stopMusic();
      else if (ctx) startMusic();
    },
    setMusic(on) {
      if (HPS.Save) HPS.Save.setSetting("music", on);
      if (on) ensure();
      this.applySettings();
      if (on) startMusic();
    },
    setSound(on) {
      if (HPS.Save) HPS.Save.setSetting("sound", on);
      this.applySettings();
    },
    suspend() {
      stopMusic();
    }
  };

  HPS.Audio = Audio;
})();
