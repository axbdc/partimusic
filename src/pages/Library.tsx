import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ScoreCard, { InstrumentIcon } from '../components/ScoreCard'
import { listScores, type ScoreMeta } from '../lib/store'
import { INSTRUMENT_LABEL, LEVEL_LABEL, STYLE_LABEL, type Instrument } from '../lib/music'
import { setSettings, useUserState } from '../lib/userState'

type Tab = 'todas' | 'favoritas' | 'recentes'

export default function Library() {
  const { settings, favorites, recent } = useUserState()
  const instrument = settings.instrument
  const [scores, setScores] = useState<ScoreMeta[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [style, setStyle] = useState('')
  const [tab, setTab] = useState<Tab>('todas')

  useEffect(() => {
    listScores()
      .then(setScores)
      .catch((e) => setError(String(e.message ?? e)))
  }, [])

  const styles = useMemo(() => Array.from(new Set((scores ?? []).map((s) => s.style))), [scores])

  const filtered = useMemo(() => {
    let list = (scores ?? []).filter((s) => s.instruments.includes(instrument))
    if (tab === 'favoritas') list = list.filter((s) => favorites.includes(s.id))
    if (tab === 'recentes') list = recent.map((id) => list.find((s) => s.id === id)).filter(Boolean) as ScoreMeta[]
    if (level) list = list.filter((s) => s.level === level)
    if (style) list = list.filter((s) => s.style === style)
    const t = q.trim().toLowerCase()
    if (t) list = list.filter((s) => `${s.title} ${s.composer}`.toLowerCase().includes(t))
    return list
  }, [scores, instrument, tab, favorites, recent, level, style, q])

  const continueScore = useMemo(() => {
    const id = recent.find((r) => scores?.some((s) => s.id === r && s.instruments.includes(instrument)))
    return id ? scores?.find((s) => s.id === id) : undefined
  }, [recent, scores, instrument])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8 grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            Lê, ouve e toca.
            <br />
            <span className="text-accent">Nota a nota.</span>
          </h1>
          <p className="mt-3 max-w-xl text-stone-600">
            Partituras interativas com o nome de cada nota por baixo, acompanhamento de piano, controlo de velocidade e
            avaliação pelo microfone.
          </p>
        </div>
        <div className="card p-2">
          <p className="label px-2 pt-1">O meu instrumento</p>
          <div className="grid grid-cols-2 gap-2">
            {(['violin', 'altosax'] as Instrument[]).map((i) => (
              <button
                key={i}
                onClick={() => setSettings({ instrument: i })}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  instrument === i ? 'bg-ink text-white' : 'hover:bg-stone-100'
                }`}
              >
                <InstrumentIcon instrument={i} className="h-7 w-7" />
                <span className="font-semibold">{INSTRUMENT_LABEL[i]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {continueScore && tab === 'todas' && (
        <Link
          to={`/tocar/${continueScore.id}?i=${instrument}`}
          className="mb-6 flex items-center justify-between rounded-2xl bg-ink px-5 py-4 text-white hover:bg-stone-800"
        >
          <span>
            <span className="block text-xs uppercase tracking-wide text-amber-300">Continuar onde paraste</span>
            <span className="font-display text-lg font-bold">{continueScore.title}</span>
          </span>
          <span aria-hidden className="text-2xl">→</span>
        </Link>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-stone-200/70 p-1">
          {(['todas', 'favoritas', 'recentes'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-stone-600'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <input className="input max-w-xs flex-1" placeholder="Procurar música ou compositor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-48" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Nível">
          <option value="">Todos os níveis</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="input max-w-48" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Estilo">
          <option value="">Todos os estilos</option>
          {styles.map((s) => (
            <option key={s} value={s}>{STYLE_LABEL[s] ?? s}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!scores && !error && <p className="text-stone-500">A carregar biblioteca…</p>}
      {scores && filtered.length === 0 && (
        <div className="card p-10 text-center text-stone-500">
          {tab === 'favoritas' ? 'Ainda não tens favoritas. Toca no coração de uma música.' : 'Nenhuma partitura encontrada.'}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <ScoreCard key={s.id} score={s} instrument={instrument} />
        ))}
      </div>
    </div>
  )
}
