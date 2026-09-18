import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { collectPayment, updateCustomer, voidPayment, voidSale } from '../db/actions'
import { CollectPad } from './Khata'
import { Sheet, useToast } from '../components/ui'
import { clockTime, money, prettyDate, qtyLabel, moneyShort, toPaise } from '../lib/format'
import { back } from '../lib/router'
import type { Customer, SaleItem } from '../db/types'

type Entry = {
  id: string
  kind: 'sale' | 'payment'
  date: string
  at: number
  label: string
  detail: string
  delta: number // + increases what they owe
  balanceAfter: number
}

export default function CustomerDetail({ customerId }: { customerId: string }) {
  const [collectOpen, setCollectOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<Entry | null>(null)
  const { toast } = useToast()

  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId])
  const entries = useLiveQuery(async () => {
    const [sales, payments] = await Promise.all([
      db.sales.where('customerId').equals(customerId).toArray(),
      db.payments.where('customerId').equals(customerId).toArray(),
    ])
    const rows: Omit<Entry, 'balanceAfter'>[] = []
    for (const s of sales) {
      if (s.deletedAt !== null) continue
      rows.push({
        id: s.id,
        kind: 'sale',
        date: s.date,
        at: s.createdAt,
        label: `Bill #${s.billNo}`,
        detail:
          s.creditAmount > 0 && s.creditAmount < s.total
            ? `${money(s.total)} bill · ${money(s.total - s.creditAmount)} paid`
            : `${money(s.total)} bill`,
        delta: s.creditAmount,
      })
    }
    for (const p of payments) {
      if (p.deletedAt !== null) continue
      rows.push({
        id: p.id,
        kind: 'payment',
        date: p.date,
        at: p.createdAt,
        label: p.mode === 'upi' ? 'Paid by UPI' : 'Paid cash',
        detail: p.note ?? '',
        delta: -p.amount,
      })
    }
    rows.sort((a, b) => a.at - b.at)
    let running = 0
    return rows.map((r) => {
      running += r.delta
      return { ...r, balanceAfter: running }
    })
  }, [customerId])

  const saleLines = useLiveQuery(async () => {
    if (!detailFor || detailFor.kind !== 'sale') return [] as SaleItem[]
    const lines = await db.saleItems.where('saleId').equals(detailFor.id).toArray()
    return lines.filter((l) => l.deletedAt === null)
  }, [detailFor])

  const items = useLiveQuery(() => db.items.toArray(), [])
  const itemName = useMemo(() => new Map((items ?? []).map((i) => [i.id, i.nameEn])), [items])

  if (!customer) return <div className="p-6 text-center text-slate-400">Loading…</div>

  const onCollect = async (raw: string, mode: 'cash' | 'upi') => {
    const amount = toPaise(raw)
    if (amount <= 0) return
    await collectPayment(customer.id, amount, mode)
    setCollectOpen(false)
    toast(`${money(amount)} received from ${customer.name}`)
  }

  const removeEntry = async (entry: Entry) => {
    if (entry.kind === 'sale') await voidSale(entry.id)
    else await voidPayment(entry.id)
    setDetailFor(null)
    toast('Entry removed')
  }

  return (
    <div>
      <header className="sticky top-0 z-30 bg-brand-700 px-3 pt-3 pb-3 text-white">
        <div className="flex items-center gap-2">
          <button onClick={back} aria-label="Back" className="tap-scale rounded-xl px-2 text-2xl">
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{customer.name}</p>
            <p className="text-[13px] text-brand-100">{customer.phone ?? 'No phone'}</p>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="tap-scale rounded-xl bg-brand-600 px-3 text-[14px] font-bold"
          >
            Edit
          </button>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[13px] text-brand-100">Balance</p>
            <p className="text-3xl font-bold tabular-nums">{money(customer.balance)}</p>
            {customer.creditLimit ? (
              <p className="text-[12px] text-brand-100">Limit {money(customer.creditLimit)}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="tap-scale flex h-12 items-center rounded-2xl bg-brand-600 px-4 text-[16px] font-bold"
              >
                📞
              </a>
            )}
            <button
              onClick={() => setCollectOpen(true)}
              className="tap-scale rounded-2xl bg-white px-5 text-[16px] font-bold text-brand-700"
            >
              ₹ Collect
            </button>
          </div>
        </div>
      </header>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        {(entries ?? []).length === 0 && (
          <p className="px-4 py-10 text-center text-slate-400">No entries yet</p>
        )}
        {(entries ?? []).map((e) => (
          <button
            key={e.id}
            onClick={() => setDetailFor(e)}
            className="tap-scale flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 text-left last:border-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold">{e.label}</span>
              <span className="block text-[13px] text-slate-500">
                {prettyDate(e.date)} {clockTime(e.at)} · {e.detail}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`block text-[16px] font-bold tabular-nums ${
                  e.delta > 0 ? 'text-rose-600' : 'text-brand-700'
                }`}
              >
                {e.delta > 0 ? '+' : '−'}
                {money(Math.abs(e.delta))}
              </span>
              <span className="block text-[12px] text-slate-400 tabular-nums">
                bal {money(e.balanceAfter)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <CollectPad
        customer={collectOpen ? customer : null}
        onClose={() => setCollectOpen(false)}
        onCollect={onCollect}
      />

      <Sheet open={detailFor !== null} onClose={() => setDetailFor(null)} label="Entry">
        {detailFor && (
          <div className="pb-safe px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
            <p className="text-xl font-bold">{detailFor.label}</p>
            <p className="mb-3 text-[14px] text-slate-500">
              {prettyDate(detailFor.date)} {clockTime(detailFor.at)} · {detailFor.detail}
            </p>
            {detailFor.kind === 'sale' &&
              (saleLines ?? []).map((l) => (
                <div key={l.id} className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-[15px]">
                    {itemName.get(l.itemId) ?? 'Item'}{' '}
                    <span className="text-slate-500">
                      {qtyLabel(l.qty, l.unit)} × {moneyShort(l.sellRate)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(l.lineTotal)}</span>
                </div>
              ))}
            <button
              onClick={() => void removeEntry(detailFor)}
              className="tap-scale mt-4 w-full rounded-2xl bg-rose-50 text-[16px] font-bold text-rose-600"
            >
              Remove this entry
            </button>
          </div>
        )}
      </Sheet>

      <EditCustomerSheet
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          toast('Saved')
        }}
      />
    </div>
  )
}

function EditCustomerSheet({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean
  customer: Customer
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(customer.name)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [limit, setLimit] = useState(customer.creditLimit ? String(customer.creditLimit / 100) : '')
  const [notes, setNotes] = useState(customer.notes ?? '')

  const save = async () => {
    await updateCustomer(customer.id, {
      name: name.trim() || customer.name,
      phone: phone.trim() || undefined,
      creditLimit: limit ? toPaise(limit) : undefined,
      notes: notes.trim() || undefined,
    })
    onSaved()
  }

  return (
    <Sheet open={open} onClose={onClose} label="Edit customer">
      <div className="pb-safe space-y-2 px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
        <p className="text-xl font-bold">Edit customer</p>
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
        <Field label="Credit limit (₹)" value={limit} onChange={setLimit} type="number" />
        <Field label="Note" value={notes} onChange={setNotes} />
        <button
          onClick={() => void save()}
          className="tap-scale mt-2 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white"
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500"
      />
    </label>
  )
}
