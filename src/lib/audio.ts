// Instrumentos com amostras reais (tonejs-instruments, CC-BY 3.0) + metrónomo.
import * as Tone from 'tone'
import type { Instrument } from './music'

type SamplerKind = 'violin' | 'saxophone' | 'piano'

const SAMPLE_NOTES: Record<SamplerKind, string[]> = {
  violin: ['G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6', 'E6', 'G6', 'A6', 'C7'],
  saxophone: [
    'Cs3', 'D3', 'Ds3', 'E3', 'F3', 'Fs3', 'G3', 'Gs3', 'As3', 'B3', 'C4', 'Cs4', 'D4', 'Ds4', 'E4', 'F4',
    'Fs4', 'G4', 'Gs4', 'A4', 'As4', 'B4', 'C5', 'Cs5', 'D5', 'Ds5', 'E5', 'F5', 'Fs5', 'G5', 'Gs5', 'A5',
  ],
  piano: ['A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C2', 'Ds2', 'Fs2'],
}

const cache = new Map<SamplerKind, Promise<Tone.Sampler>>()

function loadSampler(kind: SamplerKind): Promise<Tone.Sampler> {
  if (!cache.has(kind)) {
    const urls: Record<string, string> = {}
    for (const n of SAMPLE_NOTES[kind]) urls[n.replace('s', '#')] = `${n}.mp3`
    cache.set(
      kind,
      new Promise((resolve, reject) => {
        const s = new Tone.Sampler({
          urls,
          baseUrl: `/samples/${kind}/`,
          release: kind === 'piano' ? 1.2 : 0.35,
          onload: () => resolve(s),
          onerror: (e) => reject(e),
        })
      }),
    )
  }
  return cache.get(kind)!
}

export class AudioEngine {
  solo?: Tone.Sampler
  accomp?: Tone.Sampler
  soloGain = new Tone.Gain(0.9).toDestination()
  accompGain = new Tone.Gain(0.6).toDestination()
  clickGain = new Tone.Gain(0.5).toDestination()
  click = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } })

  constructor() {
    this.click.connect(this.clickGain)
  }

  async load(instrument: Instrument) {
    const [solo, accomp] = await Promise.all([
      loadSampler(instrument === 'violin' ? 'violin' : 'saxophone'),
      loadSampler('piano'),
    ])
    solo.disconnect()
    accomp.disconnect()
    solo.connect(this.soloGain)
    accomp.connect(this.accompGain)
    this.solo = solo
    this.accomp = accomp
  }

  static async unlock() {
    await Tone.start()
  }

  now() {
    return Tone.now()
  }

  playNote(midi: number, dur: number, time: number, isSolo: boolean, velocity = 0.8) {
    const s = isSolo ? this.solo : this.accomp
    if (!s) return
    const freq = Tone.Frequency(midi, 'midi').toFrequency()
    try {
      s.triggerAttackRelease(freq, Math.max(0.05, dur), time, velocity)
    } catch {
      /* nota fora do intervalo das amostras */
    }
  }

  playClick(time: number, accent: boolean) {
    this.click.triggerAttackRelease(accent ? 'C6' : 'G5', 0.03, time, accent ? 1 : 0.6)
  }

  setVolumes(v: { solo?: number; accomp?: number; click?: number }) {
    if (v.solo !== undefined) this.soloGain.gain.rampTo(v.solo, 0.05)
    if (v.accomp !== undefined) this.accompGain.gain.rampTo(v.accomp, 0.05)
    if (v.click !== undefined) this.clickGain.gain.rampTo(v.click, 0.05)
  }

  stopAll() {
    this.solo?.releaseAll()
    this.accomp?.releaseAll()
  }

  /** Toca uma nota isolada (pré-visualização ao clicar). */
  async preview(midi: number, isSolo = true) {
    await AudioEngine.unlock()
    this.playNote(midi, 0.8, Tone.now() + 0.01, isSolo)
  }
}
