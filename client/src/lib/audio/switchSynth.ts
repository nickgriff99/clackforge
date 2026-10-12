import { isMuted } from "./mute"
import type { SwitchFeel } from "./switchFeel"

/**
 * Procedural switch-sound synthesis. No real audio assets exist or are
 * sourced in this project - there's no sample library to license or
 * attribute. Every switch sound is synthesized live via the Web Audio
 * API: a cached white-noise `AudioBuffer` reshaped per press by a
 * `BiquadFilterNode` + `GainNode` envelope. No `OscillatorNode` was
 * needed - filtered noise alone produces a convincingly percussive
 * "click" transient and keeps all three feels built from one shared
 * building block.
 *
 * Design call - cache the noise, not the result: the raw white-noise
 * `AudioBuffer` (~0.25s of random samples) is generated once per
 * `AudioContext` and cached; the shaping graph (filter + gain + pitch) is
 * built fresh on every `playSwitchSound()` call. A small set of fully
 * pre-rendered-and-cached buffers per feel was considered and rejected:
 * the slight random pitch variation on every press (so it doesn't sound
 * robotic) needs a fresh `playbackRate`/`detune` roll regardless -
 * pre-baking a buffer per feel would either lose that variation (if
 * rendered once) or require re-rendering on every press (no cheaper than
 * shaping a cached source live). Live-shaping a cached noise source is
 * the lightest-weight option that still gets the variation.
 *
 * Three feels, built to be audibly distinct:
 * - linear: one smooth noise burst, lowpass-filtered (duller, deeper),
 *   soft attack/decay, no secondary transient - nothing "bumps".
 * - tactile: a brighter/shorter primary burst (bandpass) plus a quieter
 *   secondary "bump" burst ~18ms later at a higher center frequency - the
 *   audible stand-in for the tactile bump felt partway through the stroke.
 * - clicky: one sharp, bright, very-short transient (highpass, fast
 *   attack, short decay, higher peak gain, no low end) - the "crack" of a
 *   click bar.
 */

interface BurstShape {
  filterType: BiquadFilterType
  /** Hz, before the per-press `playbackRate` pitch shift is applied. */
  filterFreq: number
  filterQ: number
  /** Seconds. */
  attack: number
  /** Seconds. */
  decay: number
  /** Linear gain, 0..1. */
  peakGain: number
}

interface FeelProfile {
  primary: BurstShape
  /** Tactile-only secondary transient, fired `delay` seconds after the primary. */
  bump?: BurstShape & { delay: number }
}

const FEEL_PROFILES: Record<SwitchFeel, FeelProfile> = {
  linear: {
    primary: { filterType: "lowpass", filterFreq: 1600, filterQ: 0.6, attack: 0.004, decay: 0.055, peakGain: 0.5 },
  },
  tactile: {
    primary: { filterType: "bandpass", filterFreq: 2000, filterQ: 1.0, attack: 0.003, decay: 0.03, peakGain: 0.5 },
    bump: {
      filterType: "bandpass",
      filterFreq: 3400,
      filterQ: 2.2,
      attack: 0.002,
      decay: 0.018,
      peakGain: 0.32,
      delay: 0.018,
    },
  },
  clicky: {
    primary: { filterType: "highpass", filterFreq: 3200, filterQ: 0.8, attack: 0.001, decay: 0.022, peakGain: 0.6 },
  },
}

/** +/- this fraction applied to `playbackRate` on every press - the spec's "slight random pitch variation". */
const PITCH_VARIATION_FRACTION = 0.04
/** +/- cents applied to `detune` on every press, layered on top of the playbackRate shift so repeats vary on two independent axes, not one. */
const DETUNE_VARIATION_CENTS = 30
const NOISE_BUFFER_DURATION_SECONDS = 0.25

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let cachedNoiseBuffer: AudioBuffer | null = null

function resolveAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null
  const withWebkit = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? withWebkit.webkitAudioContext ?? null
}

/** Lazily creates the singleton `AudioContext` - never on module load, only the first time a sound actually needs to play (which is always from a real user gesture, see `playSwitchSound`). Returns `null` if the Web Audio API is unavailable rather than throwing, so a missing/old-browser API degrades to "no sound", not a crash. */
function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const Ctor = resolveAudioContextCtor()
  if (!Ctor) return null
  audioContext = new Ctor()
  return audioContext
}

function getMasterGain(ctx: AudioContext): GainNode {
  if (masterGain) return masterGain
  masterGain = ctx.createGain()
  masterGain.gain.value = 0.8 // headroom so the tactile bump layering two bursts never clips
  masterGain.connect(ctx.destination)
  return masterGain
}

/** Cached per `AudioContext` (sample-rate-checked, not just existence-checked - a context recreated at a different sample rate, which doesn't happen in practice here but is cheap to guard, gets a fresh buffer instead of a mismatched one). */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) return cachedNoiseBuffer
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_DURATION_SECONDS))
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1
  cachedNoiseBuffer = buffer
  return buffer
}

function scheduleEnvelope(gain: GainNode, startTime: number, shape: BurstShape): void {
  const param = gain.gain
  param.cancelScheduledValues(startTime)
  // exponentialRampToValueAtTime can't target/leave exactly 0 - floor at a
  // near-silent value instead, standard Web Audio envelope idiom.
  param.setValueAtTime(0.0001, startTime)
  param.exponentialRampToValueAtTime(shape.peakGain, startTime + shape.attack)
  param.exponentialRampToValueAtTime(0.0001, startTime + shape.attack + shape.decay)
}

function playBurst(ctx: AudioContext, startTime: number, shape: BurstShape, playbackRate: number, detuneCents: number): void {
  const source = ctx.createBufferSource()
  source.buffer = getNoiseBuffer(ctx)
  source.playbackRate.value = playbackRate
  source.detune.value = detuneCents

  const filter = ctx.createBiquadFilter()
  filter.type = shape.filterType
  filter.frequency.value = shape.filterFreq * playbackRate
  filter.Q.value = shape.filterQ

  const gain = ctx.createGain()
  scheduleEnvelope(gain, startTime, shape)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(getMasterGain(ctx))

  source.start(startTime)
  source.stop(startTime + shape.attack + shape.decay + 0.05)
}

/**
 * Plays the given switch feel's synthesized click. No-ops silently (never
 * throws) if: the global mute toggle is on (`./mute.ts`), or the Web Audio
 * API is unavailable.
 *
 * Never autoplays: this function schedules sound synchronously, starting
 * at `ctx.currentTime` - nothing in this module sets a timer, runs on
 * mount, or fires on a store/selection change. The only caller in this
 * codebase is `SwitchSoundTest.tsx`'s `onChange` handler, which only fires
 * from a real keystroke. Browsers independently block audio before a user
 * gesture anyway, but this is about intent, not just relying on that
 * enforcement.
 */
export function playSwitchSound(feel: SwitchFeel): void {
  if (isMuted()) return
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === "suspended") void ctx.resume()

  const profile = FEEL_PROFILES[feel]
  const playbackRate = 1 + (Math.random() * 2 - 1) * PITCH_VARIATION_FRACTION
  const detuneCents = (Math.random() * 2 - 1) * DETUNE_VARIATION_CENTS
  const now = ctx.currentTime

  playBurst(ctx, now, profile.primary, playbackRate, detuneCents)
  if (profile.bump) {
    playBurst(ctx, now + profile.bump.delay, profile.bump, playbackRate, detuneCents)
  }
}
