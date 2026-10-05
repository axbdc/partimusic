import type { PitchReading } from '../lib/pitch'
import { midiToSpelled, noteName, type NamingSystem } from '../lib/music'

interface Props {
  reading: PitchReading | null
  naming: NamingSystem
  /** deslocamento para mostrar a nota escrita (ex.: +9 no sax alto) */
  writtenOffset?: number
}

export default function Tuner({ reading, naming, writtenOffset = 0 }: Props) {
  const cents = reading?.cents ?? 0
  const inTune = reading && Math.abs(cents) <= 8
  const name = reading ? noteName(midiToSpelled(reading.midi + writtenOffset), naming, true) : '—'
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`font-display text-4xl font-bold ${inTune ? 'text-green-600' : 'text-ink'}`}>{name}</div>
      <svg viewBox="0 0 200 60" className="w-full max-w-[220px]" aria-label="Afinador">
        <line x1="10" y1="40" x2="190" y2="40" stroke="#d6d3d1" strokeWidth="2" />
        {[-50, -25, 0, 25, 50].map((c) => (
          <g key={c}>
            <line x1={100 + c * 1.8} y1={c === 0 ? 26 : 32} x2={100 + c * 1.8} y2="48" stroke="#a8a29e" strokeWidth={c === 0 ? 2 : 1} />
            <text x={100 + c * 1.8} y="58" fontSize="8" textAnchor="middle" fill="#78716c">{c > 0 ? `+${c}` : c}</text>
          </g>
        ))}
        {reading && (
          <circle
            cx={100 + Math.max(-50, Math.min(50, cents)) * 1.8}
            cy="40"
            r="7"
            fill={inTune ? '#16a34a' : Math.abs(cents) < 20 ? '#d97706' : '#dc2626'}
            style={{ transition: 'cx 80ms linear' }}
          />
        )}
      </svg>
      <div className="text-xs text-stone-500">
        {reading ? `${reading.freq.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents` : 'Toca uma nota…'}
      </div>
    </div>
  )
}
