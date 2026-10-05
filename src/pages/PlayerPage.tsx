import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ColoringModes, OpenSheetMusicDisplay, PointF2D } from 'opensheetmusicdisplay'
import { AudioEngine } from '../lib/audio'
import { buildTimeline, Player, type Timeline } from '../lib/player'
import { MicPitch, type PitchReading } from '../lib/pitch'
import { getScore, loadScoreXml, type ScoreMeta } from '../lib/store'
import { guessSoloPart, inspectScore, preprocessScore, type ScoreInfo } from '../lib/xml'
import {
  INSTRUMENT_LABEL, midiToSpelled, noteName, saxFingering, violinFingering, violinLabel, type Instrument,
} from '../lib/music'
import {
  addPracticeSeconds, saveProgress, setSettings, toggleFavorite, useUserState,
} from '../lib/userState'
import SaxFingering from '../components/SaxFingering'
import Tuner from '../components/Tuner'
import { InstrumentIcon } from '../components/ScoreCard'

type MicMode = 'off' | 'tuner' | 'evaluate' | 'wait'

// cores tipo "boomwhacker" para Dó..Si + pausa
const NOTE_COLORS = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5', '#9333ea', '#1c1917']

export default function PlayerPage() {
  const { id = '' } = useParams()
  const [search] = useSearchParams()
  const user = useUserState()
  const s = user.settings

  const [meta, setMeta] = useState<ScoreMeta | null>(null)
  const [rawXml, setRawXml] = useState<string | null>(null)
  const [info, setInfo] = useState<ScoreInfo | null>(null)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  const [transpose, setTranspose] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [loopOn, setLoopOn] = useState(false)
  const [loopA, setLoopA] = useState(0)
  const [loopB, setLoopB] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [countLeft, setCountLeft] = useState(0)
  const [curStep, setCurStep] = useState(0)
  const [micMode, setMicMode] = useState<MicMode>('off')
  const [reading, setReading] = useState<PitchReading | null>(null)
  const [evalStats, setEvalStats] = useState({ ok: 0, bad: 0 })
  const [finished, setFinished] = useState<null | { score?: number }>(null)
  const [panel, setPanel] = useState<'settings' | null>(null)
  const [muteSolo, setMuteSolo] = useState(false)
  const [volumes, setVolumes] = useState({ solo: 0.9, accomp: 0.6, click: 0.5 })
  const [micError, setMicError] = useState('')
  const [resumeMeasure, setResumeMeasure] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const engineRef = useRef<AudioEngine | null>(null)
  const playerRef = useRef<Player | null>(null)
  const tlRef = useRef<Timeline | null>(null)
  const curStepRef = useRef(0)
  const pausedPosRef = useRef(0)
  const stepNotesRef = useRef(new Map<number, Element[]>())
  const micRef = useRef<MicPitch | null>(null)
  const micModeRef = useRef<MicMode>('off')
  const evalRef = useRef({ step: -1, hits: 0, total: 0 })
  const statsRef = useRef({ ok: 0, bad: 0 })
  const waitRef = useRef({ streak: 0, needRelease: false, lastMidi: -1 })
  const lastReadingUi = useRef(0)
  const practiceRef = useRef(0)

  const instrument: Instrument = useMemo(() => {
    const q = search.get('i') as Instrument | null
    if (meta && q && meta.instruments.includes(q)) return q
    if (meta && meta.instruments.includes(s.instrument)) return s.instrument
    return meta?.instruments[0] ?? s.instrument
  }, [search, meta, s.instrument])

  const soloPart = useMemo(() => {
    if (!info) return 0
    const configured = meta?.soloParts?.[instrument]
    if (configured !== undefined && configured < info.parts.length) return configured
    return guessSoloPart(info, instrument)
  }, [info, meta, instrument])

  const hasAccomp = (info?.parts.length ?? 1) > 1
  const writtenOffset = instrument === 'altosax' ? 9 : 0

  // ------------------------------------------------------------ carregar
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const m = await getScore(id)
        if (!m) throw new Error('Partitura não encontrada.')
        const xml = await loadScoreXml(m)
        if (!alive) return
        setMeta(m)
        setRawXml(xml)
        setInfo(inspectScore(xml))
        const prog = user.progress[id]
        if (prog && prog.measure > 0) setResumeMeasure(prog.measure)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const engine = new AudioEngine()
    engineRef.current = engine
    return () => {
      playerRef.current?.stop()
      micRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    setAudioReady(false)
    engineRef.current
      ?.load(instrument)
      .then(() => setAudioReady(true))
      .catch(() => setError('Não consegui carregar os sons do instrumento.'))
  }, [instrument])

  useEffect(() => {
    engineRef.current?.setVolumes(volumes)
  }, [volumes])

  // ------------------------------------------------------------ cursor
  const gotoStep = useCallback((i: number) => {
    const osmd = osmdRef.current
    const tl = tlRef.current
    if (!osmd || !tl || tl.steps.length === 0) return
    i = Math.max(0, Math.min(tl.steps.length - 1, i))
    const c = osmd.cursor
    const cur = curStepRef.current
    if (i === cur + 1) c.next()
    else if (i !== cur) {
      c.reset()
      for (let k = 0; k < i; k++) c.next()
    }
    curStepRef.current = i
    setCurStep(i)
    try {
      const inst = osmd.Sheet.Instruments[soloPartRef.current]
      const els = c
        .GNotesUnderCursor(inst)
        .map((g) => (g as unknown as { getSVGGElement?: () => SVGGElement }).getSVGGElement?.())
        .filter(Boolean) as Element[]
      stepNotesRef.current.set(i, els)
    } catch {
      /* ignora */
    }
  }, [])

  const soloPartRef = useRef(0)
  soloPartRef.current = soloPart

  const markStep = (i: number, ok: boolean) => {
    stepNotesRef.current.get(i)?.forEach((el) => el.classList.add(ok ? 'pm-note-ok' : 'pm-note-bad'))
  }

  const clearMarks = () => {
    containerRef.current?.querySelectorAll('.pm-note-ok, .pm-note-bad').forEach((el) => {
      el.classList.remove('pm-note-ok', 'pm-note-bad')
    })
    statsRef.current = { ok: 0, bad: 0 }
    setEvalStats({ ok: 0, bad: 0 })
  }

  const finalizeEval = () => {
    const tl = tlRef.current
    const ev = evalRef.current
    if (!tl || ev.step < 0) return
    const step = tl.steps[ev.step]
    if (step && step.expected.length) {
      const ok = ev.total > 0 && ev.hits / ev.total >= 0.3
      markStep(ev.step, ok)
      if (ok) statsRef.current.ok++
      else statsRef.current.bad++
      setEvalStats({ ...statsRef.current })
    }
  }

  // ------------------------------------------------------------ desenhar partitura
  useEffect(() => {
    if (!rawXml || !info || !containerRef.current) return
    let cancelled = false
    playerRef.current?.stop()
    setPlaying(false)
    setRendering(true)
    ;(async () => {
      try {
        const processed = preprocessScore(rawXml, {
          instrument,
          soloPart,
          showNames: s.showNames,
          naming: s.naming,
          withOctave: s.withOctave,
          saxConcertNames: s.saxConcertNames,
          showViolinFingering: s.showViolinFingering,
          transpose,
        })
        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current!, {
            autoResize: true,
            backend: 'svg',
            drawTitle: true,
            drawComposer: true,
            drawPartNames: true,
            drawCredits: false,
            followCursor: true,
            cursorsOptions: [{ type: 0, color: '#f59e0b', alpha: 0.45, follow: true }],
          })
        }
        const osmd = osmdRef.current
        osmd.setOptions({
          coloringMode: ColoringModes.CustomColorSet,
          coloringSetCustom: NOTE_COLORS,
          coloringEnabled: s.colorNotes,
          colorStemsLikeNoteheads: s.colorNotes,
        })
        await osmd.load(processed)
        if (cancelled) return
        osmd.Sheet.Instruments.forEach((inst, i) => {
          inst.Visible = i === soloPart || s.showAccompaniment
        })
        osmd.zoom = s.zoom
        osmd.render()
        osmd.cursor.show()
        osmd.FollowCursor = s.followCursor
        const tl = buildTimeline(osmd, soloPart, info.parts.map((p) => p.chromaticTranspose), meta?.bpm ?? info.bpm ?? 90)
        tlRef.current = tl
        stepNotesRef.current.clear()
        curStepRef.current = 0
        const player = new Player(engineRef.current!, tl)
        player.opts = { speed, metronome: s.metronome, muteSolo, muteAccomp: false }
        player.onStep = (i) => {
          if (micModeRef.current === 'evaluate') {
            finalizeEval()
            evalRef.current = { step: i, hits: 0, total: 0 }
          }
          gotoStep(i)
        }
        player.onEnd = () => onPlaybackEnd()
        player.onCountIn = (n) => setCountLeft(n)
        playerRef.current = player
        const measures = osmd.Sheet.SourceMeasures.length
        setLoopA(0)
        setLoopB(Math.max(0, measures - 1))
        gotoStep(0)
        pausedPosRef.current = 0
      } catch (e) {
        setError('Erro ao desenhar a partitura: ' + (e as Error).message)
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawXml, info, instrument, soloPart, s.showNames, s.naming, s.withOctave, s.saxConcertNames, s.showViolinFingering, transpose, s.colorNotes, s.showAccompaniment, s.zoom])

  useEffect(() => {
    if (osmdRef.current) osmdRef.current.FollowCursor = s.followCursor
  }, [s.followCursor])

  useEffect(() => {
    const p = playerRef.current
    if (p) p.opts.metronome = s.metronome
  }, [s.metronome])

  useEffect(() => {
    playerRef.current?.setSpeed(speed)
  }, [speed])

  useEffect(() => {
    const p = playerRef.current
    if (p) p.opts.muteSolo = muteSolo || micMode === 'evaluate'
  }, [muteSolo, micMode])

  // loop
  useEffect(() => {
    const p = playerRef.current
    if (!p) return
    p.loop = loopOn ? { start: p.measureStartPos(Math.min(loopA, loopB)), end: p.measureEndPos(Math.max(loopA, loopB)) } : null
  }, [loopOn, loopA, loopB, rendering])

  // ------------------------------------------------------------ tempo de prática
  useEffect(() => {
    const active = playing || micMode !== 'off'
    if (!active) return
    const t = window.setInterval(() => {
      practiceRef.current++
      if (practiceRef.current >= 15) {
        addPracticeSeconds(practiceRef.current)
        practiceRef.current = 0
      }
    }, 1000)
    return () => {
      window.clearInterval(t)
      addPracticeSeconds(practiceRef.current)
      practiceRef.current = 0
    }
  }, [playing, micMode])

  // ------------------------------------------------------------ transporte
  const currentMeasure = () => tlRef.current?.steps[curStepRef.current]?.measure ?? 0

  const onPlaybackEnd = () => {
    setPlaying(false)
    setCountLeft(0)
    if (micModeRef.current === 'evaluate') {
      finalizeEval()
      evalRef.current = { step: -1, hits: 0, total: 0 }
      const { ok, bad } = statsRef.current
      const score = ok + bad > 0 ? Math.round((ok / (ok + bad)) * 100) : 0
      setFinished({ score })
      saveProgress(id, 0, score)
    } else {
      setFinished({})
      saveProgress(id, 0)
    }
    pausedPosRef.current = 0
  }

  const play = async () => {
    const p = playerRef.current
    const tl = tlRef.current
    if (!p || !tl || !audioReady) return
    await AudioEngine.unlock()
    setFinished(null)
    if (micModeRef.current === 'wait') setMicMode('off')
    let from = pausedPosRef.current
    if (p.loop && (from < p.loop.start || from >= p.loop.end)) from = p.loop.start
    if (from >= tl.end - 1e-6) from = 0
    if (from === 0 || micModeRef.current === 'evaluate') clearMarks()
    p.opts.muteSolo = muteSolo || micModeRef.current === 'evaluate'
    evalRef.current = { step: -1, hits: 0, total: 0 }
    p.play(from, s.countIn)
    setPlaying(true)
  }

  const pause = () => {
    const p = playerRef.current
    if (!p) return
    const pos = p.position()
    p.stop()
    pausedPosRef.current = tlRef.current?.steps[p.stepIndexAt(pos)]?.t ?? pos
    setPlaying(false)
    setCountLeft(0)
    saveProgress(id, currentMeasure())
  }

  const stop = () => {
    playerRef.current?.stop()
    setPlaying(false)
    setCountLeft(0)
    pausedPosRef.current = 0
    gotoStep(0)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const seekToStep = (i: number) => {
    const tl = tlRef.current
    if (!tl) return
    const wasPlaying = playerRef.current?.playing
    playerRef.current?.stop()
    gotoStep(i)
    pausedPosRef.current = tl.steps[i]?.t ?? 0
    if (wasPlaying) {
      playerRef.current!.play(pausedPosRef.current, false)
    }
  }

  const seekToMeasure = (m: number) => {
    const tl = tlRef.current
    if (!tl) return
    const i = tl.steps.findIndex((st) => st.measure >= m)
    seekToStep(i < 0 ? 0 : i)
  }

  // clicar na partitura → saltar para aí (Shift = fim do loop, Alt = início)
  const onScoreClick = (e: React.MouseEvent) => {
    const osmd = osmdRef.current
    const tl = tlRef.current
    if (!osmd || !tl || !osmd.GraphicSheet) return
    try {
      const svgPt = osmd.GraphicSheet.domToSvg(new PointF2D(e.clientX, e.clientY))
      const pt = osmd.GraphicSheet.svgToOsmd(svgPt)
      const gve = osmd.GraphicSheet.GetNearestVoiceEntry(pt)
      if (!gve) return
      const gse = gve.parentStaffEntry
      const measureIdx = osmd.Sheet.SourceMeasures.indexOf(gse.parentMeasure.parentSourceMeasure)
      if (measureIdx < 0) return
      if (e.shiftKey) {
        setLoopB(measureIdx)
        setLoopOn(true)
        return
      }
      if (e.altKey) {
        setLoopA(measureIdx)
        setLoopOn(true)
        return
      }
      const ms = tl.measureStarts.find((m) => m.measure === measureIdx)
      if (!ms) return
      const target = ms.t + gse.relInMeasureTimestamp.RealValue
      const idx = playerRef.current!.stepIndexAt(target)
      seekToStep(idx)
    } catch {
      /* clique fora das notas */
    }
  }

  // ------------------------------------------------------------ microfone
  useEffect(() => {
    micModeRef.current = micMode
    if (micMode === 'off') {
      micRef.current?.stop()
      micRef.current = null
      setReading(null)
      return
    }
    if (micRef.current) return
    const mic = new MicPitch()
    micRef.current = mic
    setMicError('')
    mic
      .start((r) => {
        const now = performance.now()
        if (now - lastReadingUi.current > 66) {
          lastReadingUi.current = now
          setReading(r)
        }
        handleReading(r)
      })
      .catch(() => {
        setMicError('Não tenho acesso ao microfone. Dá permissão no browser e tenta outra vez.')
        setMicMode('off')
        micRef.current = null
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micMode])

  useEffect(() => () => micRef.current?.stop(), [])

  const handleReading = (r: PitchReading | null) => {
    const tl = tlRef.current
    if (!tl) return
    const mode = micModeRef.current
    if (mode === 'evaluate' && playerRef.current?.playing) {
      const ev = evalRef.current
      const step = tl.steps[ev.step]
      if (!step || !step.expected.length) return
      ev.total++
      if (r && step.expected.includes(r.midi)) ev.hits++
    } else if (mode === 'wait') {
      const step = tl.steps[curStepRef.current]
      if (!step) return
      if (!step.expected.length) {
        // pausa: avança sozinho
        advanceWait()
        return
      }
      const w = waitRef.current
      if (w.needRelease) {
        // nota repetida: espera por uma nova articulação (silêncio ou outra nota)
        if (!r || r.midi !== w.lastMidi) w.needRelease = false
        else return
      }
      if (r && step.expected.includes(r.midi)) {
        waitRef.current.streak++
        if (waitRef.current.streak >= 4) {
          waitRef.current.streak = 0
          waitRef.current.needRelease = true
          waitRef.current.lastMidi = r.midi
          markStep(curStepRef.current, true)
          statsRef.current.ok++
          setEvalStats({ ...statsRef.current })
          advanceWait()
        }
      } else if (r) {
        waitRef.current.streak = 0
      }
    }
  }

  const advanceWait = () => {
    const tl = tlRef.current
    if (!tl) return
    let next = curStepRef.current + 1
    while (next < tl.steps.length && !tl.steps[next].expected.length) next++
    if (next >= tl.steps.length) {
      setMicMode('off')
      setFinished({})
      saveProgress(id, 0)
      return
    }
    gotoStep(next)
  }

  const startMic = (mode: MicMode) => {
    if (mode === micMode) {
      setMicMode('off')
      return
    }
    if (mode === 'wait') {
      if (playing) pause()
      clearMarks()
      const tl = tlRef.current
      if (tl) {
        let i = curStepRef.current
        while (i < tl.steps.length && !tl.steps[i].expected.length) i++
        gotoStep(i < tl.steps.length ? i : 0)
      }
    }
    if (mode === 'evaluate' && playing) pause()
    setFinished(null)
    if (micMode !== 'off' && micRef.current) {
      micModeRef.current = mode
      setMicMode(mode)
    } else setMicMode(mode)
  }

  // ------------------------------------------------------------ teclado / pedal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const sc = scrollRef.current
      if (e.code === 'Space') {
        e.preventDefault()
        if (playerRef.current?.playing) pause()
        else play()
      } else if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        sc?.scrollBy({ top: sc.clientHeight * 0.8, behavior: 'smooth' })
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        sc?.scrollBy({ top: -sc.clientHeight * 0.8, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else wrapRef.current?.requestFullscreen?.()
  }

  // guardar progresso ao sair
  useEffect(
    () => () => {
      if (tlRef.current) saveProgress(id, tlRef.current.steps[curStepRef.current]?.measure ?? 0)
    },
    [id],
  )

  // ------------------------------------------------------------ painel de dedilhação
  const step = tlRef.current?.steps[curStep]
  const fingerInfo = useMemo(() => {
    if (!step || !step.expected.length) return null
    const concert = step.expected[0]
    const written = step.written[0]
    const writtenName = noteName(midiToSpelled(written, false), s.naming, true)
    const concertName = noteName(midiToSpelled(concert, true), s.naming, true)
    if (instrument === 'altosax') {
      return { kind: 'sax' as const, keys: saxFingering(written), writtenName, concertName }
    }
    const vf = violinFingering(concert)
    return { kind: 'violin' as const, vf, writtenName }
  }, [step, instrument, s.naming])

  const measureCount = osmdRef.current?.Sheet?.SourceMeasures.length ?? 0
  const fav = user.favorites.includes(id)

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="mb-4 text-red-600">{error}</p>
        <Link to="/" className="btn btn-primary">Voltar à biblioteca</Link>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="flex h-[calc(100dvh-0px)] flex-col bg-paper">
      {/* topo */}
      <div className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 py-2">
        <Link to="/" className="btn btn-ghost px-2" aria-label="Voltar">←</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold leading-tight">{meta?.title ?? 'A carregar…'}</h1>
          <p className="truncate text-xs text-stone-500">
            {meta?.composer}
            {meta && (
              <span className="ml-2 inline-flex items-center gap-1 text-stone-700">
                <InstrumentIcon instrument={instrument} className="h-3.5 w-3.5" /> {INSTRUMENT_LABEL[instrument]}
              </span>
            )}
          </p>
        </div>
        {meta && meta.instruments.length > 1 && (
          <select
            className="input max-w-48"
            value={instrument}
            onChange={(e) => setSettings({ instrument: e.target.value as Instrument })}
            aria-label="Instrumento"
          >
            {meta.instruments.map((i) => (
              <option key={i} value={i}>{INSTRUMENT_LABEL[i]}</option>
            ))}
          </select>
        )}
        <button className="btn btn-ghost px-2" onClick={() => toggleFavorite(id)} title="Favorito" aria-label="Favorito">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill={fav ? '#d97706' : 'none'} stroke={fav ? '#d97706' : 'currentColor'} strokeWidth="2">
            <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
        <button className="btn btn-ghost px-2" onClick={toggleFullscreen} title="Ecrã inteiro" aria-label="Ecrã inteiro">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>

      {/* barra de controlos */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-200 bg-white/80 px-3 py-2 md:flex-wrap [&>*]:shrink-0">
        <button
          className="btn btn-accent min-w-[96px]"
          onClick={() => (playing ? pause() : play())}
          disabled={!audioReady || rendering}
        >
          {!audioReady ? 'A carregar sons…' : playing ? '❚❚ Pausa' : '▶ Tocar'}
        </button>
        <button className="btn btn-outline" onClick={stop} title="Voltar ao início">■</button>

        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 py-1">
          <span className="text-xs font-semibold text-stone-500">Velocidade</span>
          <input type="range" min={0.25} max={1.5} step={0.05} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-24" aria-label="Velocidade" />
          <span className="w-10 text-right text-xs tabular-nums">{Math.round(speed * 100)}%</span>
          <span className="hidden text-xs text-stone-400 sm:inline">♩={Math.round((tlRef.current?.bpm ?? 90) * speed)}</span>
        </div>

        <button className={`btn ${s.metronome ? 'btn-on' : 'btn-outline'}`} onClick={() => setSettings({ metronome: !s.metronome })} title="Metrónomo">
          Metrónomo
        </button>
        <button className={`btn ${s.countIn ? 'btn-on' : 'btn-outline'}`} onClick={() => setSettings({ countIn: !s.countIn })} title="Contagem antes de começar">
          Contagem
        </button>

        <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${loopOn ? 'border-amber-300 bg-accent-soft' : 'border-stone-200 bg-white'}`}>
          <button className="text-xs font-semibold" onClick={() => setLoopOn(!loopOn)} title="Repetir secção">
            Loop {loopOn ? 'ON' : 'OFF'}
          </button>
          <span className="text-xs text-stone-500">c.</span>
          <input type="number" min={1} max={measureCount} value={loopA + 1} onChange={(e) => setLoopA(Math.max(0, Math.min(measureCount - 1, +e.target.value - 1)))} className="w-12 rounded border border-stone-300 px-1 text-xs" aria-label="Compasso inicial" />
          <span className="text-xs">–</span>
          <input type="number" min={1} max={measureCount} value={loopB + 1} onChange={(e) => setLoopB(Math.max(0, Math.min(measureCount - 1, +e.target.value - 1)))} className="w-12 rounded border border-stone-300 px-1 text-xs" aria-label="Compasso final" />
          <button className="text-xs text-amber-800 underline" onClick={() => { setLoopA(currentMeasure()); setLoopOn(true) }} title="Início do loop no compasso atual">A aqui</button>
          <button className="text-xs text-amber-800 underline" onClick={() => { setLoopB(currentMeasure()); setLoopOn(true) }} title="Fim do loop no compasso atual">B aqui</button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1">
          <span className="text-xs font-semibold text-stone-500">Tom</span>
          <button className="px-1 text-sm" onClick={() => setTranspose((t) => Math.max(-6, t - 1))} aria-label="Descer meio-tom">−</button>
          <span className="w-6 text-center text-xs tabular-nums">{transpose > 0 ? `+${transpose}` : transpose}</span>
          <button className="px-1 text-sm" onClick={() => setTranspose((t) => Math.min(6, t + 1))} aria-label="Subir meio-tom">+</button>
        </div>

        <div className="ml-auto flex items-center gap-1 [&>*]:shrink-0">
          <button className={`btn ${micMode === 'tuner' ? 'btn-on' : 'btn-outline'}`} onClick={() => startMic('tuner')} title="Afinador pelo microfone">Afinador</button>
          <button className={`btn ${micMode === 'evaluate' ? 'btn-on' : 'btn-outline'}`} onClick={() => startMic('evaluate')} title="Avalia as notas enquanto tocas com o acompanhamento">Avaliar-me</button>
          <button className={`btn ${micMode === 'wait' ? 'btn-on' : 'btn-outline'}`} onClick={() => startMic('wait')} title="A partitura espera até tocares a nota certa">Modo espera</button>
          <button className={`btn ${panel === 'settings' ? 'btn-on' : 'btn-outline'}`} onClick={() => setPanel(panel ? null : 'settings')}>Opções</button>
        </div>
      </div>

      {micError && <div className="bg-red-50 px-4 py-2 text-sm text-red-700">{micError}</div>}
      {resumeMeasure !== null && !rendering && tlRef.current && (
        <div className="flex items-center gap-3 bg-accent-soft px-4 py-2 text-sm text-amber-900">
          Da última vez paraste no compasso {resumeMeasure + 1}.
          <button className="font-semibold underline" onClick={() => { seekToMeasure(resumeMeasure); setResumeMeasure(null) }}>Retomar</button>
          <button className="text-amber-700" onClick={() => setResumeMeasure(null)}>Começar do início</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* partitura */}
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
          {rendering && (
            <div className="absolute inset-x-0 top-6 z-10 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-white">A preparar a partitura…</div>
          )}
          {countLeft > 0 && (
            <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
              <div className="rounded-3xl bg-ink/85 px-10 py-6 font-display text-7xl font-bold text-white">{countLeft}</div>
            </div>
          )}
          <div className="mx-auto max-w-5xl p-2 md:p-4">
            <div className="score-surface rounded-xl shadow-sm">
              <div ref={containerRef} onClick={onScoreClick} className="cursor-pointer" />
            </div>
            <p className="mt-2 text-center text-xs text-stone-500">
              Clica numa nota para começar daí · Shift+clique define o fim do loop · Alt+clique o início · Espaço = tocar/pausa · setas/pedal = virar página
            </p>
          </div>
        </div>

        {/* painel lateral */}
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-stone-200 bg-white p-4 md:flex">
          {panel === 'settings' ? (
            <SettingsPanel instrument={instrument} hasAccomp={hasAccomp} muteSolo={muteSolo} setMuteSolo={setMuteSolo} volumes={volumes} setVolumes={setVolumes} />
          ) : (
            <>
              {(micMode === 'evaluate' || micMode === 'wait' || evalStats.ok + evalStats.bad > 0) && (
                <div className="rounded-xl bg-stone-50 p-3">
                  <p className="label">{micMode === 'wait' ? 'Modo espera' : 'Avaliação'}</p>
                  {micMode === 'evaluate' && !playing && <p className="mb-2 text-xs text-stone-600">Carrega em Tocar e toca a tua parte com o acompanhamento. Usa auscultadores para o microfone não apanhar o piano.</p>}
                  {micMode === 'wait' && <p className="mb-2 text-xs text-stone-600">Toca a nota assinalada. A partitura só avança quando acertares.</p>}
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-700">✓ {evalStats.ok}</span>
                    {micMode !== 'wait' && <span className="text-red-700">✗ {evalStats.bad}</span>}
                  </div>
                </div>
              )}
              {finished && (
                <div className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
                  <p className="font-display text-lg font-bold">Muito bem!</p>
                  {finished.score !== undefined ? <p>Acertaste {finished.score}% das notas.</p> : <p>Chegaste ao fim da música.</p>}
                </div>
              )}

              <div>
                <p className="label">Nota atual</p>
                {fingerInfo ? (
                  fingerInfo.kind === 'sax' ? (
                    <div className="flex flex-col items-center">
                      <div className="font-display text-3xl font-bold">{fingerInfo.writtenName}</div>
                      <div className="mb-2 text-xs text-stone-500">soa {fingerInfo.concertName} (nota real)</div>
                      {s.showFingeringChart && <SaxFingering keys={fingerInfo.keys} size={300} />}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="font-display text-3xl font-bold">{fingerInfo.writtenName}</div>
                      {fingerInfo.vf && (
                        <ViolinDiagram string={fingerInfo.vf.string} finger={fingerInfo.vf.finger} label={violinLabel(fingerInfo.vf, s.naming)} position={fingerInfo.vf.position} naming={s.naming} />
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-stone-500">—</p>
                )}
              </div>

              {micMode !== 'off' && (
                <div className="border-t border-stone-100 pt-3">
                  <p className="label">Microfone</p>
                  <Tuner reading={reading} naming={s.naming} writtenOffset={writtenOffset} />
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* painel móvel */}
      {panel === 'settings' && (
        <div className="max-h-[50vh] overflow-y-auto border-t border-stone-200 bg-white p-4 md:hidden">
          <SettingsPanel instrument={instrument} hasAccomp={hasAccomp} muteSolo={muteSolo} setMuteSolo={setMuteSolo} volumes={volumes} setVolumes={setVolumes} />
        </div>
      )}
      {panel !== 'settings' && (micMode !== 'off' || fingerInfo) && (
        <div className="flex items-center justify-around gap-3 border-t border-stone-200 bg-white px-3 py-2 md:hidden">
          {fingerInfo && <div className="font-display text-2xl font-bold">{fingerInfo.writtenName}</div>}
          {fingerInfo?.kind === 'violin' && fingerInfo.vf && <div className="text-sm">{violinLabel(fingerInfo.vf, s.naming)}</div>}
          {micMode !== 'off' && <div className="w-40"><Tuner reading={reading} naming={s.naming} writtenOffset={writtenOffset} /></div>}
          {(evalStats.ok + evalStats.bad > 0) && <div className="text-sm"><span className="text-green-700">✓{evalStats.ok}</span> <span className="text-red-700">✗{evalStats.bad}</span></div>}
        </div>
      )}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-amber-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function SettingsPanel(props: {
  instrument: Instrument
  hasAccomp: boolean
  muteSolo: boolean
  setMuteSolo: (v: boolean) => void
  volumes: { solo: number; accomp: number; click: number }
  setVolumes: (v: { solo: number; accomp: number; click: number }) => void
}) {
  const { settings: s } = useUserState()
  const { instrument, volumes, setVolumes } = props
  return (
    <div className="space-y-4">
      <div>
        <p className="label">Nomes das notas</p>
        <Toggle label="Mostrar nomes por baixo" checked={s.showNames} onChange={(v) => setSettings({ showNames: v })} />
        <div className="my-1 flex rounded-lg bg-stone-100 p-1">
          {(['solfege', 'letters'] as const).map((n) => (
            <button key={n} onClick={() => setSettings({ naming: n })} className={`flex-1 rounded-md py-1 text-sm ${s.naming === n ? 'bg-white font-semibold shadow-sm' : 'text-stone-600'}`}>
              {n === 'solfege' ? 'Dó Ré Mi' : 'C D E'}
            </button>
          ))}
        </div>
        <Toggle label="Incluir oitava" hint="ex.: Ré4, Lá5" checked={s.withOctave} onChange={(v) => setSettings({ withOctave: v })} />
        <Toggle label="Notas coloridas" hint="cada nota com a sua cor" checked={s.colorNotes} onChange={(v) => setSettings({ colorNotes: v })} />
        {instrument === 'altosax' && (
          <Toggle label="Mostrar nota real" hint="O sax alto está em Mi♭: por defeito mostra a nota escrita (a que dedilhas)" checked={s.saxConcertNames} onChange={(v) => setSettings({ saxConcertNames: v })} />
        )}
        {instrument === 'violin' && (
          <Toggle label="Corda e dedo" hint="ex.: 1·Lá = 1.º dedo na corda Lá (1.ª posição)" checked={s.showViolinFingering} onChange={(v) => setSettings({ showViolinFingering: v })} />
        )}
        {instrument === 'altosax' && (
          <Toggle label="Diagrama de dedilhação" checked={s.showFingeringChart} onChange={(v) => setSettings({ showFingeringChart: v })} />
        )}
      </div>
      <div>
        <p className="label">Partitura</p>
        {props.hasAccomp && <Toggle label="Mostrar partes de acompanhamento" checked={s.showAccompaniment} onChange={(v) => setSettings({ showAccompaniment: v })} />}
        <Toggle label="Seguir o cursor" checked={s.followCursor} onChange={(v) => setSettings({ followCursor: v })} />
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-sm font-medium">Tamanho</span>
          <input type="range" min={0.6} max={1.6} step={0.1} value={s.zoom} onChange={(e) => setSettings({ zoom: parseFloat(e.target.value) })} className="flex-1" aria-label="Tamanho" />
          <span className="w-10 text-right text-xs">{Math.round(s.zoom * 100)}%</span>
        </div>
      </div>
      <div>
        <p className="label">Som</p>
        <Toggle label="Tocar a minha parte" hint="desliga para tocares tu com o acompanhamento" checked={!props.muteSolo} onChange={(v) => props.setMuteSolo(!v)} />
        {(
          [
            ['solo', 'Instrumento'],
            ['accomp', 'Acompanhamento'],
            ['click', 'Metrónomo'],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2 py-1">
            <span className="w-28 text-sm">{label}</span>
            <input type="range" min={0} max={1} step={0.05} value={volumes[k]} onChange={(e) => setVolumes({ ...volumes, [k]: parseFloat(e.target.value) })} className="flex-1" aria-label={`Volume ${label}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ViolinDiagram({ string, finger, label, position, naming }: { string: string; finger: number; label: string; position: number; naming: 'solfege' | 'letters' }) {
  const strings = ['G', 'D', 'A', 'E']
  const names: Record<string, string> = naming === 'solfege' ? { G: 'Sol', D: 'Ré', A: 'Lá', E: 'Mi' } : { G: 'G', D: 'D', A: 'A', E: 'E' }
  const si = strings.indexOf(string)
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 170" width="130" height="185" role="img" aria-label={`Corda ${names[string]}, dedo ${finger}`}>
        <rect x="20" y="10" width="80" height="150" rx="10" fill="#fef3c7" stroke="#e7d7a8" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line x1={33 + i * 18} y1="14" x2={33 + i * 18} y2="156" stroke={i === si ? '#9a3412' : '#a8a29e'} strokeWidth={i === si ? 2.5 : 1.2} />
            <text x={33 + i * 18} y="8" fontSize="9" textAnchor="middle" fill={i === si ? '#9a3412' : '#78716c'} fontWeight={i === si ? 700 : 400}>{names[strings[i]]}</text>
          </g>
        ))}
        {[1, 2, 3, 4].map((f) => (
          <line key={f} x1="24" x2="96" y1={14 + f * 30} y2={14 + f * 30} stroke="#e7d7a8" strokeDasharray="2 3" />
        ))}
        {finger === 0 ? (
          <circle cx={33 + si * 18} cy="20" r="7" fill="none" stroke="#9a3412" strokeWidth="2.5" />
        ) : (
          <g>
            <circle cx={33 + si * 18} cy={14 + finger * 30 - 12} r="9" fill="#9a3412" />
            <text x={33 + si * 18} y={14 + finger * 30 - 8.5} fontSize="11" textAnchor="middle" fill="#fff" fontWeight="700">{finger}</text>
          </g>
        )}
      </svg>
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-xs text-stone-500">
        {finger === 0 ? 'corda solta' : `${finger}.º dedo`} · {position}.ª posição
      </div>
    </div>
  )
}
