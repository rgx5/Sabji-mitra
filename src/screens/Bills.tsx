import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { voidPurchase, voidSale } from '../db/actions'
import { BillSheet } from '../components/BillSheet'
import { EmptyState, SearchBar, Sheet, useToast } from '../components/ui'
import {
  clockTime,
  money,
  moneyShort,
  prettyDate,
  qtyLabel,
  today,
  UNIT_LABEL,
} from '../lib/format'
import { go } from '../lib/router'
import type { Purchase, Sale } from '../db/types'

type Tab = 'bills' | 'purchases'
type Range = 'today' | 'week' | 'all'

const RANGE_LABEL: Record<Range, string> = { today: 'Today', week: 'Last 7 days', all: 'All' }

const daysAgo = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return today(d)
}

/** Every bill and every purchase ever saved — searchable, with the full receipt behind one tap. */
export default function Bills() {
  const [tab, setTab] = useState<Tab>('bills')
  const [range, setRange] = useState<Range>('today')
  const [query, setQuery] = useState('')
  const [openSale, setOpenSale] = useState<Sale | null>(null)
  const [openPurchase, setOpenPurchase] = useState<Purchase | null>(null)
  const { toast } = useToast()

  const from = range === 'today' ? today() : range === 'week' ? daysAgo(6) : '0000-00-00'

  const sales = useLiveQuery(
    async () =>
      (await db.sales.where('date').aboveOrEqual(from).toArray())
        .filter((s) => s.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt),
    [from],
  )
  const purchases = useLiveQuery(
    async () =>
      (await db.purchases.where('date').aboveOrEqual(from).toArray())
        .filter((p) => p.deletedAt === null)
        .sort((a, b) => b.createdAt - a.createdAt),
    [from],
  )
  const customers = useLiveQuery(() => db.customers.toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [])
  const customerName = (id: string | null) =>
    id ? (customers?.find((c) => c.id === id)?.name ?? '') : ''
  const supplierName = (id: string | null) =>
    id ? (suppliers?.find((s) => s.id === id)?.name ?? '') : ''

  const visibleSales = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sales ?? []
    return (sales ?? []).filter(
      (s) =>
        String(s.billNo).includes(q) ||
        customerName(s.customerId).toLowerCase().includes(q) ||
        money(s.total).includes(q),
    )
  }, [sales, query, customers])

  const visiblePurchases = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return purchases ?? []
    return (purchases ?? []).filter((p) => supplierName(p.supplierId).toLowerCase().includes(q))
  }, [purchases, query, suppliers])

  const salesTotal = visibleSales.reduce((s, x) => s + x.total, 0)
  const purchaseTotal = visiblePurchases.reduce((s, x) => s + x.total, 0)

  return (
    <div>
      <header className="sticky top-0 z-30 bg-brand-700 px-3 pt-3 pb-3 text-white">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-[13px] text-brand-100">
              {tab === 'bills' ? 'Bills' : 'Purchases'} · {RANGE_LABEL[range].toLowerCase()}
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {money(tab === 'bills' ? salesTotal : purchaseTotal)}
            </p>
            <p className="text-[13px] text-brand-100">
              {tab === 'bills'
                ? `${visibleSales.length} bill${visibleSales.length === 1 ? '' : 's'}`
                : `${visiblePurchases.length} purchase${visiblePurchases.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={() => go(tab === 'bills' ? 'bill' : 'purchase')}
            className="tap-scale rounded-2xl bg-white px-4 text-[16px] font-bold text-brand-700"
          >
            ＋ New
          </button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <Toggle label="🧾 Bills" active={tab === 'bills'} onClick={() => setTab('bills')} />
          <Toggle label="🚚 Purchases" active={tab === 'purchases'} onClick={() => setTab('purchases')} />
        </div>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={tab === 'bills' ? 'Bill no. or customer' : 'Supplier'}
        />
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-3">
        {(['today', 'week', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`tap-scale shrink-0 rounded-2xl px-4 text-[15px] font-bold ${
              range === r ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 shadow-sm'
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {tab === 'bills' ? (
        visibleSales.length === 0 ? (
          <EmptyState
            icon="🧾"
            title={query ? 'No bill matches' : 'No bills yet'}
            hint={query ? undefined : 'Saved bills show up here with the full item list.'}
          />
        ) : (
          <div className="mx-3 overflow-hidden rounded-2xl bg-white shadow-sm">
            {visibleSales.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpenSale(s)}
                className="tap-scale flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-left last:border-0"
              >
                <span className="min-w-0">
                  <span className="block text-[16px] font-semibold">
                    #{s.billNo}
                    {customerName(s.customerId) ? ` · ${customerName(s.customerId)}` : ''}
                  </span>
                  <span className="block truncate text-[13px] text-slate-500">
                    {prettyDate(s.date)} {clockTime(s.createdAt)} · {s.paymentMode}
                    {s.creditAmount > 0 ? ` · udhaar ${moneyShort(s.creditAmount)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[17px] font-bold tabular-nums">{money(s.total)}</span>
              </button>
            ))}
          </div>
        )
      ) : visiblePurchases.length === 0 ? (
        <EmptyState
          icon="🚚"
          title={query ? 'No purchase matches' : 'No purchases yet'}
          hint={query ? undefined : 'Mandi purchases show up here.'}
        />
      ) : (
        <div className="mx-3 overflow-hidden rounded-2xl bg-white shadow-sm">
          {visiblePurchases.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenPurchase(p)}
              className="tap-scale flex w-full items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-left last:border-0"
            >
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold">
                  {supplierName(p.supplierId) || 'Mandi purchase'}
                </span>
                <span className="block truncate text-[13px] text-slate-500">
                  {prettyDate(p.date)} {clockTime(p.createdAt)}
                  {p.dueAmount > 0 ? ` · ${moneyShort(p.dueAmount)} due` : ' · paid'}
                </span>
              </span>
              <span className="shrink-0 text-[17px] font-bold tabular-nums">{money(p.total)}</span>
            </button>
          ))}
        </div>
      )}

      <BillSheet
        sale={openSale}
        onClose={() => setOpenSale(null)}
        onVoid={async (s) => {
          await voidSale(s.id)
          setOpenSale(null)
          toast(`Bill #${s.billNo} removed`)
        }}
      />

      <PurchaseSheet
        purchase={openPurchase}
        supplier={openPurchase ? supplierName(openPurchase.supplierId) : ''}
        onClose={() => setOpenPurchase(null)}
        onVoid={async (p) => {
          await voidPurchase(p.id)
          setOpenPurchase(null)
          toast('Purchase removed')
        }}
      />
    </div>
  )
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`tap-scale rounded-2xl text-[15px] font-bold ${
        active ? 'bg-white text-brand-700' : 'bg-brand-600 text-brand-100'
      }`}
    >
      {label}
    </button>
  )
}

function PurchaseSheet({
  purchase,
  supplier,
  onClose,
  onVoid,
}: {
  purchase: Purchase | null
  supplier: string
  onClose: () => void
  onVoid: (p: Purchase) => void
}) {
  const lines = useLiveQuery(async () => {
    if (!purchase) return []
    return (await db.purchaseItems.where('purchaseId').equals(purchase.id).toArray()).filter(
      (l) => l.deletedAt === null,
    )
  }, [purchase?.id])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const nameOf = (id: string) => items?.find((i) => i.id === id)?.nameEn ?? 'Item'

  return (
    <Sheet open={purchase !== null} onClose={onClose} label="Purchase">
      {purchase && (
        <div className="pb-safe px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold">{supplier || 'Mandi purchase'}</p>
              <p className="text-[14px] text-slate-500">
                {prettyDate(purchase.date)} · {clockTime(purchase.createdAt)}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
              ✕
            </button>
          </div>

          <div className="mt-3">
            {(lines ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{nameOf(l.itemId)}</span>
                  <span className="block text-[13px] text-slate-500">
                    {qtyLabel(l.qty, l.unit)} × {moneyShort(l.buyRate)}/{UNIT_LABEL[l.unit]}
                  </span>
                </span>
                <span className="text-[16px] font-bold tabular-nums">{money(l.lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums">{money(purchase.total)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[15px] text-slate-600">Paid</span>
              <span className="font-semibold tabular-nums">{money(purchase.paidAmount)}</span>
            </div>
            {purchase.dueAmount > 0 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[15px] text-slate-600">Due</span>
                <span className="font-semibold text-amber-700 tabular-nums">{money(purchase.dueAmount)}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => onVoid(purchase)}
            className="tap-scale mt-4 w-full rounded-2xl bg-rose-50 text-[16px] font-bold text-rose-600"
          >
            Remove this purchase
          </button>
        </div>
      )}
    </Sheet>
  )
}
