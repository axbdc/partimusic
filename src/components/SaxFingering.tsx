import type { SaxKey } from '../lib/music'

interface Props {
  keys: SaxKey[] | null
  size?: number
}

/** Diagrama esquemático das chaves do sax alto (vista frontal, de cima para baixo). */
export default function SaxFingering({ keys, size = 230 }: Props) {
  const on = (k: SaxKey) => !!keys?.includes(k)
  const fill = (k: SaxKey) => (on(k) ? '#1c1917' : '#fff')
  const stroke = '#1c1917'
  const w = size * 0.52
  return (
    <svg viewBox="0 0 120 300" width={w} height={size} role="img" aria-label="Dedilhação do saxofone">
      {/* corpo */}
      <rect x="44" y="8" width="32" height="284" rx="16" fill="#fef3c7" stroke="#e7d7a8" />
      {/* chave de oitava (polegar) */}
      <ellipse cx="18" cy="52" rx="9" ry="6" fill={fill('O')} stroke={stroke} strokeWidth="2" />
      <text x="18" y="70" fontSize="8" textAnchor="middle" fill="#78716c">8va</text>
      {/* palm keys */}
      <rect x="86" y="18" width="20" height="9" rx="4" fill={fill('palmD')} stroke={stroke} strokeWidth="1.6" />
      <rect x="92" y="31" width="20" height="9" rx="4" fill={fill('palmEb')} stroke={stroke} strokeWidth="1.6" />
      <rect x="86" y="44" width="20" height="9" rx="4" fill={fill('palmF')} stroke={stroke} strokeWidth="1.6" />
      {/* mão esquerda */}
      <circle cx="60" cy="72" r="11" fill={fill('1')} stroke={stroke} strokeWidth="2" />
      <circle cx="60" cy="90" r="4" fill={fill('bis')} stroke={stroke} strokeWidth="1.5" />
      <circle cx="60" cy="108" r="11" fill={fill('2')} stroke={stroke} strokeWidth="2" />
      <circle cx="60" cy="136" r="11" fill={fill('3')} stroke={stroke} strokeWidth="2" />
      {/* mindinho esquerdo: Sol#, Dó#, Si, Sib grave */}
      <rect x="84" y="128" width="22" height="9" rx="4" fill={fill('gs')} stroke={stroke} strokeWidth="1.6" />
      <rect x="84" y="142" width="10" height="16" rx="3" fill={fill('lowCs')} stroke={stroke} strokeWidth="1.4" />
      <rect x="96" y="142" width="10" height="8" rx="3" fill={fill('lowB')} stroke={stroke} strokeWidth="1.4" />
      <rect x="96" y="152" width="10" height="8" rx="3" fill={fill('lowBb')} stroke={stroke} strokeWidth="1.4" />
      <line x1="38" y1="166" x2="82" y2="166" stroke="#a8a29e" strokeDasharray="3 3" />
      {/* chaves laterais (mão direita) */}
      <rect x="22" y="182" width="9" height="18" rx="3" fill={fill('sideE')} stroke={stroke} strokeWidth="1.4" />
      <rect x="22" y="206" width="9" height="14" rx="3" fill={fill('highFs')} stroke={stroke} strokeWidth="1.4" />
      {/* mão direita */}
      <circle cx="60" cy="188" r="11" fill={fill('4')} stroke={stroke} strokeWidth="2" />
      <circle cx="60" cy="216" r="11" fill={fill('5')} stroke={stroke} strokeWidth="2" />
      <circle cx="60" cy="244" r="11" fill={fill('6')} stroke={stroke} strokeWidth="2" />
      {/* mindinho direito: Mib, Dó grave */}
      <rect x="84" y="258" width="20" height="9" rx="4" fill={fill('eb')} stroke={stroke} strokeWidth="1.6" />
      <rect x="84" y="271" width="20" height="9" rx="4" fill={fill('lowC')} stroke={stroke} strokeWidth="1.6" />
      <text x="60" y="296" fontSize="7" textAnchor="middle" fill="#78716c">
        {keys === null ? 'fora da tessitura' : ''}
      </text>
    </svg>
  )
}
