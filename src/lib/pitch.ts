// Deteção de altura pelo microfone (pitchy / McLeod Pitch Method).
import { PitchDetector } from 'pitchy'
import { freqToMidiFloat } from './music'

export interface PitchReading {
  freq: number
  clarity: number
  midiFloat: number
  midi: number
  cents: number
  rms: number
}

export class MicPitch {
  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private stream?: MediaStream
  private detector?: PitchDetector<Float32Array<ArrayBuffer>>
  private buf?: Float32Array<ArrayBuffer>
  private raf = 0
  running = false

  async start(onReading: (r: PitchReading | null) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    src.connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    this.detector = PitchDetector.forFloat32Array(this.analyser.fftSize)
    this.detector.minVolumeDecibels = -45
    this.running = true
    const loop = () => {
      if (!this.running || !this.analyser || !this.buf || !this.detector || !this.ctx) return
      this.analyser.getFloatTimeDomainData(this.buf)
      let sum = 0
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
      const rms = Math.sqrt(sum / this.buf.length)
      const [freq, clarity] = this.detector.findPitch(this.buf, this.ctx.sampleRate)
      if (clarity > 0.88 && freq > 100 && freq < 3000 && rms > 0.008) {
        const mf = freqToMidiFloat(freq)
        const midi = Math.round(mf)
        onReading({ freq, clarity, midiFloat: mf, midi, cents: Math.round((mf - midi) * 100), rms })
      } else {
        onReading(null)
      }
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close()
    this.ctx = undefined
  }
}
