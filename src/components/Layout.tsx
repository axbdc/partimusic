import { Link, NavLink, Outlet } from 'react-router-dom'
import { isCloud } from '../lib/supabase'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="font-display text-xl font-bold tracking-tight">Partimusic</span>
    </Link>
  )
}

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-200/70'}`

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>Biblioteca</NavLink>
            <NavLink to="/progresso" className={nav}>Progresso</NavLink>
            <NavLink to="/afinador" className={nav}>Afinador</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
        <div className="mx-auto max-w-6xl px-4">
          Partimusic · amostras de som{' '}
          <a className="underline" href="https://github.com/nbrosowsky/tonejs-instruments" target="_blank" rel="noreferrer">tonejs-instruments</a>{' '}
          (CC-BY 3.0) · <Link to="/admin" className="underline">Admin</Link>
          {!isCloud && <span> · modo local</span>}
        </div>
      </footer>
    </div>
  )
}
