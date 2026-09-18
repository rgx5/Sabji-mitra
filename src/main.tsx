import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDb } from './db/db'
import { requestPersistentStorage } from './lib/storage'
import './index.css'

void initDb()
// Ask the browser not to evict the ledger. Safe to call on every boot.
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
