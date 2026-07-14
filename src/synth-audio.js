// Procedural, file-free audio bank.
//
// Renders every sound the game needs at boot with OfflineAudioContext, encodes
// each to a PCM16 WAV blob, and hands the resulting <key -> objectURL> map to
// the unchanged AudioBank (the same shape AudioBank.fromArchive produces). SFX
// are retro one-shots; the low-life countdown (countdown1..10) is spoken by a
// small formant (source-filter) speech synth so it reads as the original's
// robotic "female computer" voice on every device, with zero shipped files.

import { AudioBank } from './audio.js';

const SR = 44100;

// ---- AudioBuffer -> PCM16 WAV Blob (self-contained, no deps) ----
function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, len = buffer.length, bytes = 44 + len * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, SR, true); view.setUint32(28, SR * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, len * ch * 2, true);
  let off = 44;
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) { const s = Math.max(-1, Math.min(1, data[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([view], { type: 'audio/wav' });
}

async function render(seconds, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  build(ctx);
  return URL.createObjectURL(encodeWav(await ctx.startRendering()));
}

// ---- small node helpers ----
function whiteNoise(ctx, dur) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(SR * dur)), SR), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function sweep(ctx, type, f0, f1, t0, t1) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t1);
  return o;
}
function ampEnv(ctx, peak, t0, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  g.gain.setValueAtTime(0, t0 + dur + 0.004);
  return g;
}

// ---- retro SFX ----
function sfxMenu(ctx) { const o = sweep(ctx, 'sine', 680, 760, 0, 0.05), g = ampEnv(ctx, 0.5, 0, 0.005, 0.07); o.connect(g).connect(ctx.destination); o.start(0); o.stop(0.09); }
function sfxBlaster(ctx) { const o = sweep(ctx, 'square', 900, 240, 0, 0.12), g = ampEnv(ctx, 0.5, 0, 0.004, 0.13); o.connect(g).connect(ctx.destination); o.start(0); o.stop(0.15); }
function sfxLaser(ctx) { const o = sweep(ctx, 'sawtooth', 1250, 180, 0, 0.18), g = ampEnv(ctx, 0.45, 0, 0.004, 0.18); o.connect(g).connect(ctx.destination); o.start(0); o.stop(0.2); }
function sfxLaserBeam(ctx) {
  const o = sweep(ctx, 'sine', 520, 470, 0, 0.3), g = ampEnv(ctx, 0.4, 0, 0.02, 0.3);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 32; const lg = ctx.createGain(); lg.gain.value = 55;
  lfo.connect(lg).connect(o.frequency); o.connect(g).connect(ctx.destination);
  o.start(0); o.stop(0.32); lfo.start(0); lfo.stop(0.32);
}
function sfxMissile(ctx) {
  const n = ctx.createBufferSource(); n.buffer = whiteNoise(ctx, 0.4);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(320, 0); f.frequency.exponentialRampToValueAtTime(2400, 0.34);
  const g = ampEnv(ctx, 0.32, 0, 0.02, 0.36); n.connect(f).connect(g).connect(ctx.destination);
  const o = sweep(ctx, 'sine', 150, 80, 0, 0.36), og = ampEnv(ctx, 0.28, 0, 0.02, 0.36); o.connect(og).connect(ctx.destination);
  n.start(0); n.stop(0.4); o.start(0); o.stop(0.4);
}
function sfxPhoton(ctx) { const o = sweep(ctx, 'triangle', 1650, 900, 0, 0.1), g = ampEnv(ctx, 0.4, 0, 0.003, 0.11); o.connect(g).connect(ctx.destination); o.start(0); o.stop(0.13); }
function sfxEnemy(ctx) {
  const n = ctx.createBufferSource(); n.buffer = whiteNoise(ctx, 0.08);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 820; f.Q.value = 1.2;
  const g = ampEnv(ctx, 0.6, 0, 0.002, 0.08); n.connect(f).connect(g).connect(ctx.destination);
  const o = sweep(ctx, 'sine', 430, 120, 0, 0.08), og = ampEnv(ctx, 0.4, 0, 0.002, 0.08); o.connect(og).connect(ctx.destination);
  n.start(0); n.stop(0.09); o.start(0); o.stop(0.09);
}
function sfxLife(ctx) {
  const o = sweep(ctx, 'sine', 84, 78, 0, 0.4), g = ctx.createGain();
  g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.6, 0.03); g.gain.exponentialRampToValueAtTime(0.001, 0.42);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 0.22;
  lfo.connect(lg).connect(g.gain); o.connect(g).connect(ctx.destination);
  o.start(0); o.stop(0.44); lfo.start(0); lfo.stop(0.44);
}
function sfxPowerDown(ctx) { const o = sweep(ctx, 'sawtooth', 760, 70, 0, 0.6), g = ampEnv(ctx, 0.4, 0, 0.01, 0.6); o.connect(g).connect(ctx.destination); o.start(0); o.stop(0.62); }

