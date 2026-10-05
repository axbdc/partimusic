// Camada de dados das partituras: exemplos incluídos + Supabase (se configurado) ou IndexedDB (modo local).
import { get, set, del } from 'idb-keyval'
import type { Instrument } from './music'
import { BUCKET, supabase } from './supabase'
import { readScoreFile } from './xml'

export type ScoreStatus = 'draft' | 'pending' | 'published'

export interface ScoreMeta {
  id: string
  title: string
  composer: string
  instruments: Instrument[]
  level: string
  style: string
  bpm?: number | null
  description?: string
  status: ScoreStatus
  soloParts?: Partial<Record<Instrument, number>>
  hasAccompaniment?: boolean
  xmlUrl?: string | null
  xmlPath?: string | null
  pdfPath?: string | null
  pdfUrl?: string | null
  createdAt?: string
  source: 'seed' | 'local' | 'cloud'
  notes?: string // notas internas do admin
}

let seedCache: ScoreMeta[] | null = null

async function loadSeeds(): Promise<ScoreMeta[]> {
  if (seedCache) return seedCache
  const res = await fetch('/scores/manifest.json')
  const raw: Array<Record<string, unknown>> = await res.json()
  seedCache = raw.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    composer: r.composer as string,
    instruments: [r.instrument as Instrument],
    level: r.level as string,
    style: r.style as string,
    bpm: r.bpm as number,
    description: r.description as string,
    status: 'published',
    hasAccompaniment: r.hasAccompaniment as boolean,
    xmlUrl: r.xmlUrl as string,
    soloParts: { [r.instrument as Instrument]: 0 },
    source: 'seed',
  }))
  return seedCache
}

// ---------------- modo local (IndexedDB) ----------------
const LOCAL_KEY = 'partimusic:scores'

async function localList(): Promise<ScoreMeta[]> {
  return ((await get(LOCAL_KEY)) as ScoreMeta[] | undefined) ?? []
}

// ---------------- Supabase ----------------
interface Row {
  id: string
  title: string
  composer: string | null
  instruments: string[]
  level: string
  style: string
  bpm: number | null
  description: string | null
  status: ScoreStatus
  solo_parts: Partial<Record<Instrument, number>> | null
  has_accompaniment: boolean | null
  xml_path: string | null
  pdf_path: string | null
  notes: string | null
  created_at: string
}

function rowToMeta(r: Row): ScoreMeta {
  const pub = (p: string | null) => (p ? supabase!.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null)
  return {
    id: r.id,
    title: r.title,
    composer: r.composer ?? '',
    instruments: r.instruments as Instrument[],
    level: r.level,
    style: r.style,
    bpm: r.bpm,
    description: r.description ?? '',
    status: r.status,
    soloParts: r.solo_parts ?? {},
    hasAccompaniment: !!r.has_accompaniment,
    xmlPath: r.xml_path,
    pdfPath: r.pdf_path,
    xmlUrl: pub(r.xml_path),
    pdfUrl: pub(r.pdf_path),
    notes: r.notes ?? '',
    createdAt: r.created_at,
    source: 'cloud',
  }
}

function metaToRow(m: ScoreMeta) {
  return {
    id: m.id,
    title: m.title,
    composer: m.composer,
    instruments: m.instruments,
    level: m.level,
    style: m.style,
    bpm: m.bpm ?? null,
    description: m.description ?? null,
    status: m.status,
    solo_parts: m.soloParts ?? {},
    has_accompaniment: !!m.hasAccompaniment,
    xml_path: m.xmlPath ?? null,
    pdf_path: m.pdfPath ?? null,
    notes: m.notes ?? null,
  }
}

// ---------------- API pública ----------------
export async function listScores(opts: { includeUnpublished?: boolean } = {}): Promise<ScoreMeta[]> {
  const seeds = await loadSeeds()
  let others: ScoreMeta[] = []
  if (supabase) {
    let q = supabase.from('scores').select('*').order('created_at', { ascending: false })
    if (!opts.includeUnpublished) q = q.eq('status', 'published')
    const { data, error } = await q
    if (error) console.warn('Supabase:', error.message)
    others = (data as Row[] | null)?.map(rowToMeta) ?? []
  } else {
    others = await localList()
    if (!opts.includeUnpublished) others = others.filter((s) => s.status === 'published')
  }
  return [...others, ...seeds]
}

