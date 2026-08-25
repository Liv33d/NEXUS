import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HeroCardLab from './HeroCardLab'

const host = document.getElementById('hero-lab-root')
if (!host) throw new Error('Hero Card Lab root is missing')

createRoot(host).render(<StrictMode><HeroCardLab/></StrictMode>)
