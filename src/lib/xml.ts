// Carregamento e pré-processamento de MusicXML (transposição + etiquetas com nomes de notas).
import JSZip from 'jszip'
import {
  type Instrument, type NamingSystem, type SpelledPitch, type Step,
  ALTO_SAX_CHROMATIC, ALTO_SAX_FIFTHS, fifthsForSemitones, midiOf, noteName,
  transposeSpelled, violinFingering, violinLabel,
} from './music'

/** Lê .musicxml/.xml (texto) ou .mxl (zip) e devolve o XML em texto. */
export async function readScoreFile(data: ArrayBuffer | Blob, nameHint = ''): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data
  const bytes = new Uint8Array(buf)
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK"
  if (!isZip && !nameHint.toLowerCase().endsWith('.mxl')) {
    return new TextDecoder('utf-8').decode(bytes)
  }
  const zip = await JSZip.loadAsync(buf)
  let rootPath: string | undefined
  const container = zip.file('META-INF/container.xml')
  if (container) {
    const c = new DOMParser().parseFromString(await container.async('text'), 'application/xml')
    rootPath = c.querySelector('rootfile')?.getAttribute('full-path') ?? undefined
  }
  if (!rootPath) {
    rootPath = Object.keys(zip.files).find(
      (f) => !f.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(f),
    )
  }
  if (!rootPath) throw new Error('Ficheiro .mxl sem MusicXML lá dentro.')
  return zip.file(rootPath)!.async('text')
}

