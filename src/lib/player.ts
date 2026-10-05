// Motor de reprodução sincronizado com o cursor do OpenSheetMusicDisplay.
import type { OpenSheetMusicDisplay, Note, VoiceEntry } from 'opensheetmusicdisplay'
import type { AudioEngine } from './audio'

export interface AudioEvent {
  t: number // posição em semibreves (tempo "desenrolado", com repetições)
  dur: number
  midi: number // altura real (concert)
  solo: boolean
}

export interface CursorStep {
  t: number
  measure: number // índice do compasso (0-based)
  /** notas esperadas do solista (altura real) neste passo */
  expected: number[]
  /** notas escritas do solista (para a dedilhação do sax) */
  written: number[]
  dur: number
}

export interface Timeline {
  events: AudioEvent[]
  steps: CursorStep[]
  clicks: { t: number; accent: boolean }[]
  end: number
  measureStarts: { measure: number; t: number }[]
  bpm: number
}

function noteDuration(n: Note): number {
  const tie = n.NoteTie
  if (tie && tie.StartNote === n) return tie.Notes.reduce((a, x) => a + x.Length.RealValue, 0)
  return n.Length.RealValue
}

function isTieContinuation(n: Note) {
  return !!n.NoteTie && n.NoteTie.StartNote !== n
}

export function buildTimeline(
  osmd: OpenSheetMusicDisplay,
  soloPart: number,
  chromatic: number[],
  fallbackBpm: number,
): Timeline {
  const sheet = osmd.Sheet
  const instruments = sheet.Instruments
  const instIndex = (ve: VoiceEntry) => instruments.indexOf(ve.ParentSourceStaffEntry.ParentStaff.ParentInstrument)

  // 1) eventos de áudio: iterador completo (inclui partes escondidas)
  const events: AudioEvent[] = []
  const it = sheet.MusicPartManager.getIterator()
  const measureStarts: { measure: number; t: number }[] = []
  let lastMeasure = -1
  let guard = 0
  while (!it.EndReached && guard++ < 200000) {
    const t = it.CurrentEnrolledTimestamp.RealValue
    if (it.CurrentMeasureIndex !== lastMeasure) {
      lastMeasure = it.CurrentMeasureIndex
      measureStarts.push({ measure: lastMeasure, t })
    }
    for (const ve of it.CurrentVoiceEntries) {
      const ii = instIndex(ve)
      const solo = ii === soloPart
      for (const n of ve.Notes) {
        if (n.isRest() || !n.Pitch || isTieContinuation(n)) continue
        const dur = ve.IsGrace ? 1 / 32 : noteDuration(n)
        events.push({ t, dur, midi: n.halfTone + 12 + (chromatic[ii] ?? 0), solo })
      }
    }
    it.moveToNext()
  }

  // 2) passos do cursor (só entradas visíveis — tem de bater certo com cursor.next())
  const steps: CursorStep[] = []
  const cursor = osmd.cursor
  cursor.reset()
  guard = 0
  while (!cursor.Iterator.EndReached && guard++ < 200000) {
    const ci = cursor.Iterator
    const expected: number[] = []
    const written: number[] = []
    let dur = Infinity
    for (const ve of ci.CurrentVoiceEntries) {
      if (instIndex(ve) !== soloPart) continue
      for (const n of ve.Notes) {
        if (n.isRest() || !n.Pitch) continue
        dur = Math.min(dur, noteDuration(n))
        if (isTieContinuation(n)) continue
        expected.push(n.halfTone + 12 + (chromatic[soloPart] ?? 0))
        written.push(n.halfTone + 12)
      }
    }
    steps.push({
      t: ci.CurrentEnrolledTimestamp.RealValue,
      measure: ci.CurrentMeasureIndex,
      expected,
      written,
      dur: isFinite(dur) ? dur : 0,
    })
    cursor.next()
  }
  cursor.reset()

  // 3) metrónomo
  const clicks: { t: number; accent: boolean }[] = []
  const end = Math.max(
    ...events.map((e) => e.t + e.dur),
    ...measureStarts.map((m) => m.t + sheet.SourceMeasures[m.measure].Duration.RealValue),
    0,
  )
  for (const ms of measureStarts) {
    const sm = sheet.SourceMeasures[ms.measure]
    const ts = sm.ActiveTimeSignature
    const beat = ts ? 1 / ts.Denominator : 1 / 4
    const len = sm.Duration.RealValue
    let i = 0
    for (let b = 0; b < len - 1e-6; b += beat) clicks.push({ t: ms.t + b, accent: i++ === 0 })
  }

  let bpm = fallbackBpm
  const sheetBpm = sheet.DefaultStartTempoInBpm || sheet.SourceMeasures[0]?.TempoInBPM
  if (sheetBpm && sheetBpm > 0) bpm = sheetBpm
  events.sort((a, b) => a.t - b.t)
  return { events, steps, clicks, end, measureStarts, bpm }
}

interface Anchor {
  time: number // tempo de áudio
  pos: number // posição em semibreves
}

export interface PlayerOptions {
  speed: number
  metronome: boolean
  muteSolo: boolean
  muteAccomp: boolean
}

export class Player {
  playing = false
  private anchors: Anchor[] = []
  scheduledUpTo = 0
  private timer = 0
  private raf = 0
  private eventIdx = 0
  private clickIdx = 0
  private currentStep = -1
  loop: { start: number; end: number } | null = null
  opts: PlayerOptions = { speed: 1, metronome: false, muteSolo: false, muteAccomp: false }

  onStep?: (i: number) => void
  onEnd?: () => void
  onCountIn?: (beatsLeft: number) => void

  engine: AudioEngine
  tl: Timeline

  constructor(engine: AudioEngine, tl: Timeline) {
    this.engine = engine
    this.tl = tl
  }

