import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { collectPayment } from '../db/actions'
import { NumPad } from '../components/NumPad'
import { CustomerForm } from '../components/CustomerForm'
import { EmptyState, SearchBar, useToast } from '../components/ui'
import { money, toPaise } from '../lib/format'
import { go } from '../lib/router'
import type { Customer } from '../db/types'

export default function Khata() {
  const [query, setQuery] = useState('')
  const [collectFor, setCollectFor] = useState<Customer | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const { toast } = useToast()

  const customers = useLiveQuery(
    async () => (await db.customers.toArray()).filter((c) => c.deletedAt === null),
    [],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = (customers ?? [])
      .slice()
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
    if (!q) return all
    return all.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(query.trim()))
  }, [customers, query])

  const outstanding = (customers ?? []).reduce((s, c) => s + Math.max(0, c.balance), 0)
  const owingCount = (customers ?? []).filter((c) => c.balance > 0).length

  const onCollect = async (raw: string, mode: 'cash' | 'upi') => {
    if (!collectFor) return
    const amount = toPaise(raw)
    if (amount <= 0) return
    await collectPayment(collectFor.id, amount, mode)
    toast(`${money(amount)} from ${collectFor.name}`)
    setCollectFor(null)
  }

  return (
    <div>
      <header className="sticky top-0 z-30 bg-brand-700 px-3 pt-3 pb-3 text-white">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-brand-100">Total outstanding</p>
            <p className="text-3xl font-bold tabular-nums">{money(outstanding)}</p>
            <p className="text-[13px] text-brand-100">
              {owingCount} of {customers?.length ?? 0} customers owe
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="tap-scale rounded-2xl bg-white px-4 text-[16px] font-bold text-brand-700"
          >
            ＋ New
          </button>
        </div>
        <div className="mt-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Name or phone / नाव" />
        </div>
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon="📒"
          title="No khata customers yet"
          hint="Tap ＋ New to add one with name and phone, or save an udhaar bill."
        />
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-slate-100 last:border-0">
              <button
                onClick={() => go(`khata/${c.id}`)}
                className="tap-scale flex min-w-0 flex-1 items-center justify-between gap-2 py-3 pl-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold">{c.name}</span>
                  <span className="block text-[13px] text-slate-500">{c.phone ?? 'No phone'}</span>
                </span>
                <span
                  className={`shrink-0 text-lg font-bold tabular-nums ${
                    c.balance > 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}
                >
                  {money(c.balance)}
                </span>
              </button>
              <button
                onClick={() => setCollectFor(c)}
                disabled={c.balance <= 0}
                className="tap-scale mr-2 h-11 shrink-0 rounded-xl bg-brand-600 px-3 text-[14px] font-bold text-white disabled:bg-slate-100 disabled:text-slate-300"
              >
                ₹ Collect
              </button>
            </div>
          ))}
        </div>
      )}

      <CollectPad customer={collectFor} onClose={() => setCollectFor(null)} onCollect={onCollect} />

      <CustomerForm
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(c) => {
          setAddOpen(false)
          toast(`${c.name} added`)
          go(`khata/${c.id}`)
        }}
      />
    </div>
  )
}

/**
 * Collection in two taps: "₹ Collect" opens the pad primed with the full balance,
 * then Cash or UPI both enters the mode and saves.
 */
export function CollectPad({
  customer,
  onClose,
  onCollect,
}: {
  customer: Customer | null
  onClose: () => void
  onCollect: (raw: string, mode: 'cash' | 'upi') => void | Promise<void>
}) {
  const balance = customer?.balance ?? 0
  return (
    <NumPad
      open={customer !== null}
      title={customer ? `Collect from ${customer.name}` : ''}
      subtitle={`Balance ${money(balance)}`}
      mode="money"
      initial={balance > 0 ? String(balance / 100) : ''}
      chips={[
        ...(balance > 0
          ? [{ label: `Full ${money(balance)}`, value: balance / 100, instant: false }]
          : []),
        { label: 'Half', value: balance / 200, instant: false },
        { label: '+100', value: 100, kind: 'add' as const },
        { label: '+500', value: 500, kind: 'add' as const },
      ]}
      actions={[
        { key: 'cash', label: '💵 Cash' },
        { key: 'upi', label: '📱 UPI', tone: 'secondary' },
      ]}
      onSubmit={(v, key) => void onCollect(v, key === 'upi' ? 'upi' : 'cash')}
      onClose={onClose}
    />
  )
}