export async function fetchScoreXml(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Não consegui carregar a partitura (${res.status}).`)
  return readScoreFile(await res.arrayBuffer(), url)
}

export interface PartInfo {
  index: number
  id: string
  name: string
  chromaticTranspose: number // <transpose><chromatic>
}

export interface ScoreInfo {
  title: string
  composer: string
  parts: PartInfo[]
  bpm: number | null
}

function partNodes(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll('score-partwise > part'))
}

export function inspectScore(xml: string): ScoreInfo {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('MusicXML inválido.')
  if (doc.querySelector('score-timewise')) throw new Error('Formato timewise não suportado. Exporta como "partwise".')
  const scoreParts = Array.from(doc.querySelectorAll('part-list > score-part'))
  const parts = partNodes(doc).map((p, index) => {
    const id = p.getAttribute('id') ?? String(index)
    const sp = scoreParts.find((s) => s.getAttribute('id') === id)
    const chrom = p.querySelector('attributes > transpose > chromatic')
    return {
      index,
      id,
      name: sp?.querySelector('part-name')?.textContent?.trim() || `Parte ${index + 1}`,
      chromaticTranspose: chrom ? parseInt(chrom.textContent || '0', 10) : 0,
    }
  })
  const title =
    doc.querySelector('work > work-title')?.textContent?.trim() ||
    doc.querySelector('movement-title')?.textContent?.trim() ||
    ''
  const composer = doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || ''
  const perMin = doc.querySelector('metronome > per-minute')?.textContent
  const soundTempo = doc.querySelector('sound[tempo]')?.getAttribute('tempo')
  const bpm = perMin ? parseFloat(perMin) : soundTempo ? parseFloat(soundTempo) : null
  return { title, composer, parts, bpm: bpm && isFinite(bpm) ? bpm : null }
}

/** Adivinha qual parte é a do solista para o instrumento escolhido. */
export function guessSoloPart(info: ScoreInfo, instrument: Instrument): number {
  const re = instrument === 'violin' ? /viol(in|ino)?|vln|vl\b/i : /sax|alto/i
  const found = info.parts.find((p) => re.test(p.name))
  if (found) return found.index
  if (instrument === 'altosax') {
    const t = info.parts.find((p) => p.chromaticTranspose === -9 || p.chromaticTranspose === 3)
    if (t) return t.index
  }
  return 0
}

export interface LabelOptions {
  instrument: Instrument
  soloPart: number
  showNames: boolean
  naming: NamingSystem
  withOctave: boolean
  /** Sax: mostrar nome da nota real (concert) em vez da escrita */
  saxConcertNames: boolean
  /** Violino: linha extra com corda + dedo */
  showViolinFingering: boolean
  /** Transposição do utilizador em meios-tons */
  transpose: number
}

function readPitch(n: Element): SpelledPitch | null {
  const p = n.querySelector(':scope > pitch')
  if (!p) return null
  const step = p.querySelector('step')?.textContent?.trim() as Step
  const alter = parseFloat(p.querySelector('alter')?.textContent || '0')
  const octave = parseInt(p.querySelector('octave')?.textContent || '4', 10)
  return { step, alter: Math.round(alter), octave }
}

function writePitch(doc: Document, n: Element, sp: SpelledPitch) {
  const p = n.querySelector(':scope > pitch')!
  p.querySelector('step')!.textContent = sp.step
  let alter = p.querySelector('alter')
  if (sp.alter !== 0) {
    if (!alter) {
      alter = doc.createElement('alter')
      p.insertBefore(alter, p.querySelector('octave'))
    }
    alter.textContent = String(sp.alter)
  } else if (alter) {
    alter.remove()
  }
  p.querySelector('octave')!.textContent = String(sp.octave)
  // os acidentes escritos deixam de bater certo depois de transpor
  n.querySelector(':scope > accidental')?.remove()
}

function addLyric(doc: Document, note: Element, number: number, text: string) {
  const lyric = doc.createElement('lyric')
  lyric.setAttribute('number', String(number))
  lyric.setAttribute('placement', 'below')
  const syl = doc.createElement('syllabic')
  syl.textContent = 'single'
  const t = doc.createElement('text')
  t.textContent = text
  lyric.append(syl, t)
  // a ordem do schema pede <lyric> antes de <play>/<listen>
  const before = note.querySelector(':scope > play, :scope > listen, :scope > footnote, :scope > level')
  if (before) note.insertBefore(lyric, before)
  else note.appendChild(lyric)
}

/** Devolve o XML transposto e com os nomes das notas por baixo da parte do solista. */
export function preprocessScore(xml: string, o: LabelOptions): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parts = partNodes(doc)

  // 1) transposição do utilizador (todas as partes)
  if (o.transpose !== 0) {
    const firstFifths = parseInt(doc.querySelector('key > fifths')?.textContent || '0', 10)
    const k = fifthsForSemitones(o.transpose, firstFifths)
    for (const part of parts) {
      for (const f of Array.from(part.querySelectorAll('key > fifths'))) {
        let nf = parseInt(f.textContent || '0', 10) + k
        if (nf > 7) nf -= 12
        if (nf < -7) nf += 12
        f.textContent = String(nf)
      }
      for (const n of Array.from(part.querySelectorAll('note'))) {
        const sp = readPitch(n)
        if (!sp) continue
        let t = transposeSpelled(sp, k, o.transpose)
        if (Math.abs(t.alter) > 1) {
          // evita dobrados sustenidos/bemóis: reescreve enarmonicamente
          t = transposeSpelled(sp, k + (t.alter > 0 ? -12 : 12), o.transpose)
        }
        writePitch(doc, n, t)
      }
      // acordes cifrados ficariam errados: remove
      part.querySelectorAll('harmony').forEach((h) => h.remove())
    }
  }

  // 2) etiquetas
  const solo = parts[o.soloPart] ?? parts[0]
  if (solo) {
    solo.querySelectorAll('note > lyric').forEach((l) => l.remove())
    if (o.showNames || (o.instrument === 'violin' && o.showViolinFingering)) {
      const chrom = parseInt(solo.querySelector('attributes > transpose > chromatic')?.textContent || '0', 10)
      for (const n of Array.from(solo.querySelectorAll('note'))) {
        if (n.querySelector(':scope > chord, :scope > grace')) continue
        const sp = readPitch(n)
        if (!sp) continue
        const ties = Array.from(n.querySelectorAll(':scope > tie')).map((t) => t.getAttribute('type'))
        if (ties.includes('stop')) continue // continuação de ligadura: já tem etiqueta

        let line = 1
        if (o.showNames) {
          let named = sp
          if (o.instrument === 'altosax' && o.saxConcertNames && chrom !== 0) {
            named = transposeSpelled(sp, chrom === ALTO_SAX_CHROMATIC ? ALTO_SAX_FIFTHS : fifthsForSemitones(chrom, 0), chrom)
          }
          addLyric(doc, n, line++, noteName(named, o.naming, o.withOctave))
        }
        if (o.instrument === 'violin' && o.showViolinFingering) {
          const f = violinFingering(midiOf(sp) + chrom)
          if (f) addLyric(doc, n, line, violinLabel(f, o.naming))
        }
      }
    }
  }
  return new XMLSerializer().serializeToString(doc)
}
