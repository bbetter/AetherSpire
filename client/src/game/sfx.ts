// ── Synthesized Sound Effects (Web Audio API) ──

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let volume = 0.4;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

export function setSfxVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
}

export function setSfxMuted(m: boolean) {
  muted = m;
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
}

export function isSfxMuted() {
  return muted;
}

// ── Helpers ──

function osc(
  type: OscillatorType,
  freq: number,
  startTime: number,
  duration: number,
  gainVal: number,
  dest: AudioNode,
) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gainVal, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  o.connect(g);
  g.connect(dest);
  o.start(startTime);
  o.stop(startTime + duration);
}

function noise(startTime: number, duration: number, gainVal: number, dest: AudioNode, filterFreq = 3000) {
  const c = getCtx();
  const bufferSize = Math.ceil(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 1.5;

  const g = c.createGain();
  g.gain.setValueAtTime(gainVal, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(startTime);
  src.stop(startTime + duration);
}

// ── Sound Effects ──

/** Short soft footstep — filtered noise tick */
export function playFootstep() {
  if (muted) return;
  const t = getCtx().currentTime;
  const m = getMaster();
  // Alternate pitch slightly for variation
  const freq = 800 + Math.random() * 600;
  noise(t, 0.06, 0.15, m, freq);
}

/** Rising two-tone chime for tool pickup */
export function playPickup() {
  if (muted) return;
  const t = getCtx().currentTime;
  const m = getMaster();
  osc("sine", 523, t, 0.1, 0.25, m);         // C5
  osc("sine", 784, t + 0.08, 0.15, 0.2, m);  // G5
  osc("triangle", 1047, t + 0.14, 0.12, 0.1, m); // C6 shimmer
}

/** Low metallic clank for manual fix start */
export function playFixStart() {
  if (muted) return;
  const t = getCtx().currentTime;
  const m = getMaster();
  noise(t, 0.08, 0.3, m, 400);             // low thud
  osc("sine", 220, t, 0.12, 0.2, m);       // A3 undertone
  osc("square", 330, t + 0.03, 0.06, 0.08, m); // metallic overtone
}

/** Mechanical whir for tool-based fix start */
export function playToolFixStart() {
  if (muted) return;
  const c = getCtx();
  const t = c.currentTime;
  const m = getMaster();

  // Sawtooth frequency sweep up (mechanical whir)
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(600, t + 0.2);
  g.gain.setValueAtTime(0.12, t);
  g.gain.setValueAtTime(0.12, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.3);

  // Click at start
  noise(t, 0.04, 0.15, m, 1200);
}

/** Ascending 3-note success arpeggio */
export function playFixComplete() {
  if (muted) return;
  const t = getCtx().currentTime;
  const m = getMaster();
  osc("sine", 523, t, 0.15, 0.2, m);          // C5
  osc("sine", 659, t + 0.1, 0.15, 0.2, m);    // E5
  osc("sine", 784, t + 0.2, 0.25, 0.25, m);   // G5
  osc("triangle", 1047, t + 0.3, 0.3, 0.12, m); // C6 shimmer
}

/** Metallic hatch clang for layer transition */
export function playHatchTransition() {
  if (muted) return;
  const c = getCtx();
  const t = c.currentTime;
  const m = getMaster();

  // Heavy metallic clang
  noise(t, 0.12, 0.35, m, 600);
  osc("sine", 165, t, 0.18, 0.25, m);        // Low resonance
  osc("square", 440, t + 0.01, 0.05, 0.12, m); // Sharp metallic hit
  osc("triangle", 220, t + 0.04, 0.2, 0.1, m); // Ringing decay

  // Ladder creak (delayed noise burst)
  noise(t + 0.15, 0.08, 0.1, m, 1800);
}

/** Sharp descending alert ping for new issue */
export function playIssueAlert() {
  if (muted) return;
  const c = getCtx();
  const t = c.currentTime;
  const m = getMaster();

  // Descending tone
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, t);           // A5
  o.frequency.exponentialRampToValueAtTime(440, t + 0.2); // A4
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.3);

  // Second ping
  osc("sine", 660, t + 0.15, 0.2, 0.12, m);
}
