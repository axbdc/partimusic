// Teoria musical: nomes de notas, transposição com ortografia correta, dedilhações.

export type Instrument = 'violin' | 'altosax'
export type NamingSystem = 'solfege' | 'letters'

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  violin: 'Violino',
  altosax: 'Saxofone Alto',
}

export const LEVEL_LABEL: Record<string, string> = {
  iniciante: 'Iniciante',
  intermedio: 'Intermédio',
  avancado: 'Avançado',
}

export const STYLE_LABEL: Record<string, string> = {
  classico: 'Clássico',
  tradicional: 'Tradicional',
  jazz: 'Jazz',
  gospel: 'Gospel',
  pop: 'Pop',
  filme: 'Cinema',
  fado: 'Fado',
  outro: 'Outro',
}

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const STEP_SEMI: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
// posição na linha das quintas (F=-1, C=0, G=1 ... B=5)
const STEP_FIFTH: Record<Step, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }
const FIFTH_STEP: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']

const SOLFEGE: Record<Step, string> = { C: 'Dó', D: 'Ré', E: 'Mi', F: 'Fá', G: 'Sol', A: 'Lá', B: 'Si' }

export interface SpelledPitch {
  step: Step
  alter: number // -2..2
  octave: number // oitava científica (Dó central = 4)
}

export function midiOf(p: SpelledPitch): number {
  return (p.octave + 1) * 12 + STEP_SEMI[p.step] + p.alter
}

/** Transpõe uma nota escrita por k quintas (ortografia) e s meios-tons (altura). */
export function transposeSpelled(p: SpelledPitch, k: number, s: number): SpelledPitch {
  const pos = STEP_FIFTH[p.step] + 7 * p.alter + k
  // pos = base + 7*alter com base em [-1..5]
  const alter = Math.floor((pos + 1) / 7)
  const base = pos - 7 * alter
  const step = FIFTH_STEP[base + 1]
  const targetMidi = midiOf(p) + s
  const octave = Math.round((targetMidi - STEP_SEMI[step] - alter) / 12) - 1
  return { step, alter, octave }
}

/** Escolhe o número de quintas para transpor s meios-tons de forma a ficar numa armadura legível. */
export function fifthsForSemitones(s: number, currentFifths: number): number {
  const m = ((s % 12) + 12) % 12
  const k0 = (7 * m) % 12 // 7*7 ≡ 1 (mod 12)
  const options = [k0, k0 - 12]
  options.sort((a, b) => Math.abs(currentFifths + a) - Math.abs(currentFifths + b))
  return options[0]
}

const ACC_SYMBOL: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '#', 2: '𝄪' }

export function noteName(p: SpelledPitch, system: NamingSystem, withOctave: boolean): string {
  const base = system === 'solfege' ? SOLFEGE[p.step] : p.step
  return base + (ACC_SYMBOL[p.alter] ?? '') + (withOctave ? String(p.octave) : '')
}

const SHARP_NAMES: [Step, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]
const FLAT_NAMES: [Step, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
  ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
]

export function midiToSpelled(midi: number, preferFlats = false): SpelledPitch {
  const pc = ((midi % 12) + 12) % 12
  const [step, alter] = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc]
  return { step, alter, octave: Math.floor(midi / 12) - 1 }
}

export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export function freqToMidiFloat(f: number) {
  return 69 + 12 * Math.log2(f / 440)
}

/** Sax alto em Mib: nota real = nota escrita - 6.ª maior (9 meios-tons). */
export const ALTO_SAX_CHROMATIC = -9
export const ALTO_SAX_FIFTHS = -3

// ---------------------------------------------------------------------------
// Violino: corda + dedo em 1.ª posição (afinação Sol3 Ré4 Lá4 Mi5)
// ---------------------------------------------------------------------------
const VIOLIN_STRINGS: { step: Step; midi: number }[] = [
  { step: 'G', midi: 55 },
  { step: 'D', midi: 62 },
  { step: 'A', midi: 69 },
  { step: 'E', midi: 76 },
]

