import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { daySummary, voidSale } from '../db/actions'
import { Card, StatRow, useToast } from '../components/ui'
import { BillSheet } from '../components/BillSheet'
import { clockTime, money, moneyShort, prettyDate, qtyLabel, shiftDate, today } from '../lib/format'
import { go } from '../lib/router'
import type { Sale } from '../db/types'

export default function DayClose() {
  const [date, setDate] = useState(today())
  const [openSale, setOpenSale] = useState<Sale | null>(null)
  const { toast } = useToast()

  const s = useLiveQuery(() => daySummary(date), [date])
  const sales = useLiveQuery(
    async () =>
      (await db.sales.where('date').equals(date).toArray())
        .filter((x) => x.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt),
    [date],
  )
  if (!s) return <div className="p-6 text-center text-slate-400">Loading…</div>

  const marginPctOfSales = s.totalSales > 0 ? Math.round((s.grossMargin / s.totalSales) * 100) : 0

  return (
    <div className="px-3 pb-6">
      <header className="sticky top-0 z-30 -mx-3 mb-3 bg-brand-700 px-3 pt-3 pb-3 text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="tap-scale min-h-11 rounded-xl px-3 text-2xl"
            aria-label="Previous day"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-lg font-bold">Day Close</p>
            <p className="text-[13px] text-brand-100">{prettyDate(date)}</p>
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
      </header>

      <Card className="mb-3 p-4">
        <p className="text-[13px] text-slate-500">Total sales</p>
        <p className="text-4xl font-bold tabular-nums">{money(s.totalSales)}</p>
        <p className="mt-1 text-[14px] text-slate-500">
          {s.billCount} bills · avg {money(s.avgBill)}
        </p>
      </Card>

      <Card className="mb-3">
        <StatRow label="💵 Cash from sales" value={money(s.cashIn)} />
        <StatRow label="📱 UPI received" value={money(s.upiIn)} />
        <StatRow label="📒 Credit given" value={money(s.creditGiven)} tone="bad" />
        <StatRow label="✅ Khata collected" value={money(s.creditCollected)} tone="good" />
        <StatRow label="🚚 Purchase paid" value={money(s.purchaseSpend)} />
        <StatRow label="Cash in hand (est.)" value={money(s.cashInHand)} strong />
      </Card>

      <Card className="mb-3">
        <StatRow
          label="Gross margin"
          value={`${money(s.grossMargin)} · ${marginPctOfSales}%`}
          strong
          tone="good"
        />
        <div className="px-4 pb-3 text-[13px] text-slate-500">
          Σ (sell − buy) × qty on today's bills. Items sold without a buy rate are not counted.
        </div>
      </Card>

      {s.topItems.length > 0 && (
        <Card className="mb-3">
          <p className="px-4 pt-3 text-[13px] font-semibold tracking-wide text-slate-400 uppercase">
            Top items
          </p>
          {s.topItems.map((t) => (
            <StatRow
              key={t.itemId}
              label={`${t.name} · ${qtyLabel(t.qty, t.unit)}`}
              value={money(t.amount)}
            />
          ))}
        </Card>
      )}

      <Card className="mb-3">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-[13px] font-semibold tracking-wide text-slate-400 uppercase">Bills</p>
          <button onClick={() => go('bills')} className="min-h-0 text-[14px] font-bold text-brand-700">
            See all ›
          </button>
        </div>
        {(sales ?? []).length === 0 && (
          <p className="px-4 py-6 text-center text-slate-400">No bills on this day</p>
        )}
        {(sales ?? []).map((b) => (
          <button
            key={b.id}
            onClick={() => setOpenSale(b)}
            className="tap-scale flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0"
          >
            <span>
              <span className="block text-[16px] font-semibold">#{b.billNo}</span>
              <span className="block text-[13px] text-slate-500">
                {clockTime(b.createdAt)} · {b.paymentMode}
                {b.creditAmount > 0 ? ` · udhaar ${moneyShort(b.creditAmount)}` : ''}
              </span>
            </span>
            <span className="text-[17px] font-bold tabular-nums">{money(b.total)}</span>
          </button>
        ))}
      </Card>

      <button
        onClick={() => go('purchase')}
        className="tap-scale w-full rounded-2xl bg-white text-[16px] font-bold text-slate-600 shadow-sm"
      >
        ＋ Add a purchase
      </button>

      <BillSheet
        sale={openSale}
        onClose={() => setOpenSale(null)}
        onVoid={async (b) => {
          await voidSale(b.id)
          setOpenSale(null)
          toast(`Bill #${b.billNo} removed`)
        }}
      />

    </div>
  )
}
