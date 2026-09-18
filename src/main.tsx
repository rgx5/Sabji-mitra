import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDb } from './db/db'
import './index.css'

void initDb()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
