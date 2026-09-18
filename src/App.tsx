import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ToastHost } from './components/ui'
import { go, useRoute } from './lib/router'
import { db, getSettings } from './db/db'
import QuickBill from './screens/QuickBill'
import RateBoard from './screens/RateBoard'
import Khata from './screens/Khata'
import CustomerDetail from './screens/CustomerDetail'
import PurchaseEntry from './screens/PurchaseEntry'
import DayClose from './screens/DayClose'
import SettingsScreen from './screens/SettingsScreen'

const TABS = [
  { key: 'bill', label: 'Bill', icon: '🧾' },
  { key: 'rates', label: 'Rates', icon: '📋' },
  { key: 'khata', label: 'Khata', icon: '📒' },
  { key: 'day', label: 'Day', icon: '📊' },
  { key: 'more', label: 'More', icon: '⚙️' },
] as const

export default function App() {
  const route = useRoute()
  const head = route.parts[0] ?? 'bill'

  // First run lands on the rate board: billing needs today's sell rates.
  useEffect(() => {
    void (async () => {
      if (window.location.hash) return
      const count = await db.dailyRates.count()
      go(count === 0 ? 'rates' : 'bill')
    })()
  }, [])

  const screen = (() => {
    switch (head) {
      case 'rates':
        return <RateBoard />
      case 'khata':
        return route.parts[1] ? <CustomerDetail customerId={route.parts[1]} /> : <Khata />
      case 'purchase':
        return <PurchaseEntry />
      case 'day':
        return <DayClose />
      case 'more':
        return <SettingsScreen />
      default:
        return <QuickBill />
    }
  })()

  const hideNav = head === 'bill' // the bill screen owns the bottom bar

  return (
    <ToastHost>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-100">
        <BackupNudge />
        <main className={`flex-1 ${hideNav ? '' : 'pb-24'}`}>{screen}</main>
        {!hideNav && (
          <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-around border-t border-slate-200 bg-white">
            {TABS.map((t) => {
              const active = t.key === head || (t.key === 'more' && head === 'purchase')
              return (
                <button
                  key={t.key}
                  onClick={() => go(t.key)}
                  className={`tap-scale flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                    active ? 'text-brand-700' : 'text-slate-400'
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  {t.label}
                </button>
              )
            })}
          </nav>
        )}
      </div>
    </ToastHost>
  )
}

const WEEK = 7 * 24 * 60 * 60 * 1000

function BackupNudge() {
  const settings = useLiveQuery(() => getSettings(), [])
  // Nag only once there is a week of unsaved work — never on a fresh install.
  const firstSaleAt = useLiveQuery(async () => (await db.sales.orderBy('createdAt').first())?.createdAt ?? 0, [])
  if (!settings || !firstSaleAt) return null
  const since = settings.lastBackupAt ?? firstSaleAt
  if (since > Date.now() - WEEK) return null
  return (
    <button
      onClick={() => go('more')}
      className="flex w-full items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-left text-[13px] font-semibold text-amber-900"
    >
      <span>⚠️ Backup is over 7 days old — tap to export</span>
      <span aria-hidden>›</span>
    </button>
  )
}