const SFX = { menu: [0.1, sfxMenu], blaster: [0.16, sfxBlaster], laser: [0.2, sfxLaser], laserbeam: [0.32, sfxLaserBeam], missile: [0.4, sfxMissile], photon: [0.13, sfxPhoton], enemy: [0.1, sfxEnemy], life: [0.44, sfxLife], powerdown: [0.62, sfxPowerDown] };

// ---- formant speech synth for the ten countdown words ----
const F0 = 206; // female glottal pitch, held ~monotone for the "computer" feel

// Voiced targets as [F1, F2, F3] (approx. female formants); vowels + approximants.
const VOICED = {
  ah: [780, 1300, 2600],  // ʌ  one
  uu: [360, 900, 2450],   // uː two
  ee: [350, 2350, 3000],  // iː three
  or: [520, 900, 2500],   // ɔː four
  ih: [450, 2000, 2700],  // ɪ  six / diphthong glide end
  eh: [660, 1900, 2650],  // ɛ  seven / ten / eight
  uh: [560, 1300, 2600],  // ə  schwa (seven)
  aa: [900, 1500, 2700],  // a  diphthong start (five / nine / eight-ish)
  w:  [360, 760, 2400],   // w  one
  r:  [420, 1120, 1600],  // r  three / four (low F3)
  n:  [280, 1300, 2500]   // n  nasal murmur
};
// Fricatives: [centerHz, Q, amp].
const FRIC = { th: [5200, 1.1, 0.05], f: [4200, 1.0, 0.055], v: [3400, 1.0, 0.05], s: [6600, 2.2, 0.11] };
// Stop bursts: [centerHz, Q, amp].
const BURST = { t: [3400, 1.4, 0.14], k: [1900, 1.4, 0.12] };

// Each word is a list of segments: {v} voiced (optional {to} for a diphthong
// glide), {fr} fricative (optional voiced:true), or {stop} plosive.
const WORDS = {
  1:  [{ v: 'w', dur: .06 }, { v: 'ah', dur: .16 }, { v: 'n', dur: .11 }],
  2:  [{ stop: 't', dur: .09 }, { v: 'uu', dur: .24 }],
  3:  [{ fr: 'th', dur: .11 }, { v: 'r', dur: .05 }, { v: 'ee', dur: .22 }],
  4:  [{ fr: 'f', dur: .11 }, { v: 'or', dur: .18 }, { v: 'r', dur: .08 }],
  5:  [{ fr: 'f', dur: .11 }, { v: 'aa', dur: .10, to: 'ih' }, { fr: 'v', dur: .09, voiced: true }],
  6:  [{ fr: 's', dur: .13 }, { v: 'ih', dur: .11 }, { stop: 'k', dur: .07 }, { fr: 's', dur: .13 }],
  7:  [{ fr: 's', dur: .11 }, { v: 'eh', dur: .10 }, { fr: 'v', dur: .06, voiced: true }, { v: 'uh', dur: .05 }, { v: 'n', dur: .09 }],
  8:  [{ v: 'eh', dur: .12, to: 'ih' }, { stop: 't', dur: .09 }],
  9:  [{ v: 'n', dur: .08 }, { v: 'aa', dur: .11, to: 'ih' }, { v: 'n', dur: .11 }],
  10: [{ stop: 't', dur: .09 }, { v: 'eh', dur: .14 }, { v: 'n', dur: .10 }]
};

