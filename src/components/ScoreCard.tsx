import { Link } from 'react-router-dom'
import type { ScoreMeta } from '../lib/store'
import { INSTRUMENT_LABEL, LEVEL_LABEL, STYLE_LABEL, type Instrument } from '../lib/music'
import { toggleFavorite, useUserState } from '../lib/userState'

const LEVEL_COLOR: Record<string, string> = {
  iniciante: 'bg-green-100 text-green-800',
  intermedio: 'bg-amber-100 text-amber-800',
  avancado: 'bg-red-100 text-red-800',
}

export function InstrumentIcon({ instrument, className = 'h-5 w-5' }: { instrument: Instrument; className?: string }) {
  if (instrument === 'violin') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M14.5 3.5l6 6M17.5 6.5l-6.2 6.2" strokeLinecap="round" />
        <path d="M11 9.5c-1.8-1-4.3-.6-5.6 1-.9 1-.6 2.2-1.5 3.2-1 1-1.8 2.4-.9 4.1.9 1.7 2.8 2.4 4.3 1.4 1-.6 1.6-1.6 2.6-1.7 1.4-.1 2.4-.7 3-1.8.8-1.4.5-3.3-.6-4.5" />
        <path d="M8 16l2-2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M15 2.5l2.5 1.5-1 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 6l-5 11a4 4 0 01-7.3-.2c-.6-1.5.4-3 1.8-3.4" strokeLinecap="round" />
      <circle cx="12.5" cy="11" r=".8" fill="currentColor" />
      <circle cx="11.3" cy="13.6" r=".8" fill="currentColor" />
      <path d="M5 13.4l1.5-.8" strokeLinecap="round" />
    </svg>
  )
}

function thumbNotes(id: string): [number, number][] {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return Array.from({ length: 6 }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return [20 + i * 25, 20 + (Math.abs(h) % 6) * 5] as [number, number]
  })
}

export default function ScoreCard({ score, instrument }: { score: ScoreMeta; instrument: Instrument }) {
  const { favorites, progress } = useUserState()
  const fav = favorites.includes(score.id)
  const prog = progress[score.id]
  return (
    <div className="card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <Link to={`/tocar/${score.id}?i=${instrument}`} className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-stone-100 to-amber-50">
          <svg viewBox="0 0 160 60" className="h-16 w-40 text-stone-400" aria-hidden>
            {[10, 20, 30, 40, 50].map((y) => (
              <line key={y} x1="0" x2="160" y1={y} y2={y} stroke="currentColor" strokeWidth="0.8" />
            ))}
            {thumbNotes(score.id).map(([x, y], i) => (
              <g key={i} className="text-stone-700">
                <ellipse cx={x} cy={y} rx="5.5" ry="4" fill="currentColor" transform={`rotate(-20 ${x} ${y})`} />
                <line x1={x + 5} x2={x + 5} y1={y} y2={y - 22} stroke="currentColor" strokeWidth="1.3" />
              </g>
            ))}
          </svg>
        </div>
        <h3 className="font-display text-lg font-bold leading-tight">{score.title}</h3>
        <p className="mb-3 text-sm text-stone-500">{score.composer}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <span className={`chip ${LEVEL_COLOR[score.level] ?? 'bg-stone-100 text-stone-700'}`}>{LEVEL_LABEL[score.level] ?? score.level}</span>
          <span className="chip bg-stone-100 text-stone-700">{STYLE_LABEL[score.style] ?? score.style}</span>
          {score.hasAccompaniment && <span className="chip bg-sky-100 text-sky-800">c/ acompanhamento</span>}
          <span className="chip bg-stone-900 text-white">
            <InstrumentIcon instrument={instrument} className="mr-1 h-3.5 w-3.5" />
            {INSTRUMENT_LABEL[instrument]}
          </span>
        </div>
        {prog && (
          <p className="mt-2 text-xs text-stone-500">
            Paraste no compasso {prog.measure + 1}
            {prog.bestScore !== undefined && ` · melhor avaliação ${prog.bestScore}%`}
          </p>
        )}
      </Link>
      <button
        onClick={() => toggleFavorite(score.id)}
        className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
        aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        title={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={fav ? '#d97706' : 'none'} stroke={fav ? '#d97706' : '#57534e'} strokeWidth="2">
          <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z" />
        </svg>
      </button>
    </div>
  )
}
