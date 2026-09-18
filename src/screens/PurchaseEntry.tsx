import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addSupplier, commitPurchase, rateMapFor, updateSupplier } from '../db/actions'
import { NumPad } from '../components/NumPad'
import { Sheet, SearchBar, useToast } from '../components/ui'
import { FormField } from '../components/CustomerForm'
import {
  isWeighed,
  lineTotal,
  money,
  moneyShort,
  prettyDate,
  qtyLabel,
  shiftDate,
  today,
  toPaise,
  toQty,
  UNIT_LABEL,
} from '../lib/format'
import type { Item, Unit } from '../db/types'

interface Line {
  itemId: string
  nameEn: string
  nameLocal: string
  unit: Unit
  qty: number
  buyRate: number
}

export default function PurchaseEntry() {
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState<Line[]>([])
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [updateRates, setUpdateRates] = useState(true)
  const [pickOpen, setPickOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [qtyFor, setQtyFor] = useState<{ item: Item; index: number } | null>(null)
  const [ratePad, setRatePad] = useState<{ item: Item; qty: number; index: number } | null>(null)
  const [paidPad, setPaidPad] = useState(false)
  const [paid, setPaid] = useState<number | null>(null)
  const { toast } = useToast()

  const items = useLiveQuery(
    async () => (await db.items.toArray()).filter((i) => i.isActive === 1 && i.deletedAt === null),
    [],
  )
  const rates = useLiveQuery(() => rateMapFor(date), [date])
  const suppliers = useLiveQuery(
    async () => (await db.suppliers.toArray()).filter((s) => s.deletedAt === null),
    [],
  )
  const supplier = suppliers?.find((s) => s.id === supplierId) ?? null

  const total = lines.reduce((s, l) => s + lineTotal(l.qty, l.buyRate, l.unit), 0)
  const paidAmount = paid === null ? total : Math.min(paid, total)
  const due = Math.max(0, total - paidAmount)

  const onPickItem = (item: Item) => {
    setPickOpen(false)
    setQtyFor({ item, index: lines.findIndex((l) => l.itemId === item.id) })
  }

  const onQty = (raw: string) => {
    if (!qtyFor) return
    const { item, index } = qtyFor
    const qty = toQty(raw, item.unit)
    const known = index >= 0 ? lines[index].buyRate : (rates?.get(item.id)?.buy ?? 0)
    setQtyFor(null)
    if (known > 0) {
      upsert({ item, qty, buyRate: known, index })
    } else {
      setRatePad({ item, qty, index })
    }
  }

  const upsert = ({
    item,
    qty,
    buyRate,
    index,
  }: {
    item: Item
    qty: number
    buyRate: number
    index: number
  }) => {
    const line: Line = {
      itemId: item.id,
      nameEn: item.nameEn,
      nameLocal: item.nameLocal,
      unit: item.unit,
      qty,
      buyRate,
    }
    setLines((prev) => {
      if (index >= 0) {
        const next = prev.slice()
        next[index] = line
        return next
      }
      return [...prev, line]
    })
  }

  const save = async () => {
    if (lines.length === 0) return
    await commitPurchase({
      date,
      supplierId,
      lines: lines.map((l) => ({ itemId: l.itemId, unit: l.unit, qty: l.qty, buyRate: l.buyRate })),
      paidAmount,
      updateRates,
    })
    toast(`Purchase ${money(total)} saved${updateRates ? ' · buy rates updated' : ''}`)
    setLines([])
    setPaid(null)
    setSupplierId(null)
  }

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
            <p className="text-lg font-bold">Purchase</p>
            <p className="text-[13px] text-brand-100">{prettyDate(date)} · mandi</p>
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
          onClick={() => setSupplierOpen(true)}
          className="tap-scale mt-3 w-full rounded-2xl bg-brand-600 px-4 text-left text-[15px] font-bold"
        >
          🚚 {supplier ? supplier.name : 'Supplier (optional)'}
        </button>
      </header>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        {lines.length === 0 && (
          <p className="px-4 py-8 text-center text-slate-400">No items added yet</p>
        )}
        {lines.map((l, i) => (
          <div key={l.itemId} className="flex items-center gap-2 border-b border-slate-100 last:border-0">
            <button
              onClick={() => {
                const item = items?.find((it) => it.id === l.itemId)
                if (item) setQtyFor({ item, index: i })
              }}
              className="tap-scale flex min-w-0 flex-1 items-center justify-between gap-2 py-3 pl-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-semibold">{l.nameEn}</span>
                <span className="block text-[13px] text-slate-500">
                  {qtyLabel(l.qty, l.unit)} × {moneyShort(l.buyRate)}/{UNIT_LABEL[l.unit]}
                </span>
              </span>
              <span className="text-[16px] font-bold tabular-nums">
                {money(lineTotal(l.qty, l.buyRate, l.unit))}
              </span>
            </button>
            <button
              onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${l.nameEn}`}
              className="tap-scale mr-1 h-11 px-3 text-xl text-slate-300"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setPickOpen(true)}
          className="tap-scale w-full rounded-b-2xl bg-slate-50 text-[16px] font-bold text-brand-700"
        >
          ＋ Add item
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[15px] text-slate-600">Total</span>
          <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          <PayChip label="Paid full" active={paid === null || paid >= total} onClick={() => setPaid(null)} />
          <PayChip label="Unpaid" active={paid === 0} onClick={() => setPaid(0)} />
          <PayChip
            label={paid !== null && paid > 0 && paid < total ? money(paid) : 'Part paid'}
            active={paid !== null && paid > 0 && paid < total}
            onClick={() => setPaidPad(true)}
          />
        </div>
        {due > 0 && (
          <p className="px-4 pb-3 text-[14px] font-semibold text-amber-700">
            {money(due)} due{supplier ? ` to ${supplier.name}` : ' — add a supplier to track it'}
          </p>
        )}
        <button
          onClick={() => setUpdateRates((v) => !v)}
          className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-3 text-left"
        >
          <span className="text-[15px] text-slate-600">Update today's buy rates from this purchase</span>
          <span
            className={`ml-3 flex h-7 w-12 shrink-0 items-center rounded-full px-1 ${
              updateRates ? 'justify-end bg-brand-600' : 'justify-start bg-slate-300'
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-white" />
          </span>
        </button>
      </div>

      <div className="px-3 py-3">
        <button
          onClick={() => void save()}
          disabled={lines.length === 0}
          className="tap-scale w-full rounded-2xl bg-brand-600 py-4 text-lg font-bold text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400"
        >
          Save purchase
        </button>

      </div>

      <ItemPicker
        open={pickOpen}
        items={items ?? []}
        rateFor={(id) => rates?.get(id)?.buy ?? 0}
        onPick={onPickItem}
        onClose={() => setPickOpen(false)}
      />

      <NumPad
        open={qtyFor !== null}
        title={qtyFor?.item.nameEn ?? ''}
        subtitle={qtyFor ? `Quantity bought · ${qtyFor.item.nameLocal}` : undefined}
        mode={qtyFor && isWeighed(qtyFor.item.unit) ? 'weight' : 'count'}
        unit={qtyFor?.item.unit}
        rate={qtyFor ? (rates?.get(qtyFor.item.id)?.buy ?? 0) : 0}
        initial={qtyFor && qtyFor.index >= 0 ? String(lines[qtyFor.index].qty / (isWeighed(lines[qtyFor.index].unit) ? 1000 : 1)) : ''}
        chips={
          qtyFor && isWeighed(qtyFor.item.unit)
            ? [
                { label: '5 kg', value: 5, instant: false },
                { label: '10 kg', value: 10, instant: false },
                { label: '20 kg', value: 20, instant: false },
                { label: '50 kg', value: 50, instant: false },
              ]
            : [
                { label: '10', value: 10, instant: false },
                { label: '25', value: 25, instant: false },
                { label: '50', value: 50, instant: false },
              ]
        }
        sessionKey={qtyFor ? `${qtyFor.item.id}:${qtyFor.index}` : ''}
        submitLabel="Next"
        onSubmit={onQty}
        onClose={() => setQtyFor(null)}
      />

      <NumPad
        open={ratePad !== null}
        title={ratePad ? `Buy rate · ${ratePad.item.nameEn}` : ''}
        subtitle={ratePad ? `Per ${UNIT_LABEL[ratePad.item.unit]}` : undefined}
        mode="money"
        sessionKey={ratePad?.item.id ?? ''}
        submitLabel="Add"
        onSubmit={(v) => {
          if (!ratePad) return
          upsert({ item: ratePad.item, qty: ratePad.qty, buyRate: toPaise(v), index: ratePad.index })
          setRatePad(null)
        }}
        onClose={() => setRatePad(null)}
      />

      <NumPad
        open={paidPad}
        title="Amount paid"
        subtitle={`Purchase ${money(total)}`}
        mode="money"
        chips={[{ label: `Full ${money(total)}`, value: total / 100, instant: false }]}
        submitLabel="Set"
        onSubmit={(v) => {
          setPaid(Math.min(toPaise(v), total))
          setPaidPad(false)
        }}
        onClose={() => setPaidPad(false)}
      />

      <SupplierPicker
        open={supplierOpen}
        suppliers={(suppliers ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          balance: s.balance,
        }))}
        onPick={(id) => {
          setSupplierId(id)
          setSupplierOpen(false)
        }}
        onClose={() => setSupplierOpen(false)}
      />
    </div>
  )
}

function PayChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`tap-scale rounded-2xl text-[15px] font-bold ${
        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

export function ItemPicker({
  open,
  items,
  rateFor,
  onPick,
  onClose,
  title = 'Pick item',
}: {
  open: boolean
  items: Item[]
  rateFor: (id: string) => number
  onPick: (item: Item) => void
  onClose: () => void
  title?: string
}) {
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = items.slice().sort((a, b) => b.useCount - a.useCount || a.sortOrder - b.sortOrder)
    if (!q) return all
    return all.filter((i) => i.nameEn.toLowerCase().includes(q) || i.nameLocal.includes(query.trim()))
  }, [items, query])

  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl font-bold">{title}</p>
          <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
            ✕
          </button>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Find item / वस्तू शोधा" />
        <div className="mt-3 grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
          {list.map((i) => (
            <button
              key={i.id}
              onClick={() => onPick(i)}
              className="tap-scale flex h-20 flex-col items-center justify-center rounded-2xl bg-slate-50 px-1 text-center"
            >
              <span className="line-clamp-2 text-[13px] leading-tight font-bold">{i.nameEn}</span>
              <span className="text-[12px] text-slate-500">{i.nameLocal}</span>
              <span className="text-[12px] font-bold text-brand-700 tabular-nums">
                {rateFor(i.id) > 0 ? moneyShort(rateFor(i.id)) : '—'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function SupplierPicker({
  open,
  suppliers,
  onPick,
  onClose,
}: {
  open: boolean
  suppliers: Array<{ id: string; name: string; phone?: string; balance: number }>
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<null | { id?: string; name: string; phone: string }>(null)
  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
  const exact = filtered.some((s) => s.name.toLowerCase() === query.trim().toLowerCase())

  const saveForm = async () => {
    if (!form || !form.name.trim()) return
    if (form.id) {
      await updateSupplier(form.id, { name: form.name.trim(), phone: form.phone.trim() || undefined })
      setForm(null)
      onPick(form.id)
    } else {
      const id = await addSupplier(form.name.trim(), form.phone.trim() || undefined)
      setForm(null)
      setQuery('')
      onPick(id)
    }
  }

  return (
    <>
    <Sheet open={open && form === null} onClose={onClose} label="Supplier">
      <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl font-bold">Supplier</p>
          <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
            ✕
          </button>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Supplier name" />
        <div className="mt-3 max-h-[45vh] overflow-y-auto">
          {query.trim() && !exact && (
            <button
              onClick={() => setForm({ name: query.trim(), phone: '' })}
              className="tap-scale mb-2 w-full rounded-2xl bg-brand-600 px-4 py-3 text-left text-[17px] font-bold text-white"
            >
              ＋ Add “{query.trim()}” with phone
            </button>
          )}
          <button
            onClick={() => onPick(null)}
            className="tap-scale w-full border-b border-slate-100 py-3 text-left text-[17px] font-semibold text-slate-500"
          >
            No supplier
          </button>
          {filtered.map((s) => (
            <div key={s.id} className="flex items-center gap-2 border-b border-slate-100 last:border-0">
              <button
                onClick={() => onPick(s.id)}
                className="tap-scale flex min-w-0 flex-1 items-center justify-between py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold">{s.name}</span>
                  <span className="block text-[13px] text-slate-500">{s.phone ?? 'No phone'}</span>
                </span>
                {s.balance > 0 && (
                  <span className="text-[15px] font-bold text-amber-700 tabular-nums">
                    due {money(s.balance)}
                  </span>
                )}
              </button>
              <button
                onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone ?? '' })}
                aria-label={`Edit ${s.name}`}
                className="tap-scale h-11 px-3 text-[14px] font-bold text-slate-400"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>
    </Sheet>

    <Sheet open={form !== null} onClose={() => setForm(null)} label="Supplier details">
      {form && (
        <div className="pb-safe space-y-3 px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
          <p className="text-xl font-bold">{form.id ? 'Edit supplier' : 'New supplier'}</p>
          <FormField
            label="Name / नाव *"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Mandi trader"
            autoFocus
          />
          <FormField
            label="Phone / फोन"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            type="tel"
            inputMode="tel"
            placeholder="98xxxxxxxx"
          />
          <button
            onClick={() => void saveForm()}
            className="tap-scale w-full rounded-2xl bg-brand-600 text-lg font-bold text-white"
          >
            {form.id ? 'Save' : 'Add supplier'}
          </button>
        </div>
      )}
    </Sheet>
    </>
  )
}
