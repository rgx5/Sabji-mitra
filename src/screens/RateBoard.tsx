import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { copyRatesFrom, lastRateDateBefore, rateMapFor, setRate } from '../db/actions'
import { NumPad, type PadChip } from '../components/NumPad'
import { SearchBar, useToast } from '../components/ui'
import {
  marginPct,
  money,
  moneyShort,
  prettyDate,
  shiftDate,
  today,
  toPaise,
  UNIT_LABEL,
} from '../lib/format'

type Field = 'buy' | 'sell'

export default function RateBoard() {
  const [date, setDate] = useState(today())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ itemId: string; field: Field } | null>(null)
  const { toast } = useToast()

  const items = useLiveQuery(
    async () => (await db.items.toArray()).filter((i) => i.isActive === 1 && i.deletedAt === null),
    [],
  )
  const rates = useLiveQuery(() => rateMapFor(date), [date])
  const prevDate = useLiveQuery(() => lastRateDateBefore(date), [date])
  const prevRates = useLiveQuery(async () => (prevDate ? rateMapFor(prevDate) : new Map()), [prevDate])

  const sorted = useMemo(
    () => (items ?? []).slice().sort((a, b) => b.useCount - a.useCount || a.sortOrder - b.sortOrder),
    [items],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (i) => i.nameEn.toLowerCase().includes(q) || i.nameLocal.includes(query.trim()),
    )
  }, [sorted, query])

  const pricedCount = sorted.filter((i) => (rates?.get(i.id)?.sell ?? 0) > 0).length

  const editItem = editing ? sorted.find((i) => i.id === editing.itemId) : undefined
  const editRates = editing ? rates?.get(editing.itemId) : undefined
  const editPrev = editing ? prevRates?.get(editing.itemId) : undefined

  /** buy → sell on the same item, then the first unpriced field of the next item. */
  const advance = (from: { itemId: string; field: Field }) => {
    if (from.field === 'buy') {
      setEditing({ itemId: from.itemId, field: 'sell' })
      return
    }
    const idx = visible.findIndex((i) => i.id === from.itemId)
    const next = visible[idx + 1]
    setEditing(next ? { itemId: next.id, field: 'buy' } : null)
  }

  const onSubmit = async (raw: string, action?: string) => {
    if (!editing) return
    const paise = toPaise(raw)
    await setRate(editing.itemId, date, editing.field === 'buy' ? { buyRate: paise } : { sellRate: paise })
    // Buy always hands over to sell. On sell, "Save" closes and "Next ↓" walks the list.
    if (editing.field === 'buy' || action === 'next') advance(editing)
    else setEditing(null)
  }

  const onCopyYesterday = async () => {
    const copied = await copyRatesFrom(date)
    toast(
      copied ? `Copied ${copied} rates from ${prettyDate(prevDate ?? '')}` : 'No earlier rates to copy',
      { tone: copied ? 'ok' : 'warn' },
    )
  }

  const chips: PadChip[] = useMemo(() => {
    if (!editing) return []
    const prev = editing.field === 'buy' ? editPrev?.buy : editPrev?.sell
    const out: PadChip[] = []
    if (prev) out.push({ label: `Same as before ${moneyShort(prev)}`, value: prev / 100, instant: false })
    if (editing.field === 'sell' && editRates?.buy) {
      for (const pct of [10, 20, 30]) {
        out.push({
          label: `+${pct}%`,
          value: Math.round((editRates.buy * (1 + pct / 100)) / 100),
          instant: false,
        })
      }
    }
    out.push({ label: '+5', value: 5, kind: 'add' }, { label: '+10', value: 10, kind: 'add' })
    return out
  }, [editing, editPrev, editRates])

  return (
    <div>
      <header className="sticky top-0 z-30 bg-brand-700 px-3 pt-3 pb-3 text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="tap-scale min-h-11 rounded-xl px-3 text-2xl"
            aria-label="Previous day"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-lg font-bold">Rate Board</p>
            <p className="text-[13px] text-brand-100">
              {prettyDate(date)} · {pricedCount}/{sorted.length} priced
            </p>
          </div>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= today()}
            className="tap-scale min-h-11 rounded-xl px-3 text-2xl disabled:opacity-30"
            aria-label="Next day"
          >
            ›
          </button>
        </div>
        <button
          onClick={onCopyYesterday}
          className="tap-scale mt-3 w-full rounded-2xl bg-white text-[16px] font-bold text-brand-700 shadow-sm"
        >
          ⧉ Copy {prevDate ? prettyDate(prevDate).toLowerCase() : 'previous'} rates
        </button>
      </header>

      <div className="px-3 pt-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Find item / वस्तू शोधा" />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[12px] font-semibold tracking-wide text-slate-400 uppercase">
          <span className="flex-1">Item</span>
          <span className="w-20 text-right">Buy</span>
          <span className="w-20 text-right">Sell</span>
          <span className="w-12 text-right">%</span>
        </div>
        {visible.map((item) => {
          const r = rates?.get(item.id)
          const buy = r?.buy ?? 0
          const sell = r?.sell ?? 0
          const pct = marginPct(buy, sell)
          const loss = buy > 0 && sell > 0 && sell < buy
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 last:border-0 ${
                loss ? 'bg-amber-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{item.nameEn}</p>
                <p className="truncate text-[13px] text-slate-500">
                  {item.nameLocal} · per {UNIT_LABEL[item.unit]}
                </p>
              </div>
              <RateCell
                value={buy}
                label={`${item.nameEn} buy rate`}
                onTap={() => setEditing({ itemId: item.id, field: 'buy' })}
              />
              <RateCell
                value={sell}
                strong
                label={`${item.nameEn} sell rate`}
                onTap={() => setEditing({ itemId: item.id, field: 'sell' })}
              />
              <span
                className={`w-12 text-right text-[13px] tabular-nums ${
                  loss ? 'font-bold text-amber-600' : 'text-slate-400'
                }`}
              >
                {loss ? '⚠' : pct === null ? '—' : `${pct}%`}
              </span>
            </div>
          )
        })}
      </div>

      <NumPad
        open={editing !== null}
        title={editItem ? `${editItem.nameEn} · ${editing?.field === 'buy' ? 'Buy' : 'Sell'} rate` : ''}
        subtitle={
          editItem
            ? `${editItem.nameLocal} · per ${UNIT_LABEL[editItem.unit]}${
                editing?.field === 'sell' && editRates?.buy ? ` · buy ${money(editRates.buy)}` : ''
              }`
            : undefined
        }
        mode="money"
        initial={
          editing
            ? ((editing.field === 'buy' ? editRates?.buy : editRates?.sell) || 0) > 0
              ? String(((editing.field === 'buy' ? editRates!.buy : editRates!.sell) / 100).toFixed(2))
                  .replace(/\.00$/, '')
              : ''
            : ''
        }
        sessionKey={editing ? `${editing.itemId}:${editing.field}` : ''}
        chips={chips}
        submitLabel="Next"
        actions={
          editing?.field === 'sell'
            ? [
                { key: 'save', label: 'Save' },
                { key: 'next', label: 'Next ↓', tone: 'secondary' as const },
              ]
            : undefined
        }
        onSubmit={onSubmit}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function RateCell({
  value,
  onTap,
  strong,
  label,
}: {
  value: number
  onTap: () => void
  strong?: boolean
  label: string
}) {
  return (
    <button
      onClick={onTap}
      aria-label={label}
      className={`tap-scale h-11 w-20 rounded-xl text-right text-[15px] tabular-nums ${
        value > 0
          ? strong
            ? 'bg-brand-50 px-2 font-bold text-brand-800'
            : 'bg-slate-50 px-2 font-semibold text-slate-700'
          : 'bg-slate-50 px-2 text-slate-300'
      }`}
    >
      {value > 0 ? moneyShort(value) : '—'}
    </button>
  )
}
