import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * This test environment is plain Node (see `vitest.config.ts` - no jsdom
 * in `/client`), so there's no real `AudioContext`/Web Audio implementation
 * available at all. Rather than skip verifying the synthesis engine, this
 * suite provides a minimal fake implementing exactly the subset of the Web
 * Audio API `switchSynth.ts` actually calls, and asserts on the graph it
 * builds (node types, connections, scheduled gain values, playbackRate/detune
 * ranges) - real verification of the construction logic, not just "it
 * didn't throw". Actual audible sound-quality still needs a human/browser
 * pass - this suite can't hear anything, but it can prove the graph is
 * wired the way the doc comments in `switchSynth.ts` claim.
 */

class FakeAudioParam {
  value = 0
  readonly scheduled: Array<{ type: "setValueAtTime" | "exponentialRampToValueAtTime"; value: number; time: number }> = []

  setValueAtTime(value: number, time: number) {
    this.scheduled.push({ type: "setValueAtTime", value, time })
    this.value = value
    return this
  }

  exponentialRampToValueAtTime(value: number, time: number) {
    this.scheduled.push({ type: "exponentialRampToValueAtTime", value, time })
    this.value = value
    return this
  }

  cancelScheduledValues() {
    this.scheduled.length = 0
    return this
  }
}

class FakeAudioNode {
  readonly connectedTo: FakeAudioNode[] = []
  connect(dest: FakeAudioNode) {
    this.connectedTo.push(dest)
    return dest
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam()
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "lowpass"
  readonly frequency = new FakeAudioParam()
  readonly Q = new FakeAudioParam()
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null
  readonly playbackRate = new FakeAudioParam()
  readonly detune = new FakeAudioParam()
  started: number | null = null
  stopped: number | null = null
  start(time: number) {
    this.started = time
  }
  stop(time: number) {
    this.stopped = time
  }
}

class FakeAudioBuffer {
  numberOfChannels: number
  length: number
  sampleRate: number
  private channelData: Float32Array

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels
    this.length = length
    this.sampleRate = sampleRate
    this.channelData = new Float32Array(length)
  }

  getChannelData() {
    return this.channelData
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  sampleRate = 44100
  currentTime = 0
  state: "running" | "suspended" = "running"
  destination = new FakeAudioNode()
  resumeCalls = 0
  createdSources: FakeAudioBufferSourceNode[] = []
  createdFilters: FakeBiquadFilterNode[] = []
  createdGains: FakeGainNode[] = []
  createdBuffers: FakeAudioBuffer[] = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createBufferSource() {
    const node = new FakeAudioBufferSourceNode()
    this.createdSources.push(node)
    return node
  }

  createBiquadFilter() {
    const node = new FakeBiquadFilterNode()
    this.createdFilters.push(node)
    return node
  }

  createGain() {
    const node = new FakeGainNode()
    this.createdGains.push(node)
    return node
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate)
    this.createdBuffers.push(buffer)
    return buffer
  }

  resume() {
    this.resumeCalls += 1
    this.state = "running"
    return Promise.resolve()
  }
}

/** `mute.ts` reads/writes `window.localStorage` on import and on every `setMuted()` - the fake `window` below needs a working one, or that module throws on load before the thing under test ever runs. */
function createFakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  } as Storage
}

async function loadFreshSynth(options: { withAudioContext?: boolean } = {}) {
  const { withAudioContext = true } = options
  vi.resetModules()
  FakeAudioContext.instances.length = 0
  vi.stubGlobal("window", {
    localStorage: createFakeLocalStorage(),
    ...(withAudioContext ? { AudioContext: FakeAudioContext } : {}),
  })
  const synth = await import("./switchSynth")
  const mute = await import("./mute")
  return { synth, mute }
}

