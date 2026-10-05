import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listScores, type ScoreMeta } from '../lib/store'
import { isCloud, supabase } from '../lib/supabase'
import { pullUserState, streakDays, todayKey, useUserState } from '../lib/userState'

function fmt(sec: number) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

export default function Progress() {
  const { practice, progress, favorites, recent } = useUserState()
  const [scores, setScores] = useState<ScoreMeta[]>([])
  useEffect(() => {
    listScores().then(setScores)
  }, [])

  const days = useMemo(() => {
    const out: { key: string; label: string; sec: number }[] = []
    const d = new Date()
    d.setDate(d.getDate() - 13)
    for (let i = 0; i < 14; i++) {
      const k = todayKey(d)
      out.push({ key: k, label: d.toLocaleDateString('pt-PT', { weekday: 'narrow' }), sec: practice[k] ?? 0 })
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [practice])

  const week = days.slice(7).reduce((a, d) => a + d.sec, 0)
  const total = Object.values(practice).reduce((a, b) => a + b, 0)
  const max = Math.max(600, ...days.map((d) => d.sec))
  const streak = streakDays(practice)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold">O meu progresso</h1>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Box label="Sequência" value={`${streak} ${streak === 1 ? 'dia' : 'dias'}`} />
        <Box label="Esta semana" value={fmt(week)} />
        <Box label="Total" value={fmt(total)} />
        <Box label="Favoritas" value={String(favorites.length)} />
      </div>

      <div className="card mb-6 p-5">
        <p className="label mb-3">Minutos de prática (últimos 14 dias)</p>
        <div className="flex h-40 items-end gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.key}: ${fmt(d.sec)}`}>
              <div className="flex w-full flex-1 items-end">
                <div className={`w-full rounded-t ${d.key === todayKey() ? 'bg-accent' : 'bg-stone-800'}`} style={{ height: `${(d.sec / max) * 100}%`, minHeight: d.sec ? 3 : 0 }} />
              </div>
              <span className="text-[10px] text-stone-500">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">A sequência conta dias com pelo menos 1 minuto de prática.</p>
      </div>

      <div className="card p-5">
        <p className="label mb-3">Músicas recentes</p>
        {recent.length === 0 && <p className="text-sm text-stone-500">Ainda não tocaste nenhuma música.</p>}
        <ul className="divide-y divide-stone-100">
          {recent.map((id) => {
            const s = scores.find((x) => x.id === id)
            if (!s) return null
            const p = progress[id]
            return (
              <li key={id} className="flex items-center justify-between py-2">
                <Link to={`/tocar/${id}`} className="font-medium hover:underline">{s.title}</Link>
                <span className="text-xs text-stone-500">
                  {p?.bestScore !== undefined ? `melhor avaliação ${p.bestScore}% · ` : ''}
                  {p ? new Date(p.updatedAt).toLocaleDateString('pt-PT') : ''}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {isCloud && <SyncBox />}
    </div>
  )
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
    </div>
  )
}

function SyncBox() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null))
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user.email ?? null)
      if (s) pullUserState()
    })
    return () => data.subscription.unsubscribe()
  }, [])
  const login = async (signup: boolean) => {
    setMsg('')
    const fn = signup ? supabase!.auth.signUp({ email, password }) : supabase!.auth.signInWithPassword({ email, password })
    const { error } = await fn
    if (error) setMsg(error.message)
    else if (signup) setMsg('Conta criada. Confirma o email se for pedido.')
  }
  return (
    <div className="card mt-6 p-5">
      <p className="label mb-2">Sincronizar entre dispositivos</p>
      {user ? (
        <div className="flex items-center justify-between text-sm">
          <span>Sessão iniciada como {user}. O progresso é guardado na conta.</span>
          <button className="btn btn-ghost" onClick={() => supabase!.auth.signOut()}>Sair</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs" type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input className="input max-w-xs" type="password" placeholder="palavra-passe" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button className="btn btn-primary" onClick={() => login(false)}>Entrar</button>
          <button className="btn btn-outline" onClick={() => login(true)}>Criar conta</button>
          {msg && <p className="w-full text-sm text-stone-600">{msg}</p>}
        </div>
      )}
    </div>
  )
}
