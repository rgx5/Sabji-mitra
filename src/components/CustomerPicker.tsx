import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addCustomer } from '../db/actions'
import { Sheet, SearchBar } from './ui'
import { money } from '../lib/format'
import type { Customer } from '../db/types'

/**
 * Two taps at most: the sheet opens on the recent customers, one tap picks.
 * Typing a new name turns the first row into a one-tap "create and pick".
 */
export function CustomerPicker({
  open,
  title = 'Who is this for?',
  onPick,
  onClose,
}: {
  open: boolean
  title?: string
  onPick: (c: Customer) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const customers = useLiveQuery(
    async () => (await db.customers.toArray()).filter((c) => c.deletedAt === null),
    [],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (customers ?? [])
      .slice()
      .sort((a, b) => b.lastSaleAt - a.lastSaleAt || a.name.localeCompare(b.name))
    if (!q) return all.slice(0, 40)
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(query.trim()),
    )
  }, [customers, query])

  const exact = list.some((c) => c.name.toLowerCase() === query.trim().toLowerCase())
  const canCreate = query.trim().length > 0 && !exact

  const createAndPick = async () => {
    const c = await addCustomer(query.trim())
    setQuery('')
    onPick(c)
  }

  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl font-bold">{title}</p>
          <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
            ✕
          </button>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Name or phone / नाव" />

        <div className="mt-3 max-h-[46vh] overflow-y-auto">
          {canCreate && (
            <button
              onClick={createAndPick}
              className="tap-scale mb-2 flex w-full items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-left text-white"
            >
              <span className="text-2xl">＋</span>
              <span className="text-[17px] font-bold">Add “{query.trim()}” &amp; continue</span>
            </button>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="tap-scale flex w-full items-center justify-between gap-3 border-b border-slate-100 px-2 py-3 text-left last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-semibold">{c.name}</span>
                {c.phone && <span className="block text-[13px] text-slate-500">{c.phone}</span>}
              </span>
              <span
                className={`shrink-0 text-[15px] font-bold tabular-nums ${
                  c.balance > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}
              >
                {c.balance > 0 ? `owes ${money(c.balance)}` : money(0)}
              </span>
            </button>
          ))}
          {list.length === 0 && !canCreate && (
            <p className="px-2 py-8 text-center text-slate-400">No customers yet</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