describe("playSwitchSound", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("never plays when the global mute toggle is on", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(true)
    synth.playSwitchSound("linear")
    expect(FakeAudioContext.instances).toHaveLength(0) // no context even created - muted short-circuits before any Web Audio call
  })

  it("builds a source -> filter -> gain -> destination graph for a linear press", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)
    synth.playSwitchSound("linear")

    const ctx = FakeAudioContext.instances[0]
    expect(ctx).toBeDefined()
    expect(ctx!.createdSources).toHaveLength(1)
    expect(ctx!.createdFilters).toHaveLength(1)
    // One shaping gain for the burst + one master gain the burst routes
    // through on its way to `destination`.
    expect(ctx!.createdGains).toHaveLength(2)

    const [source] = ctx!.createdSources
    const [filter] = ctx!.createdFilters
    expect(source!.connectedTo).toContain(filter)
    expect(filter!.type).toBe("lowpass")

    const burstGain = filter!.connectedTo[0] as unknown as FakeGainNode
    expect(burstGain).toBeDefined()
    const masterGain = burstGain.connectedTo[0] as unknown as FakeGainNode
    expect(masterGain.connectedTo).toContain(ctx!.destination)

    // Envelope actually ramps up then back down near-silent, not a flat gain.
    const values = burstGain.gain.scheduled.map((s) => s.value)
    expect(values[0]).toBeCloseTo(0.0001, 4)
    expect(values[1]).toBeGreaterThan(values[0]!)
    expect(values[2]).toBeLessThan(values[1]!)

    expect(source!.started).toBe(ctx!.currentTime)
  })

  it("plays a second 'bump' burst for tactile but not for linear/clicky", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)

    synth.playSwitchSound("tactile")
    expect(FakeAudioContext.instances[0]!.createdSources).toHaveLength(2)

    const { synth: synth2, mute: mute2 } = await loadFreshSynth()
    mute2.setMuted(false)
    synth2.playSwitchSound("clicky")
    expect(FakeAudioContext.instances[0]!.createdSources).toHaveLength(1)
  })

  it("uses a sharper highpass filter for clicky than the lowpass used for linear (audibly distinct feels)", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)
    synth.playSwitchSound("clicky")
    expect(FakeAudioContext.instances[0]!.createdFilters[0]!.type).toBe("highpass")
  })

  it("randomizes playbackRate (pitch) within a small range on each press, not identically every time", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)

    // One singleton AudioContext across all 10 presses (see the dedicated
    // singleton test below) - read each press's source off the END of
    // `createdSources` as it grows, not by indexing `instances`.
    const rates = new Set<number>()
    for (let i = 0; i < 10; i += 1) {
      synth.playSwitchSound("linear")
      const ctx = FakeAudioContext.instances[0]!
      const rate = ctx.createdSources[ctx.createdSources.length - 1]!.playbackRate.value
      expect(rate).toBeGreaterThan(0.9)
      expect(rate).toBeLessThan(1.1)
      rates.add(rate)
    }
    // Astronomically unlikely all 10 random draws collide - proves the
    // "slight random pitch variation" the spec asks for is real, not a
    // fixed constant masquerading as random.
    expect(rates.size).toBeGreaterThan(1)
  })

  it("caches the noise buffer across presses on the same context instead of regenerating it each time", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)
    synth.playSwitchSound("linear")
    synth.playSwitchSound("linear")
    const ctx = FakeAudioContext.instances[0]!
    expect(ctx.createdBuffers).toHaveLength(1) // one buffer, reused by both bursts' BufferSourceNodes
    expect(ctx.createdSources).toHaveLength(2)
    expect(ctx.createdSources[0]!.buffer).toBe(ctx.createdSources[1]!.buffer)
  })

  it("reuses a single AudioContext across multiple plays (singleton, not one-per-press)", async () => {
    const { synth, mute } = await loadFreshSynth()
    mute.setMuted(false)
    synth.playSwitchSound("linear")
    synth.playSwitchSound("tactile")
    synth.playSwitchSound("clicky")
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it("does not throw when the Web Audio API is unavailable", async () => {
    const { synth, mute } = await loadFreshSynth({ withAudioContext: false })
    mute.setMuted(false)
    expect(() => synth.playSwitchSound("linear")).not.toThrow()
    expect(FakeAudioContext.instances).toHaveLength(0)
  })
})
