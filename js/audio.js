/*
 * Tiny synthesized sound effects using the Web Audio API.
 * No audio files needed.
 */
const Sfx = (() => {
  let ctx = null;
  let muted = false;

  try { muted = localStorage.getItem("jeme-muted") === "1"; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, to = null, dur = 0.12, type = "square", vol = 0.12, delay = 0 }) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock: ensure,
    flap() { tone({ freq: 520, to: 780, dur: 0.08, type: "triangle", vol: 0.15 }); },
    score() {
      tone({ freq: 880, dur: 0.07, type: "square", vol: 0.08 });
      tone({ freq: 1320, dur: 0.1, type: "square", vol: 0.08, delay: 0.07 });
    },
    hit() { tone({ freq: 220, to: 60, dur: 0.35, type: "sawtooth", vol: 0.18 }); },
    fall() { tone({ freq: 600, to: 120, dur: 0.5, type: "triangle", vol: 0.1, delay: 0.15 }); },
    best() {
      [660, 880, 1100, 1320].forEach((f, i) =>
        tone({ freq: f, dur: 0.12, type: "triangle", vol: 0.1, delay: i * 0.09 })
      );
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem("jeme-muted", muted ? "1" : "0"); } catch (e) {}
      return muted;
    },
    get muted() { return muted; },
  };
})();