export interface ViolinFingering {
  string: Step
  finger: number // 0 = corda solta
  position: number // 1 = 1.ª posição
}

export function violinFingering(midi: number): ViolinFingering | null {
  if (midi < 55) return null
  let idx = 0
  for (let i = 0; i < VIOLIN_STRINGS.length; i++) if (midi >= VIOLIN_STRINGS[i].midi) idx = i
  const str = VIOLIN_STRINGS[idx]
  const d = midi - str.midi
  // 0 solta; 1-2 → 1.º dedo; 3-4 → 2.º; 5-6 → 3.º; 7 → 4.º (só na corda Mi, nas outras usa-se a corda seguinte solta)
  if (d <= 7) {
    const finger = d === 0 ? 0 : d <= 2 ? 1 : d <= 4 ? 2 : d <= 6 ? 3 : 4
    return { string: str.step, finger, position: 1 }
  }
  // acima da 1.ª posição na corda Mi: estimativa de posição
  const position = Math.min(7, 1 + Math.ceil((d - 7) / 2))
  return { string: 'E', finger: ((d - 7) % 4) + 1, position }
}

export function violinLabel(f: ViolinFingering, system: NamingSystem): string {
  const s = system === 'solfege' ? SOLFEGE[f.string] : f.string
  const pos = f.position > 1 ? ` ${f.position}ªp` : ''
  return `${f.finger}·${s}${pos}`
}

// ---------------------------------------------------------------------------
// Saxofone alto: dedilhações standard (nota ESCRITA)
// Chaves: O=oitava, 1,2,3 mão esquerda; 4,5,6 mão direita
// palm: D, Eb, F (palma); sideE (chave lateral Mi agudo); Fs (Fá# agudo)
// gs = Sol#; lowB, lowBb, lowCs (mindinho esq.); eb, lowC (mindinho dir.); bis
// ---------------------------------------------------------------------------
export type SaxKey =
  | 'O' | '1' | '2' | '3' | '4' | '5' | '6'
  | 'palmD' | 'palmEb' | 'palmF' | 'sideE' | 'highFs'
  | 'gs' | 'lowB' | 'lowBb' | 'lowCs' | 'eb' | 'lowC' | 'bis'

const LH: SaxKey[] = ['1', '2', '3']
const RH: SaxKey[] = ['4', '5', '6']
const ALL = [...LH, ...RH]

// indexado pelo MIDI da nota escrita (Sib3 = 58 ... Fá#6 = 90)
const SAX_FINGERINGS: Record<number, SaxKey[]> = {
  58: [...ALL, 'lowBb'],
  59: [...ALL, 'lowB'],
  60: [...ALL, 'lowC'],
  61: [...ALL, 'lowCs'],
  62: [...ALL],
  63: [...ALL, 'eb'],
  64: ['1', '2', '3', '4', '5'],
  65: ['1', '2', '3', '4'],
  66: ['1', '2', '3', '5'],
  67: ['1', '2', '3'],
  68: ['1', '2', '3', 'gs'],
  69: ['1', '2'],
  70: ['1', 'bis'],
  71: ['1'],
  72: ['2'],
  73: [],
}
for (let m = 62; m <= 73; m++) {
  const base = SAX_FINGERINGS[m]
  SAX_FINGERINGS[m + 12] = ['O', ...base]
}
SAX_FINGERINGS[85] = ['O']
SAX_FINGERINGS[86] = ['O', 'palmD']
SAX_FINGERINGS[87] = ['O', 'palmD', 'palmEb']
SAX_FINGERINGS[88] = ['O', 'palmD', 'palmEb', 'sideE']
SAX_FINGERINGS[89] = ['O', 'palmD', 'palmEb', 'sideE', 'palmF']
SAX_FINGERINGS[90] = ['O', 'palmD', 'palmEb', 'sideE', 'palmF', 'highFs']

export function saxFingering(writtenMidi: number): SaxKey[] | null {
  return SAX_FINGERINGS[writtenMidi] ?? null
}

export const SAX_RANGE = { low: 58, high: 90 }
export const VIOLIN_RANGE = { low: 55, high: 100 }