  /** segundos por semibreve */
  private get spw() {
    return 240 / (this.tl.bpm * this.opts.speed)
  }

  private anchorAt(time: number): Anchor {
    for (let i = this.anchors.length - 1; i >= 0; i--) if (this.anchors[i].time <= time) return this.anchors[i]
    return this.anchors[0]
  }

  private posAt(time: number) {
    const a = this.anchorAt(time)
    return a.pos + (time - a.time) / this.spw
  }

  stepIndexAt(pos: number) {
    const s = this.tl.steps
    let lo = 0
    let hi = s.length - 1
    let ans = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (s[mid].t <= pos + 1e-9) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return ans
  }

  private seekIndices(pos: number) {
    this.eventIdx = this.tl.events.findIndex((e) => e.t >= pos - 1e-9)
    if (this.eventIdx < 0) this.eventIdx = this.tl.events.length
    this.clickIdx = this.tl.clicks.findIndex((c) => c.t >= pos - 1e-9)
    if (this.clickIdx < 0) this.clickIdx = this.tl.clicks.length
    this.scheduledUpTo = pos
  }

  play(fromPos: number, countIn: boolean) {
    this.stop(false)
    this.playing = true
    const now = this.engine.now() + 0.08
    let start = now
    if (countIn) {
      // um compasso de contagem
      const firstMs = this.tl.measureStarts.find((m) => m.t >= fromPos - 1e-9) ?? this.tl.measureStarts[0]
      const beats = this.tl.clicks.filter((c) => c.t >= firstMs.t - 1e-9 && c.t < firstMs.t + 1).length
      const firstMeasureLen = (() => {
        const next = this.tl.measureStarts.find((m) => m.t > firstMs.t + 1e-9)
        return (next ? next.t : this.tl.end) - firstMs.t
      })()
      const nBeats = Math.max(2, Math.min(beats || 4, 12))
      const beatSec = (firstMeasureLen / nBeats) * this.spw
      for (let i = 0; i < nBeats; i++) {
        this.engine.playClick(now + i * beatSec, i === 0)
        const left = nBeats - i
        window.setTimeout(() => this.playing && this.onCountIn?.(left), (i * beatSec + 0.08) * 1000)
      }
      window.setTimeout(() => this.playing && this.onCountIn?.(0), (nBeats * beatSec + 0.08) * 1000)
      start = now + nBeats * beatSec
    }
    this.anchors = [{ time: start, pos: fromPos }]
    this.seekIndices(fromPos)
    this.currentStep = -1
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.schedule()
    const frame = () => {
      if (!this.playing) return
      const now2 = this.engine.now()
      if (now2 >= this.anchors[0].time) {
        const pos = this.posAt(now2)
        const idx = this.stepIndexAt(pos)
        if (idx !== this.currentStep) {
          this.currentStep = idx
          this.onStep?.(idx)
        }
        if (!this.loop && pos >= this.tl.end) {
          this.stop(true)
          this.onEnd?.()
          return
        }
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  private schedule() {
    const lookahead = 0.15
    const now = this.engine.now()
    const last = this.anchors[this.anchors.length - 1]
    const horizon = Math.max(now, last.time) + lookahead
    let target = last.pos + (horizon - last.time) / this.spw
    const loopEnd = this.loop?.end
    let wrap = false
    if (loopEnd !== undefined && target >= loopEnd) {
      target = loopEnd
      wrap = true
    }
    const ev = this.tl.events
    while (this.eventIdx < ev.length && ev[this.eventIdx].t < target - 1e-9) {
      const e = ev[this.eventIdx++]
      if ((e.solo && this.opts.muteSolo) || (!e.solo && this.opts.muteAccomp)) continue
      const time = last.time + (e.t - last.pos) * this.spw
      let dur = e.dur
      if (loopEnd !== undefined) dur = Math.min(dur, loopEnd - e.t)
      this.engine.playNote(e.midi, dur * this.spw * 0.98, Math.max(time, now), e.solo)
    }
    const cl = this.tl.clicks
    while (this.clickIdx < cl.length && cl[this.clickIdx].t < target - 1e-9) {
      const c = cl[this.clickIdx++]
      if (this.opts.metronome) this.engine.playClick(Math.max(now, last.time + (c.t - last.pos) * this.spw), c.accent)
    }
    this.scheduledUpTo = target
    if (wrap && this.loop) {
      const wrapTime = last.time + (loopEnd! - last.pos) * this.spw
      this.anchors.push({ time: wrapTime, pos: this.loop.start })
      if (this.anchors.length > 8) this.anchors.splice(0, this.anchors.length - 8)
      this.seekIndices(this.loop.start)
    }
  }

  setSpeed(speed: number) {
    if (this.playing) {
      const now = Math.max(this.engine.now(), this.anchors[this.anchors.length - 1].time)
      const pos = this.posAt(now)
      this.opts.speed = speed
      this.anchors.push({ time: now, pos })
    } else this.opts.speed = speed
  }

  /** posição atual (para pausar e retomar) */
  position(): number {
    if (!this.playing) return 0
    return Math.max(this.anchors[0].pos, this.posAt(this.engine.now()))
  }

  stop(releaseNotes = true) {
    this.playing = false
    window.clearInterval(this.timer)
    cancelAnimationFrame(this.raf)
    if (releaseNotes) this.engine.stopAll()
  }

  measureStartPos(measure: number) {
    return this.tl.measureStarts.find((m) => m.measure >= measure)?.t ?? 0
  }

  measureEndPos(measure: number) {
    const next = this.tl.measureStarts.find((m) => m.measure > measure)
    return next ? next.t : this.tl.end
  }

  stepSeconds(i: number) {
    return this.tl.steps[i].dur * this.spw
  }
}