function buildWord(ctx, segs) {
  const master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);

  // Voiced source: sawtooth glottis through three parallel bandpass formants.
  const glo = ctx.createOscillator(); glo.type = 'sawtooth'; glo.frequency.setValueAtTime(F0, 0);
  const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), f3 = ctx.createBiquadFilter();
  for (const [flt, q] of [[f1, 5], [f2, 9], [f3, 12]]) { flt.type = 'bandpass'; flt.Q.value = q; }
  const vsum = ctx.createGain(); vsum.gain.value = 1.7; // makeup for bandpass loss
  const vgain = ctx.createGain(); vgain.gain.setValueAtTime(0, 0);
  glo.connect(f1); glo.connect(f2); glo.connect(f3);
  f1.connect(vsum); f2.connect(vsum); f3.connect(vsum); vsum.connect(vgain).connect(master);

  // Noise source for fricatives + stop bursts.
  let total = 0.06; for (const s of segs) total += s.dur;
  const nsrc = ctx.createBufferSource(); nsrc.buffer = whiteNoise(ctx, total + 0.1);
  const nfil = ctx.createBiquadFilter(); nfil.type = 'bandpass'; nfil.Q.value = 1.2;
  const ngain = ctx.createGain(); ngain.gain.setValueAtTime(0, 0);
  nsrc.connect(nfil).connect(ngain).connect(master);

  const setF = (time, v, ramp) => {
    for (const [flt, val] of [[f1, v[0]], [f2, v[1]], [f3, v[2]]])
      ramp ? flt.frequency.linearRampToValueAtTime(val, time) : flt.frequency.setValueAtTime(val, time);
  };

  let t = 0.03;
  for (const s of segs) {
    if (s.v !== undefined) {
      const from = VOICED[s.v], to = s.to ? VOICED[s.to] : from;
      setF(t, from, false);
      ngain.gain.linearRampToValueAtTime(0, t + 0.01);
      vgain.gain.linearRampToValueAtTime(0.9, t + 0.02);
      setF(t + s.dur, to, true);
      vgain.gain.linearRampToValueAtTime(0.9, t + s.dur - 0.01);
    } else if (s.fr !== undefined) {
      const [cf, q, amp] = FRIC[s.fr];
      nfil.frequency.setValueAtTime(cf, t); nfil.Q.setValueAtTime(q, t);
      vgain.gain.linearRampToValueAtTime(s.voiced ? 0.4 : 0, t + 0.02);
      ngain.gain.linearRampToValueAtTime(amp, t + 0.02);
      ngain.gain.linearRampToValueAtTime(amp, t + s.dur - 0.01);
    } else { // stop: closure then burst
      const closure = Math.min(0.05, s.dur * 0.55), bt = t + closure, [cf, q, amp] = BURST[s.stop];
      vgain.gain.linearRampToValueAtTime(0, t + 0.008);
      ngain.gain.linearRampToValueAtTime(0, t + 0.008);
      nfil.frequency.setValueAtTime(cf, bt); nfil.Q.setValueAtTime(q, bt);
      ngain.gain.setValueAtTime(0, bt); ngain.gain.linearRampToValueAtTime(amp, bt + 0.006);
      ngain.gain.linearRampToValueAtTime(0, bt + Math.max(0.02, s.dur - closure));
    }
    t += s.dur;
  }
  vgain.gain.linearRampToValueAtTime(0, t + 0.03);
  ngain.gain.linearRampToValueAtTime(0, t + 0.03);
  glo.start(0); glo.stop(t + 0.08); nsrc.start(0); nsrc.stop(t + 0.08);
}

export async function createSynthAudioBank() {
  if (typeof OfflineAudioContext === 'undefined') return new AudioBank(new Map()); // silent fallback
  const urls = new Map(), jobs = [];
  for (const [key, [dur, build]] of Object.entries(SFX)) jobs.push(render(dur, build).then(u => urls.set(key, u)));
  for (let i = 1; i <= 10; i++) {
    const segs = WORDS[i], dur = 0.15 + segs.reduce((a, s) => a + s.dur, 0);
    jobs.push(render(dur, ctx => buildWord(ctx, segs)).then(u => urls.set('countdown' + i, u)));
  }
  await Promise.all(jobs);
  return new AudioBank(urls);
}
