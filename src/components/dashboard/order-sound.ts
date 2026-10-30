// Loud new-order alert, synthesized (no audio file): a cash-register "ka-ching" followed by a
// rising three-note chime, about 2.5 s, run through a limiter so it plays at full volume.

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let out: AudioNode | null = null;

function context(): Ctx | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
    // Limiter + makeup gain: as loud as possible without distortion.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 1.2;
    comp.connect(master);
    master.connect(ctx.destination);
    out = comp;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Call from a tap (e.g. "Turn on sound"): creates/resumes the one shared audio context so later
 * alerts can play without a tap (iOS keeps contexts created outside a gesture suspended), and asks
 * iOS to play through the silent switch where supported.
 */
export function unlockOrderSound() {
  try {
    (navigator as Navigator & { audioSession?: { type: string } }).audioSession && ((navigator as Navigator & { audioSession: { type: string } }).audioSession.type = "playback");
  } catch {}
  const c = context();
  void c?.resume();
}

function tone(c: Ctx, at: number, freq: number, dur: number, peak: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function click(c: Ctx, at: number) {
  const len = Math.floor(c.sampleRate * 0.05);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = 1.4;
  src.connect(bp);
  bp.connect(g);
  g.connect(out!);
  src.start(at);
}

// Bright bell strike: a few slightly inharmonic partials with a long decay.
function bell(c: Ctx, at: number, base: number, dur: number) {
  [
    [1, 0.9],
    [2.0, 0.5],
    [2.76, 0.35],
    [5.4, 0.18],
  ].forEach(([ratio, peak]) => tone(c, at, base * ratio, dur * (1.15 - ratio * 0.08), peak));
}

/** Plays the alert once (~2.5 s). Resolves false if the phone hasn't allowed sound yet (needs a tap). */
export async function playOrderSound(): Promise<boolean> {
  const c = context();
  if (!c || !out) return false;
  if (c.state !== "running") {
    // Resuming outside a tap only works once the page has been unlocked; don't wait forever.
    await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
    // TS narrowed `state` before the await; read it fresh.
    if ((c.state as AudioContextState) !== "running") return false;
  }
  schedule(c);
  return true;
}

function schedule(c: Ctx) {
  const t = c.currentTime + 0.05;
  // "ka-ching"
  click(c, t);
  bell(c, t + 0.06, 1568, 0.9); // G6
  click(c, t + 0.32);
  bell(c, t + 0.38, 2093, 1.2); // C7
  // rising chime: E6 → G#6 → B6, then a held E7
  tone(c, t + 1.0, 1319, 0.35, 0.8, "triangle");
  tone(c, t + 1.22, 1661, 0.35, 0.8, "triangle");
  tone(c, t + 1.44, 1976, 0.35, 0.8, "triangle");
  tone(c, t + 1.66, 2637, 0.85, 0.9, "triangle");
  tone(c, t + 1.66, 1319, 0.85, 0.5);
}
