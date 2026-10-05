import { useEffect, useRef, useState } from 'react'
import Tuner from '../components/Tuner'
import { AudioEngine } from '../lib/audio'
import { MicPitch, type PitchReading } from '../lib/pitch'
import { INSTRUMENT_LABEL, type Instrument } from '../lib/music'
import { setSettings, useUserState } from '../lib/userState'

const REFS: Record<Instrument, { label: string; midi: number }[]> = {
  violin: [
    { label: 'Sol', midi: 55 },
    { label: 'Ré', midi: 62 },
    { label: 'Lá', midi: 69 },
    { label: 'Mi', midi: 76 },
  ],
  // notas escritas do sax → som real (−9)
  altosax: [
    { label: 'Fá# (Lá real)', midi: 69 },
    { label: 'Dó (Mi♭ real)', midi: 63 },
    { label: 'Sol (Si♭ real)', midi: 70 },
  ],
}

export default function TunerPage() {
  const { settings } = useUserState()
  const inst = settings.instrument
  const [on, setOn] = useState(false)
  const [reading, setReading] = useState<PitchReading | null>(null)
  const [err, setErr] = useState('')
  const mic = useRef<MicPitch | null>(null)
  const engine = useRef<AudioEngine | null>(null)
  const last = useRef(0)

  useEffect(() => {
    engine.current = new AudioEngine()
    engine.current.load(inst)
    return () => mic.current?.stop()
  }, [inst])

  const toggle = async () => {
    if (on) {
      mic.current?.stop()
      mic.current = null
      setOn(false)
      setReading(null)
      return
    }
    setErr('')
    const m = new MicPitch()
    try {
      await m.start((r) => {
        const now = performance.now()
        if (now - last.current > 60) {
          last.current = now
          setReading(r)
        }
      })
      mic.current = m
      setOn(true)
    } catch {
      setErr('Sem acesso ao microfone. Dá permissão no browser.')
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 font-display text-3xl font-bold">Afinador</h1>
      <p className="mb-6 text-sm text-stone-500">
        {inst === 'altosax'
          ? 'No sax alto o afinador mostra a nota escrita (a que lês na partitura).'
          : 'Afina as quatro cordas: Sol, Ré, Lá, Mi.'}
      </p>
      <div className="mb-4 flex gap-2">
        {(['violin', 'altosax'] as Instrument[]).map((i) => (
          <button key={i} onClick={() => setSettings({ instrument: i })} className={`btn ${inst === i ? 'btn-primary' : 'btn-outline'}`}>
            {INSTRUMENT_LABEL[i]}
          </button>
        ))}
      </div>
      <div className="card flex flex-col items-center gap-4 p-8">
        <Tuner reading={reading} naming={settings.naming} writtenOffset={inst === 'altosax' ? 9 : 0} />
        <button className={`btn ${on ? 'btn-outline' : 'btn-accent'}`} onClick={toggle}>
          {on ? 'Desligar microfone' : 'Ligar microfone'}
        </button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
      <div className="mt-6">
        <p className="label">Nota de referência</p>
        <div className="flex flex-wrap gap-2">
          {REFS[inst].map((r) => (
            <button key={r.label} className="btn btn-outline" onClick={() => engine.current?.preview(r.midi)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
