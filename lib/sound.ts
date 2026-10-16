// Table sounds, synthesised with the Web Audio API: no audio files to load. Browser-only.

export type SoundName = "chip" | "win" | "nudge" | "turn";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Browsers only let audio start after a tap. Call once at startup: the context unlocks on the
 * first pointer or key press.
 */
export function unlockAudioOnFirstGesture(): () => void {
  if (typeof window === "undefined") return () => {};
  const stop = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  const unlock = () => {
    void audio()?.resume();
    stop();
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return stop;
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** One clay-chip click: a burst of filtered noise with a fast decay. */
function click(ac: AudioContext, at: number, gain: number, freq: number) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq;
  band.Q.value = 3;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  src.connect(band).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + 0.05);
}

function tone(ac: AudioContext, at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  return osc;
}

export function playSound(name: SoundName) {
  const ac = audio();
  if (!ac || ac.state !== "running") return;
  const t = ac.currentTime + 0.01;
  switch (name) {
    case "chip":
      // Two chips clacking onto the felt.
      click(ac, t, 0.5, 3200);
      click(ac, t + 0.055, 0.35, 2600);
      break;
    case "win":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, t + i * 0.09, f, 0.35, 0.12, "triangle"));
      for (let i = 0; i < 5; i++) click(ac, t + 0.35 + i * 0.05, 0.3, 2800 + i * 150);
      break;
    case "nudge": {
      // A cartoon "boing".
      const osc = tone(ac, t, 260, 0.45, 0.18, "sine");
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.42);
      break;
    }
    case "turn":
      tone(ac, t, 880, 0.18, 0.1);
      tone(ac, t + 0.14, 1318.5, 0.28, 0.1);
      break;
  }
}

/** Buzz the phone, where supported (not iOS Safari). */
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: the sound and the on-screen cue are enough.
  }
}
