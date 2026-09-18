import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Sheet } from './ui'
import { clockTime, money, moneyShort, prettyDate, qtyLabel, UNIT_LABEL } from '../lib/format'
import { go } from '../lib/router'
import type { Sale } from '../db/types'

/** The full receipt for one bill — every line, every payment part, who it was for. */
export function BillSheet({
  sale,
  onClose,
  onVoid,
}: {
  sale: Sale | null
  onClose: () => void
  onVoid?: (sale: Sale) => void
}) {
  const lines = useLiveQuery(async () => {
    if (!sale) return []
    return (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter(
      (l) => l.deletedAt === null,
    )
  }, [sale?.id])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const customer = useLiveQuery(
    async () => (sale?.customerId ? await db.customers.get(sale.customerId) : undefined),
    [sale?.customerId],
  )
  const nameOf = (id: string) => items?.find((i) => i.id === id)?.nameEn ?? 'Item'

  return (
    <Sheet open={sale !== null} onClose={onClose} label="Bill">
      {sale && (
        <div className="pb-safe px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-bold">Bill #{sale.billNo}</p>
              <p className="text-[14px] text-slate-500">
                {prettyDate(sale.date)} · {clockTime(sale.createdAt)}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
              ✕
            </button>
          </div>

          {customer && (
            <button
              onClick={() => {
                onClose()
                go(`khata/${customer.id}`)
              }}
              className="tap-scale mt-3 flex w-full items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[16px] font-semibold">👤 {customer.name}</span>
                {customer.phone && <span className="block text-[13px] text-slate-500">{customer.phone}</span>}
              </span>
              <span className="text-[14px] font-bold text-slate-500">khata ›</span>
            </button>
          )}

          <div className="mt-3">
            {(lines ?? []).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{nameOf(l.itemId)}</span>
                  <span className="block text-[13px] text-slate-500">
                    {qtyLabel(l.qty, l.unit)} × {moneyShort(l.sellRate)}/{UNIT_LABEL[l.unit]}
                  </span>
                </span>
                <span className="text-[16px] font-bold tabular-nums">{money(l.lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-100 px-4 py-3">
            {sale.discount > 0 && (
              <>
                <Line label="Subtotal" value={money(sale.subtotal)} />
                <Line label="Discount" value={`− ${money(sale.discount)}`} />
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[16px] font-semibold">Total</span>
              <span className="text-2xl font-bold tabular-nums">{money(sale.total)}</span>
            </div>
          </div>

          <div className="mt-2">
            {sale.cashPaid > 0 && <Line label="💵 Cash" value={money(sale.cashPaid)} />}
            {sale.upiPaid > 0 && <Line label="📱 UPI" value={money(sale.upiPaid)} />}
            {sale.creditAmount > 0 && (
              <Line label="📒 Udhaar" value={money(sale.creditAmount)} tone="bad" />
            )}
          </div>

          {onVoid && (
            <button
              onClick={() => onVoid(sale)}
              className="tap-scale mt-4 w-full rounded-2xl bg-rose-50 text-[16px] font-bold text-rose-600"
            >
              Remove this bill
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[15px] text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === 'bad' ? 'text-rose-600' : ''}`}>{value}</span>
    </div>
  )
}
