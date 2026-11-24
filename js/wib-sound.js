/* Who's in the Box: sound effects. Everything is synthesized with Web Audio, so there are no
 * audio files to load. Browsers only allow audio after a click or key press, so the context is
 * created on the first one (see the listeners at the bottom). */
(function () {
  "use strict";

  let ctx = null;
  let master = null;
  let enabled = true;
  let tOff = 0;
  let hov = null;

  function unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  const ready = () => enabled && ctx && ctx.state === "running";

  function voice(o) {
    if (!ready()) return;
    try {
      const {
        f0, f1 = f0, t = 0, dur = 0.15, type = "sine", vol = 0.1, atk = 0.01,
        vib = 0, vibHz = 6, lp = 0, bp = 0, q = 1,
      } = o;
      const s = ctx.currentTime + tOff + t;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, s);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), s + dur);
      if (vib) {
        const l = ctx.createOscillator();
        const lg = ctx.createGain();
        l.frequency.value = vibHz;
        lg.gain.value = vib;
        l.connect(lg).connect(osc.frequency);
        l.start(s);
        l.stop(s + dur + 0.05);
      }
      let node = osc;
      if (lp || bp) {
        const f = ctx.createBiquadFilter();
        f.type = lp ? "lowpass" : "bandpass";
        f.frequency.value = lp || bp;
        f.Q.value = q;
        osc.connect(f);
        node = f;
      }
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(vol, s + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      node.connect(g).connect(master);
      osc.start(s);
      osc.stop(s + dur + 0.05);
    } catch (e) {}
  }

  function noise(o) {
    if (!ready()) return;
    try {
      const { t = 0, dur = 0.05, freq = 2000, q = 1, vol = 0.1, type = "bandpass" } = o;
      const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      const s = ctx.currentTime + tOff + t;
      g.gain.setValueAtTime(vol, s);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      src.connect(f).connect(g).connect(master);
      src.start(s);
    } catch (e) {}
  }

  const after = (d, fn) => {
    tOff = d;
    try {
      fn();
    } finally {
      tOff = 0;
    }
  };

  const CALLS = {
    frog() {
      voice({ f0: 140, f1: 100, dur: 0.12, type: "square", vol: 0.05, lp: 700, vib: 25, vibHz: 38 });
      voice({ t: 0.16, f0: 170, f1: 110, dur: 0.16, type: "square", vol: 0.05, lp: 800, vib: 30, vibHz: 40 });
    },
    duck() {
      [0, 0.22].forEach((t) => voice({ t, f0: 520, f1: 330, dur: 0.15, type: "sawtooth", vol: 0.09, bp: 1300, q: 1.5 }));
    },
    bunny() {
      voice({ f0: 1500, f1: 2000, dur: 0.07, vol: 0.07 });
      voice({ t: 0.11, f0: 1700, f1: 2300, dur: 0.09, vol: 0.07 });
      noise({ t: 0.21, dur: 0.03, freq: 5000, vol: 0.04 });
    },
    bear() {
      voice({ f0: 120, f1: 85, dur: 0.5, type: "sawtooth", vol: 0.12, lp: 520, vib: 12, vibHz: 22, atk: 0.06 });
    },
    owl() {
      voice({ f0: 430, f1: 370, dur: 0.28, vol: 0.14, atk: 0.05, vib: 6, vibHz: 5 });
      voice({ t: 0.34, f0: 390, f1: 330, dur: 0.36, vol: 0.14, atk: 0.05, vib: 6, vibHz: 5 });
    },
    pig() {
      voice({ f0: 240, f1: 150, dur: 0.13, type: "sawtooth", vol: 0.08, lp: 900 });
      voice({ t: 0.15, f0: 170, f1: 290, dur: 0.11, type: "sawtooth", vol: 0.08, lp: 900 });
      noise({ t: 0.28, dur: 0.12, freq: 900, q: 0.8, vol: 0.09 });
    },
    tiger() {
      voice({ f0: 110, f1: 180, dur: 0.18, type: "sawtooth", vol: 0.11, lp: 700, vib: 18, vibHz: 30, atk: 0.03 });
      voice({ t: 0.16, f0: 180, f1: 90, dur: 0.35, type: "sawtooth", vol: 0.11, lp: 650, vib: 22, vibHz: 32 });
      noise({ t: 0.05, dur: 0.4, freq: 500, q: 0.7, vol: 0.05 });
    },
    lion() {
      voice({ f0: 95, f1: 170, dur: 0.3, type: "sawtooth", vol: 0.13, lp: 600, vib: 10, vibHz: 9, atk: 0.08 });
      voice({ t: 0.28, f0: 170, f1: 70, dur: 0.6, type: "sawtooth", vol: 0.13, lp: 550, vib: 14, vibHz: 11 });
      noise({ t: 0.1, dur: 0.7, freq: 350, q: 0.6, vol: 0.06, type: "lowpass" });
    },
    cat() {
      voice({ f0: 520, f1: 880, dur: 0.16, type: "sawtooth", vol: 0.07, bp: 1400, q: 2, atk: 0.03 });
      voice({ t: 0.15, f0: 880, f1: 460, dur: 0.38, type: "sawtooth", vol: 0.07, bp: 1200, q: 2, vib: 8, vibHz: 6 });
    },
    dog() {
      [0, 0.24].forEach((t) => {
        voice({ t, f0: 320, f1: 170, dur: 0.12, type: "sawtooth", vol: 0.1, lp: 1000 });
        noise({ t, dur: 0.06, freq: 700, q: 0.8, vol: 0.06 });
      });
    },
    mouse() {
      [0, 0.12, 0.24].forEach((t, i) => voice({ t, f0: 2300 + i * 150, f1: 2900 + i * 150, dur: 0.06, vol: 0.06 }));
    },
    shark() {
      noise({ dur: 0.25, freq: 1200, q: 0.5, vol: 0.06 });
      [0, 0.09, 0.17, 0.24, 0.3].forEach((t, i) => voice({ t: 0.08 + t, f0: 220 + i * 40, f1: 700 + i * 60, dur: 0.06, vol: 0.07 }));
    },
    dino() {
      voice({ f0: 170, f1: 260, dur: 0.14, type: "sawtooth", vol: 0.1, lp: 900, vib: 12, vibHz: 30, atk: 0.02 });
      voice({ t: 0.13, f0: 260, f1: 110, dur: 0.4, type: "sawtooth", vol: 0.11, lp: 800, vib: 25, vibHz: 34 });
    },
  };

  const sparkle = (t = 0) =>
    [1568, 1976, 2349].forEach((f, i) => voice({ t: t + i * 0.06, f0: f, f1: f * 1.01, dur: 0.2, vol: 0.04 }));

  const sound = {
    unlock,
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) sound.stopHover();
    },
    isEnabled: () => enabled,
    /** An animal's call on its own. */
    call(name) {
      if (CALLS[name]) CALLS[name]();
    },
    /** Soft wooden ticks, one rattle per wiggle of the cued box. */
    rattle() {
      [0, 0.09, 0.18, 0.27].forEach((t, i) => {
        noise({ t, dur: 0.035, freq: 1600 + i * 120, q: 2, vol: 0.05 });
        voice({ t, f0: 620 - i * 20, f1: 480, dur: 0.04, vol: 0.04, type: "triangle" });
      });
    },
    /** Lid pops off: latch, pop, boing, sparkle, then the animal's call and a ding. */
    open(name) {
      noise({ dur: 0.03, freq: 3000, q: 1, vol: 0.07 });
      voice({ f0: 220, f1: 760, dur: 0.12, vol: 0.12 });
      voice({ t: 0.06, f0: 260, f1: 520, dur: 0.35, vol: 0.07, vib: 40, vibHz: 14 });
      sparkle(0.12);
      if (CALLS[name]) after(0.3, CALLS[name]);
      voice({ t: 0.75, f0: 1318, f1: 1330, dur: 0.3, vol: 0.05 });
    },
    close() {
      noise({ dur: 0.06, freq: 400, q: 0.8, vol: 0.1, type: "lowpass" });
      voice({ f0: 180, f1: 80, dur: 0.12, vol: 0.1 });
    },
    start() {
      voice({ f0: 300, f1: 900, dur: 0.1, vol: 0.12 });
      voice({ t: 0.1, f0: 900, f1: 1200, dur: 0.12, vol: 0.08 });
    },
    end() {
      [523, 659, 784, 1047].forEach((f, i) =>
        voice({ t: i * 0.13, f0: f, f1: f, dur: i === 3 ? 0.5 : 0.2, type: "triangle", vol: 0.09 }),
      );
    },
    /** Calibration: an animal pops up and calls. */
    peekIn(name) {
      voice({ f0: 300, f1: 900, dur: 0.1, vol: 0.1 });
      if (CALLS[name]) after(0.12, CALLS[name]);
    },
    /** Calibration: a twinkle while recording, to hold attention without moving the target. */
    twinkle() {
      voice({ f0: 1760, f1: 1780, dur: 0.18, vol: 0.035 });
      voice({ t: 0.12, f0: 2093, f1: 2110, dur: 0.22, vol: 0.03 });
    },
    peekOut() {
      voice({ f0: 900, f1: 400, dur: 0.12, vol: 0.06 });
      sparkle(0.04);
    },
    /** A tone that rises while gaze dwell builds on the cued box. `p` runs from 0 to 1. */
    hover(p) {
      if (!ready()) {
        sound.stopHover();
        return;
      }
      if (p > 0.03) {
        if (!hov) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "triangle";
          g.gain.value = 0;
          o.connect(g).connect(master);
          o.start();
          hov = { o, g };
        }
        hov.o.frequency.setTargetAtTime(330 + 520 * p, ctx.currentTime, 0.03);
        hov.g.gain.setTargetAtTime(0.012 + 0.04 * p, ctx.currentTime, 0.03);
      } else {
        sound.stopHover();
      }
    },
    stopHover() {
      if (!hov || !ctx) {
        hov = null;
        return;
      }
      try {
        hov.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        hov.o.stop(ctx.currentTime + 0.2);
      } catch (e) {}
      hov = null;
    },
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);

  window.WIB = window.WIB || {};
  window.WIB.sound = sound;
})();
