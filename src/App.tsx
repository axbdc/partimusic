import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Library from './pages/Library'

const PlayerPage = lazy(() => import('./pages/PlayerPage'))
const Admin = lazy(() => import('./pages/Admin'))
const TunerPage = lazy(() => import('./pages/TunerPage'))
const Progress = lazy(() => import('./pages/Progress'))

const Loading = () => <div className="p-10 text-center text-stone-500">A carregar…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/tocar/:id" element={<PlayerPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Library />} />
            <Route path="/progresso" element={<Progress />} />
            <Route path="/afinador" element={<TunerPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<div className="p-10 text-center">Página não encontrada.</div>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
