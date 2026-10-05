// Preferências, favoritos, progresso e estatísticas de prática.
// Guardado no browser; se houver sessão Supabase, sincroniza com a tabela user_state.
import { useSyncExternalStore } from 'react'
import type { Instrument, NamingSystem } from './music'
import { supabase } from './supabase'

export interface Settings {
  instrument: Instrument
  naming: NamingSystem
  showNames: boolean
  withOctave: boolean
  colorNotes: boolean
  saxConcertNames: boolean
  showViolinFingering: boolean
  showFingeringChart: boolean
  showAccompaniment: boolean
  followCursor: boolean
  countIn: boolean
  metronome: boolean
  zoom: number
}

export interface UserState {
  settings: Settings
  favorites: string[]
  progress: Record<string, { measure: number; updatedAt: string; bestScore?: number }>
  practice: Record<string, number> // 'YYYY-MM-DD' -> segundos
  recent: string[]
}

const KEY = 'partimusic:user'

const DEFAULT: UserState = {
  settings: {
    instrument: 'violin',
    naming: 'solfege',
    showNames: true,
    withOctave: false,
    colorNotes: false,
    saxConcertNames: false,
    showViolinFingering: false,
    showFingeringChart: true,
    showAccompaniment: true,
    followCursor: true,
    countIn: true,
    metronome: false,
    zoom: 1,
  },
  favorites: [],
  progress: {},
  practice: {},
  recent: [],
}

function load(): UserState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const p = JSON.parse(raw)
    return { ...DEFAULT, ...p, settings: { ...DEFAULT.settings, ...(p.settings ?? {}) } }
  } catch {
    return DEFAULT
  }
}

let state: UserState = load()
const listeners = new Set<() => void>()
let syncTimer: number | undefined

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sem armazenamento */
  }
  listeners.forEach((l) => l())
  scheduleSync()
}

export function getUserState() {
  return state
}

export function updateUserState(fn: (s: UserState) => UserState) {
  state = fn(state)
  emit()
}

export function useUserState(): UserState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function setSettings(patch: Partial<Settings>) {
  updateUserState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
}

export function toggleFavorite(id: string) {
  updateUserState((s) => ({
    ...s,
    favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites],
  }))
}

export function saveProgress(id: string, measure: number, score?: number) {
  updateUserState((s) => {
    const prev = s.progress[id]
    return {
      ...s,
      recent: [id, ...s.recent.filter((r) => r !== id)].slice(0, 12),
      progress: {
        ...s.progress,
        [id]: {
          measure,
          updatedAt: new Date().toISOString(),
          bestScore: score !== undefined ? Math.max(score, prev?.bestScore ?? 0) : prev?.bestScore,
        },
      },
    }
  })
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addPracticeSeconds(sec: number) {
  if (sec <= 0) return
  const k = todayKey()
  updateUserState((s) => ({ ...s, practice: { ...s.practice, [k]: (s.practice[k] ?? 0) + sec } }))
}

export function streakDays(practice: Record<string, number>): number {
  let n = 0
  const d = new Date()
  if (!practice[todayKey(d)]) d.setDate(d.getDate() - 1) // ainda não praticou hoje: conta até ontem
  while (practice[todayKey(d)] && practice[todayKey(d)] >= 60) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

// ---------------- sincronização opcional ----------------
function scheduleSync() {
  if (!supabase) return
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(async () => {
    const { data } = await supabase!.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    await supabase!.from('user_state').upsert({ user_id: uid, data: state, updated_at: new Date().toISOString() })
  }, 1500)
}

export async function pullUserState() {
  if (!supabase) return
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess.session?.user.id
  if (!uid) return
  const { data } = await supabase.from('user_state').select('data').eq('user_id', uid).maybeSingle()
  if (data?.data) {
    const remote = data.data as UserState
    // junta: favoritos e prática somam-se; o resto prevalece o remoto
    const practice = { ...remote.practice }
    for (const [k, v] of Object.entries(state.practice)) practice[k] = Math.max(practice[k] ?? 0, v)
    state = {
      ...DEFAULT,
      ...remote,
      settings: { ...DEFAULT.settings, ...remote.settings },
      favorites: Array.from(new Set([...(remote.favorites ?? []), ...state.favorites])),
      progress: { ...state.progress, ...remote.progress },
      practice,
    }
    emit()
  }
}