export async function getScore(id: string): Promise<ScoreMeta | null> {
  const seeds = await loadSeeds()
  const s = seeds.find((x) => x.id === id)
  if (s) return s
  if (supabase) {
    const { data } = await supabase.from('scores').select('*').eq('id', id).maybeSingle()
    return data ? rowToMeta(data as Row) : null
  }
  return (await localList()).find((x) => x.id === id) ?? null
}

export async function loadScoreXml(m: ScoreMeta): Promise<string> {
  if (m.source === 'local') {
    const blob = (await get(`partimusic:file:${m.id}:xml`)) as Blob | undefined
    if (!blob) throw new Error('Esta partitura ainda não tem MusicXML.')
    return readScoreFile(blob, m.xmlPath ?? '')
  }
  if (!m.xmlUrl) throw new Error('Esta partitura ainda não tem MusicXML.')
  const res = await fetch(m.xmlUrl, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Não consegui carregar a partitura (${res.status}).`)
  return readScoreFile(await res.arrayBuffer(), m.xmlUrl)
}

export async function getPdfUrl(m: ScoreMeta): Promise<string | null> {
  if (m.source === 'local') {
    const blob = (await get(`partimusic:file:${m.id}:pdf`)) as Blob | undefined
    return blob ? URL.createObjectURL(blob) : null
  }
  return m.pdfUrl ?? null
}

export function newId() {
  return crypto.randomUUID()
}

export async function saveScore(m: ScoreMeta, files: { xml?: File | null; pdf?: File | null }): Promise<ScoreMeta> {
  const meta = { ...m }
  if (supabase) {
    meta.source = 'cloud'
    if (files.xml) {
      const ext = files.xml.name.toLowerCase().endsWith('.mxl') ? 'mxl' : 'musicxml'
      const path = `${meta.id}/score-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, files.xml, { upsert: true, contentType: ext === 'mxl' ? 'application/vnd.recordare.musicxml' : 'application/xml' })
      if (error) throw new Error('Upload do MusicXML falhou: ' + error.message)
      meta.xmlPath = path
    }
    if (files.pdf) {
      const path = `${meta.id}/original-${Date.now()}.pdf`
      const { error } = await supabase.storage.from(BUCKET).upload(path, files.pdf, { upsert: true, contentType: 'application/pdf' })
      if (error) throw new Error('Upload do PDF falhou: ' + error.message)
      meta.pdfPath = path
    }
    const { data, error } = await supabase.from('scores').upsert(metaToRow(meta)).select().single()
    if (error) throw new Error('Gravação falhou: ' + error.message)
    return rowToMeta(data as Row)
  }
  meta.source = 'local'
  if (files.xml) {
    await set(`partimusic:file:${meta.id}:xml`, files.xml)
    meta.xmlPath = files.xml.name
  }
  if (files.pdf) {
    await set(`partimusic:file:${meta.id}:pdf`, files.pdf)
    meta.pdfPath = files.pdf.name
  }
  meta.createdAt ??= new Date().toISOString()
  const list = await localList()
  const i = list.findIndex((x) => x.id === meta.id)
  if (i >= 0) list[i] = meta
  else list.unshift(meta)
  await set(LOCAL_KEY, list)
  return meta
}

export async function deleteScore(m: ScoreMeta) {
  if (supabase) {
    const paths = [m.xmlPath, m.pdfPath].filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    const { error } = await supabase.from('scores').delete().eq('id', m.id)
    if (error) throw new Error(error.message)
    return
  }
  await del(`partimusic:file:${m.id}:xml`)
  await del(`partimusic:file:${m.id}:pdf`)
  await set(LOCAL_KEY, (await localList()).filter((x) => x.id !== m.id))
}
