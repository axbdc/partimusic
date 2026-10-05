import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteScore, getPdfUrl, listScores, newId, saveScore, type ScoreMeta, type ScoreStatus } from '../lib/store'
import { isCloud, supabase } from '../lib/supabase'
import { guessSoloPart, inspectScore, readScoreFile, type ScoreInfo } from '../lib/xml'
import { INSTRUMENT_LABEL, LEVEL_LABEL, STYLE_LABEL, type Instrument } from '../lib/music'

const STATUS_LABEL: Record<ScoreStatus, string> = {
  pending: 'À espera de conversão',
  draft: 'Rascunho',
  published: 'Publicada',
}
const STATUS_COLOR: Record<ScoreStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  draft: 'bg-stone-200 text-stone-700',
  published: 'bg-green-100 text-green-800',
}

type Auth = 'checking' | 'anon' | 'not-admin' | 'admin'

export default function Admin() {
  const [auth, setAuth] = useState<Auth>(isCloud ? 'checking' : 'admin')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!supabase) return
    const check = async () => {
      const { data } = await supabase!.auth.getSession()
      const user = data.session?.user
      if (!user) return setAuth('anon')
      setEmail(user.email ?? '')
      const { data: row } = await supabase!.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
      setAuth(row ? 'admin' : 'not-admin')
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => sub.subscription.unsubscribe()
  }, [])

  if (auth === 'checking') return <div className="p-10 text-center text-stone-500">A verificar sessão…</div>
  if (auth === 'anon') return <AdminLogin />
  if (auth === 'not-admin')
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-2 font-semibold">A conta {email} não tem permissões de administrador.</p>
        <p className="mb-6 text-sm text-stone-500">Adiciona o teu utilizador à tabela <code>admins</code> no Supabase.</p>
        <button className="btn btn-outline" onClick={() => supabase!.auth.signOut()}>Terminar sessão</button>
      </div>
    )
  return <AdminDashboard email={email} />
}

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setErr('Email ou palavra-passe errados.')
    setBusy(false)
  }
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 font-display text-3xl font-bold">Área de administração</h1>
      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="em">Email</label>
          <input id="em" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="pw">Palavra-passe</label>
          <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function AdminDashboard({ email }: { email: string }) {
  const [scores, setScores] = useState<ScoreMeta[]>([])
  const [editing, setEditing] = useState<ScoreMeta | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | ScoreStatus>('all')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const all = await listScores({ includeUnpublished: true })
    setScores(all.filter((s) => s.source !== 'seed'))
    setLoading(false)
  }
  useEffect(() => {
    refresh()
  }, [])

  const shown = scores.filter((s) => filter === 'all' || s.status === filter)
  const pending = scores.filter((s) => s.status === 'pending').length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Administração</h1>
          <p className="text-sm text-stone-500">
            {isCloud ? `Sessão: ${email}` : 'Modo local: os ficheiros ficam guardados só neste browser.'}
          </p>
        </div>
        <div className="flex gap-2">
          {isCloud && <button className="btn btn-ghost" onClick={() => supabase!.auth.signOut()}>Sair</button>}
          <button className="btn btn-accent" onClick={() => setEditing('new')}>+ Nova partitura</button>
        </div>
      </div>

      {!isCloud && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Ainda não está ligado ao Supabase. Tudo o que carregares aqui fica apenas neste computador. Depois de configurar
          as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> na Vercel, esta área passa a guardar online e
          as partituras ficam visíveis para todos.
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Partituras" value={scores.length} />
        <Stat label="Publicadas" value={scores.filter((s) => s.status === 'published').length} />
        <Stat label="À espera de conversão" value={pending} accent={pending > 0} />
      </div>

      <details className="card mb-6 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Como funciona o carregamento de PDFs?</summary>
        <div className="mt-3 space-y-2 text-stone-700">
          <p>
            Para a partitura ficar interativa (nomes das notas, som, cursor, avaliação) é preciso a versão <strong>MusicXML</strong>.
            Um PDF é só uma imagem, por isso tem de ser convertido primeiro (reconhecimento ótico de música).
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Carrega o PDF com o título, instrumento e nível. Fica com o estado <em>À espera de conversão</em>.</li>
            <li>A conversão faz-se com o Audiveris (gratuito) e depois revê-se no MuseScore para corrigir erros de leitura.</li>
            <li>Volta a esta página, edita a partitura, junta o ficheiro <code>.musicxml</code> ou <code>.mxl</code> e marca como <em>Publicada</em>.</li>
          </ol>
          <p>Se já tiveres o MusicXML (por exemplo exportado do MuseScore ou Finale), carrega-o diretamente e fica logo publicada.</p>
        </div>
      </details>

      <div className="mb-3 flex gap-1">
        {(['all', 'pending', 'draft', 'published'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
            {f === 'all' ? 'Todas' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-stone-500">A carregar…</p>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-stone-500">Sem partituras. Carrega a primeira em “Nova partitura”.</div>
      ) : (
        <div className="card divide-y divide-stone-100">
          {shown.map((s) => (
            <AdminRow key={s.id} score={s} onEdit={() => setEditing(s)} onDeleted={refresh} />
          ))}
        </div>
      )}

      {editing && (
        <ScoreForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-amber-300 bg-amber-50' : ''}`}>
      <p className="label">{label}</p>
      <p className="font-display text-3xl font-bold">{value}</p>
    </div>
  )
}

function AdminRow({ score, onEdit, onDeleted }: { score: ScoreMeta; onEdit: () => void; onDeleted: () => void }) {
  const openPdf = async () => {
    const url = await getPdfUrl(score)
    if (url) window.open(url, '_blank')
  }
  const remove = async () => {
    if (!window.confirm(`Apagar "${score.title}"? Esta ação não pode ser desfeita.`)) return
    await deleteScore(score)
    onDeleted()
  }
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{score.title}</p>
        <p className="text-sm text-stone-500">
          {score.composer || 'Compositor desconhecido'} · {score.instruments.map((i) => INSTRUMENT_LABEL[i]).join(', ')} · {LEVEL_LABEL[score.level] ?? score.level}
        </p>
        {score.notes && <p className="mt-1 text-xs text-stone-500">Nota: {score.notes}</p>}
      </div>
      <span className={`chip ${STATUS_COLOR[score.status]}`}>{STATUS_LABEL[score.status]}</span>
      <div className="flex gap-1">
        {score.pdfPath && <button className="btn btn-ghost" onClick={openPdf}>PDF</button>}
        {(score.xmlPath || score.xmlUrl) && (
          <Link className="btn btn-ghost" to={`/tocar/${score.id}?i=${score.instruments[0]}`}>Pré-visualizar</Link>
        )}
        <button className="btn btn-outline" onClick={onEdit}>Editar</button>
        <button className="btn btn-ghost text-red-600" onClick={remove}>Apagar</button>
      </div>
    </div>
  )
}

function ScoreForm({ initial, onClose, onSaved }: { initial: ScoreMeta | null; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState<ScoreMeta>(
    initial ?? {
      id: newId(),
      title: '',
      composer: '',
      instruments: ['violin'],
      level: 'iniciante',
      style: 'classico',
      bpm: null,
      description: '',
      status: 'pending',
      soloParts: {},
      source: isCloud ? 'cloud' : 'local',
      notes: '',
    },
  )
  const [pdf, setPdf] = useState<File | null>(null)
  const [xml, setXml] = useState<File | null>(null)
  const [info, setInfo] = useState<ScoreInfo | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const statusTouched = useState(false)

  const set = (patch: Partial<ScoreMeta>) => setM((x) => ({ ...x, ...patch }))

  const onXml = async (f: File | null) => {
    setXml(f)
    setInfo(null)
    setErr('')
    if (!f) return
    try {
      const text = await readScoreFile(f, f.name)
      const inf = inspectScore(text)
      setInfo(inf)
      const soloParts: Partial<Record<Instrument, number>> = {}
      for (const i of m.instruments) soloParts[i] = guessSoloPart(inf, i)
      setM((x) => ({
        ...x,
        title: x.title || inf.title,
        composer: x.composer || inf.composer,
        bpm: x.bpm || inf.bpm,
        soloParts,
        hasAccompaniment: inf.parts.length > 1,
        status: statusTouched[0] ? x.status : 'published',
      }))
    } catch (e) {
      setErr('Não consegui ler o MusicXML: ' + (e as Error).message)
    }
  }

  const toggleInstrument = (i: Instrument) => {
    const has = m.instruments.includes(i)
    const next = has ? m.instruments.filter((x) => x !== i) : [...m.instruments, i]
    if (next.length === 0) return
    const soloParts = { ...m.soloParts }
    if (!has && info) soloParts[i] = guessSoloPart(info, i)
    set({ instruments: next, soloParts })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!m.title.trim()) return setErr('Falta o título.')
    if (!initial && !pdf && !xml) return setErr('Carrega pelo menos um PDF ou um MusicXML.')
    const hasXml = !!xml || !!m.xmlPath
    if (m.status === 'published' && !hasXml) return setErr('Só é possível publicar depois de ter o MusicXML.')
    setBusy(true)
    try {
      await saveScore(m, { pdf, xml })
      onSaved()
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="my-8 w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{initial ? 'Editar partitura' : 'Nova partitura'}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-dashed border-stone-300 p-4">
            <p className="label">PDF da partitura</p>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="text-sm" />
            {m.pdfPath && !pdf && <p className="mt-1 text-xs text-stone-500">Já tem PDF. Escolhe outro para substituir.</p>}
          </div>
          <div className="rounded-xl border-2 border-dashed border-stone-300 p-4">
            <p className="label">MusicXML (.musicxml, .xml, .mxl)</p>
            <input type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml" onChange={(e) => onXml(e.target.files?.[0] ?? null)} className="text-sm" />
            {(m.xmlPath || m.xmlUrl) && !xml && <p className="mt-1 text-xs text-stone-500">Já tem MusicXML. Escolhe outro para substituir.</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="t">Título</label>
            <input id="t" className="input" value={m.title} onChange={(e) => set({ title: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="c">Compositor / autor</label>
            <input id="c" className="input" value={m.composer} onChange={(e) => set({ composer: e.target.value })} />
          </div>
        </div>

        <div>
          <p className="label">Instrumento(s)</p>
          <div className="flex gap-2">
            {(['violin', 'altosax'] as Instrument[]).map((i) => (
              <button type="button" key={i} onClick={() => toggleInstrument(i)} className={`btn ${m.instruments.includes(i) ? 'btn-primary' : 'btn-outline'}`}>
                {INSTRUMENT_LABEL[i]}
              </button>
            ))}
          </div>
        </div>

        {info && info.parts.length > 0 && (
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="label">Partes encontradas no MusicXML</p>
            <p className="mb-2 text-xs text-stone-500">Escolhe qual é a parte do solista. As outras ficam como acompanhamento.</p>
            {m.instruments.map((i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <span className="w-32 text-sm">{INSTRUMENT_LABEL[i]}:</span>
                <select className="input" value={m.soloParts?.[i] ?? 0} onChange={(e) => set({ soloParts: { ...m.soloParts, [i]: +e.target.value } })}>
                  {info.parts.map((p) => (
                    <option key={p.index} value={p.index}>
                      {p.name}
                      {p.chromaticTranspose ? ` (transposição ${p.chromaticTranspose})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {m.instruments.includes('violin') && (info.parts[m.soloParts?.violin ?? 0]?.chromaticTranspose ?? 0) !== 0 && (
              <p className="text-xs text-amber-800">
                Atenção: a parte escolhida para violino é de um instrumento transpositor. Escolhe a parte de violino.
              </p>
            )}
            {m.instruments.includes('altosax') && info.parts[m.soloParts?.altosax ?? 0]?.chromaticTranspose === 0 && (
              <p className="text-xs text-amber-800">
                Atenção: a parte escolhida para sax não indica transposição. Se a partitura estiver em som real (concert), as
                dedilhações vão ficar erradas. Exporta do MuseScore a parte de “Alto Saxophone”.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="lv">Nível</label>
            <select id="lv" className="input" value={m.level} onChange={(e) => set({ level: e.target.value })}>
              {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="st">Estilo</label>
            <select id="st" className="input" value={m.style} onChange={(e) => set({ style: e.target.value })}>
              {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bpm">Andamento (♩/min)</label>
            <input id="bpm" className="input" type="number" min={20} max={300} value={m.bpm ?? ''} placeholder="do ficheiro" onChange={(e) => set({ bpm: e.target.value ? +e.target.value : null })} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="d">Descrição</label>
          <textarea id="d" className="input" rows={2} value={m.description} onChange={(e) => set({ description: e.target.value })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ss">Estado</label>
            <select id="ss" className="input" value={m.status} onChange={(e) => { statusTouched[1](true); set({ status: e.target.value as ScoreStatus }) }}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="n">Notas internas</label>
            <input id="n" className="input" value={m.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="ex.: página 2 com mancha" />
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-accent" disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  )
}
