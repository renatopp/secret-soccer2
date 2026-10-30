import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Canvas textures (piece labels, painted score) need the fonts loaded first.
async function boot() {
  await Promise.allSettled([
    document.fonts.load("700 80px 'Barlow SC'"),
    document.fonts.load("500 20px 'Barlow SC'"),
    document.fonts.load("400 16px 'Sora'"),
  ])
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
