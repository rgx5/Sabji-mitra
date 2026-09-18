import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { commitSale, rateMapFor, setRate, voidSale } from '../db/actions'
import { NumPad, type PadChip } from '../components/NumPad'
import { CustomerPicker } from '../components/CustomerPicker'
import { Sheet, SearchBar, useToast } from '../components/ui'
import {
  isWeighed,
  lineTotal,
  money,
  moneyShort,
  qtyLabel,
  toPaise,
  toQty,
  today,
  UNIT_LABEL,
} from '../lib/format'
import { go } from '../lib/router'
import type { CartLine, Customer, Item, PaymentMode, Unit } from '../db/types'

const qtyChips = (unit: Unit): PadChip[] =>
  isWeighed(unit)
    ? [
        { label: '250 g', value: 0.25 },
        { label: '½ kg', value: 0.5 },
        { label: '750 g', value: 0.75 },
        { label: '1 kg', value: 1 },
        { label: '2 kg', value: 2 },
        { label: '5 kg', value: 5 },
      ]
    : unit === 'dozen'
      ? [
          { label: '½ dz', value: 0.5 },
          { label: '1 dz', value: 1 },
          { label: '2 dz', value: 2 },
        ]
      : [
          { label: '1', value: 1 },
          { label: '2', value: 2 },
          { label: '5', value: 5 },
          { label: '10', value: 10 },
        ]

export default function QuickBill() {
  const [lines, setLines] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState(0)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [query, setQuery] = useState('')
  const [pad, setPad] = useState<{ item: Item; index: number } | null>(null)
  const [ratePadItem, setRatePadItem] = useState<Item | null>(null)
  const [pickerMode, setPickerMode] = useState<null | 'credit' | 'attach' | 'split'>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [discountPad, setDiscountPad] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const { toast } = useToast()

  const date = today()
  const items = useLiveQuery(
    async () => (await db.items.toArray()).filter((i) => i.isActive === 1 && i.deletedAt === null),
    [],
  )
  const rates = useLiveQuery(() => rateMapFor(date), [date])
  const settings = useLiveQuery(() => getSettings(), [])

  const sorted = useMemo(() => {
    const withRate = (i: Item) => ((rates?.get(i.id)?.sell ?? 0) > 0 ? 0 : 1)
    return (items ?? [])
      .slice()
      .sort((a, b) => withRate(a) - withRate(b) || b.useCount - a.useCount || a.sortOrder - b.sortOrder)
  }, [items, rates])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((i) => i.nameEn.toLowerCase().includes(q) || i.nameLocal.includes(query.trim()))
  }, [sorted, query])

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  const total = Math.max(0, subtotal - discount)
  const qtyInCart = (itemId: string) => lines.find((l) => l.itemId === itemId)

  /* ---------- adding to the cart ---------- */

  const openPadFor = (item: Item) => {
    const sell = rates?.get(item.id)?.sell ?? 0
    if (sell <= 0) {
      setRatePadItem(item) // no rate today — ask once, then continue straight to qty
      return
    }
    setPad({ item, index: lines.findIndex((l) => l.itemId === item.id) })
  }

  const onQtySubmit = (raw: string) => {
    if (!pad) return
    const { item, index } = pad
    const r = rates?.get(item.id)
    const qty = toQty(raw, item.unit)
    const line: CartLine = {
      itemId: item.id,
      nameEn: item.nameEn,
      nameLocal: item.nameLocal,
      unit: item.unit,
      qty,
      sellRate: r?.sell ?? 0,
      buyRate: r?.buy ?? 0,
      lineTotal: lineTotal(qty, r?.sell ?? 0, item.unit),
    }
    setLines((prev) => {
      if (index >= 0) {
        const next = prev.slice()
        next[index] = line
        return next
      }
      return [...prev, line]
    })
    setPad(null)
  }

  const removeLine = () => {
    if (!pad || pad.index < 0) return setPad(null)
    setLines((prev) => prev.filter((_, i) => i !== pad.index))
    setPad(null)
  }

  const onRateSubmit = async (raw: string) => {
    if (!ratePadItem) return
    await setRate(ratePadItem.id, date, { sellRate: toPaise(raw) })
    const item = ratePadItem
    setRatePadItem(null)
    setPad({ item, index: lines.findIndex((l) => l.itemId === item.id) })
  }

  /* ---------- checkout ---------- */

  const clear = () => {
    setLines([])
    setDiscount(0)
    setCustomer(null)
  }

  const save = async (
    mode: PaymentMode,
    parts: { cash: number; upi: number; credit: number },
    who: Customer | null,
  ) => {
    const { saleId, billNo } = await commitSale({
      lines,
      discount,
      paymentMode: mode,
      cashPaid: parts.cash,
      upiPaid: parts.upi,
      creditAmount: parts.credit,
      customerId: who?.id ?? null,
      date,
    })
    const saved = total
    clear()
    setCartOpen(false)
    setSplitOpen(false)
    toast(`Bill #${billNo} · ${money(saved)} saved`, {
      actionLabel: 'Undo',
      action: () => void voidSale(saleId),
    })
    if (who && parts.credit > 0) {
      const fresh = await db.customers.get(who.id)
      if (fresh?.creditLimit && fresh.balance > fresh.creditLimit) {
        toast(`${fresh.name} is over the ${money(fresh.creditLimit)} limit`, { tone: 'warn' })
      }
    }
  }

  const payCash = () => void save('cash', { cash: total, upi: 0, credit: 0 }, customer)
  const payUpi = () => void save('upi', { cash: 0, upi: total, credit: 0 }, customer)
  const payCredit = () => {
    if (customer) return void save('credit', { cash: 0, upi: 0, credit: total }, customer)
    setPickerMode('credit')
  }

  const onPickCustomer = (c: Customer) => {
    const mode = pickerMode
    setPickerMode(null)
    setCustomer(c)
    if (mode === 'credit') void save('credit', { cash: 0, upi: 0, credit: total }, c)
  }

  const disabled = lines.length === 0

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-brand-700 px-3 pt-3 pb-2 text-white">
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={() => go('rates')}
            className="tap-scale min-h-10 rounded-xl bg-brand-600 px-3 text-[13px] font-bold"
          >
            📋 Rates
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">
            {settings?.shopName ?? 'Sabji Mitra'}
          </p>
          <button
            onClick={() => (customer ? setCustomer(null) : setPickerMode('attach'))}
            className="tap-scale min-h-10 max-w-[40%] truncate rounded-xl bg-brand-600 px-3 text-[13px] font-bold"
          >
            {customer ? `👤 ${customer.name} ✕` : '👤 Customer'}
          </button>
        </div>
        <SearchBar value={query} onChange={setQuery} placeholder="Find item / वस्तू शोधा" />
      </header>

      <div className="grid flex-1 grid-cols-3 content-start gap-2 p-2 pb-44">
        {visible.map((item) => {
          const sell = rates?.get(item.id)?.sell ?? 0
          const inCart = qtyInCart(item.id)
          return (
            <button
              key={item.id}
              aria-label={item.nameEn}
              onClick={() => openPadFor(item)}
              className={`tap-scale relative flex h-24 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center shadow-sm ${
                inCart ? 'bg-brand-600 text-white' : sell > 0 ? 'bg-white' : 'bg-white/60'
              }`}
            >
              <span className="line-clamp-2 text-[14px] leading-tight font-bold">{item.nameEn}</span>
              <span
                className={`line-clamp-1 text-[12px] ${inCart ? 'text-brand-100' : 'text-slate-500'}`}
              >
                {item.nameLocal}
              </span>
              <span
                className={`text-[13px] font-bold tabular-nums ${
                  inCart ? 'text-white' : sell > 0 ? 'text-brand-700' : 'text-amber-600'
                }`}
              >
                {sell > 0 ? `${moneyShort(sell)}/${UNIT_LABEL[item.unit]}` : 'set rate'}
              </span>
              {inCart && (
                <span className="absolute top-1 right-1 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                  {qtyLabel(inCart.qty, inCart.unit)}
                </span>
              )}
            </button>
          )
        })}
        {visible.length === 0 && (
          <p className="col-span-3 py-10 text-center text-slate-400">No item matches “{query}”</p>
        )}
      </div>

      {/* Checkout bar — one tap per payment mode, always visible. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-slate-200 bg-white px-2 pt-2">
        <button
          onClick={() => setCartOpen(true)}
          disabled={disabled}
          className="tap-scale mb-2 flex w-full items-center justify-between rounded-2xl bg-slate-100 px-4 py-2 disabled:opacity-60"
        >
          <span className="text-[15px] font-semibold text-slate-600">
            {lines.length === 0
              ? 'Tap an item to start'
              : `${lines.length} item${lines.length > 1 ? 's' : ''}${discount ? ` · −${money(discount)}` : ''} ▸`}
          </span>
          <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
        </button>
        <div className="grid grid-cols-4 gap-2">
          <PayButton label="Cash" icon="💵" onClick={payCash} disabled={disabled} primary />
          <PayButton label="UPI" icon="📱" onClick={payUpi} disabled={disabled} />
          <PayButton label="Udhaar" icon="📒" onClick={payCredit} disabled={disabled} />
          <PayButton label="Split" icon="⋯" onClick={() => setSplitOpen(true)} disabled={disabled} />
        </div>
        <nav className="flex justify-around pt-1">
          {[
            ['khata', 'Khata'],
            ['day', 'Day'],
            ['more', 'More'],
          ].map(([path, label]) => (
            <button
              key={path}
              onClick={() => go(path)}
              className="min-h-9 px-3 text-[12px] font-semibold text-slate-400"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* qty keypad */}
      <NumPad
        open={pad !== null}
        title={pad?.item.nameEn ?? ''}
        subtitle={
          pad
            ? `${pad.item.nameLocal} · ${moneyShort(rates?.get(pad.item.id)?.sell ?? 0)}/${UNIT_LABEL[pad.item.unit]}`
            : undefined
        }
        mode={pad && isWeighed(pad.item.unit) ? 'weight' : 'count'}
        unit={pad?.item.unit}
        rate={pad ? (rates?.get(pad.item.id)?.sell ?? 0) : 0}
        chips={pad ? qtyChips(pad.item.unit) : []}
        initial={pad && pad.index >= 0 ? qtyText(lines[pad.index]) : ''}
        sessionKey={pad ? `${pad.item.id}:${pad.index}` : ''}
        submitLabel={pad && pad.index >= 0 ? 'Update' : 'Add'}
        destructiveLabel={pad && pad.index >= 0 ? 'Remove from bill' : undefined}
        onDestructive={pad && pad.index >= 0 ? removeLine : undefined}
        onSubmit={onQtySubmit}
        onClose={() => setPad(null)}
      />

      {/* missing-rate keypad */}
      <NumPad
        open={ratePadItem !== null}
        title={ratePadItem ? `Today's rate · ${ratePadItem.nameEn}` : ''}
        subtitle={ratePadItem ? `Sell rate per ${UNIT_LABEL[ratePadItem.unit]}` : undefined}
        mode="money"
        sessionKey={ratePadItem?.id ?? ''}
        submitLabel="Set"
        onSubmit={(v) => void onRateSubmit(v)}
        onClose={() => setRatePadItem(null)}
      />

      {/* discount keypad */}
      <NumPad
        open={discountPad}
        title="Discount"
        subtitle={`Bill ${money(subtotal)}`}
        mode="money"
        initial={discount ? String(discount / 100) : ''}
        submitLabel="Apply"
        onSubmit={(v) => {
          setDiscount(Math.min(toPaise(v), subtotal))
          setDiscountPad(false)
        }}
        onClose={() => setDiscountPad(false)}
      />

      <CustomerPicker
        open={pickerMode !== null}
        title={pickerMode === 'credit' ? `Udhaar · ${money(total)}` : 'Attach customer'}
        onPick={onPickCustomer}
        onClose={() => setPickerMode(null)}
      />

      <CartSheet
        open={cartOpen}
        lines={lines}
        subtotal={subtotal}
        discount={discount}
        total={total}
        customer={customer}
        onClose={() => setCartOpen(false)}
        onEdit={(index) => {
          const item = items?.find((i) => i.id === lines[index].itemId)
          if (item) {
            setCartOpen(false)
            setPad({ item, index })
          }
        }}
        onDiscount={() => setDiscountPad(true)}
        onClear={() => {
          clear()
          setCartOpen(false)
        }}
      />

      <SplitSheet
        open={splitOpen}
        total={total}
        customer={customer}
        onClose={() => setSplitOpen(false)}
        onPickCustomer={() => {
          setSplitOpen(false)
          setPickerMode('split')
        }}
        onSave={(parts) => void save('split', parts, customer)}
      />
    </div>
  )
}

const qtyText = (line: CartLine): string =>
  isWeighed(line.unit) ? String(line.qty / 1000) : String(line.qty)

function PayButton({
  label,
  icon,
  onClick,
  disabled,
  primary,
}: {
  label: string
  icon: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`tap-scale flex h-14 flex-col items-center justify-center rounded-2xl text-[13px] font-bold shadow-sm disabled:opacity-40 ${
        primary ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  )
}

function CartSheet({
  open,
  lines,
  subtotal,
  discount,
  total,
  customer,
  onClose,
  onEdit,
  onDiscount,
  onClear,
}: {
  open: boolean
  lines: CartLine[]
  subtotal: number
  discount: number
  total: number
  customer: Customer | null
  onClose: () => void
  onEdit: (index: number) => void
  onDiscount: () => void
  onClear: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Bill">
      <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xl font-bold">This bill{customer ? ` · ${customer.name}` : ''}</p>
          <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
            ✕
          </button>
        </div>
        <div className="max-h-[45vh] overflow-y-auto">
          {lines.map((l, i) => (
            <button
              key={l.itemId}
              onClick={() => onEdit(i)}
              className="tap-scale flex w-full items-center justify-between gap-2 border-b border-slate-100 py-3 text-left last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-semibold">{l.nameEn}</span>
                <span className="block text-[13px] text-slate-500">
                  {qtyLabel(l.qty, l.unit)} × {moneyShort(l.sellRate)}
                </span>
              </span>
              <span className="text-[17px] font-bold tabular-nums">{money(l.lineTotal)}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
          <span className="text-[15px] text-slate-600">
            Subtotal {money(subtotal)}
            {discount > 0 && ` − ${money(discount)}`}
          </span>
          <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={onDiscount}
            className="tap-scale rounded-2xl bg-slate-100 text-[16px] font-bold text-slate-700"
          >
            % Discount
          </button>
          <button
            onClick={onClear}
            className="tap-scale rounded-2xl bg-rose-50 text-[16px] font-bold text-rose-600"
          >
            Clear bill
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function SplitSheet({
  open,
  total,
  customer,
  onClose,
  onPickCustomer,
  onSave,
}: {
  open: boolean
  total: number
  customer: Customer | null
  onClose: () => void
  onPickCustomer: () => void
  onSave: (parts: { cash: number; upi: number; credit: number }) => void
}) {
  const [cash, setCash] = useState(0)
  const [upi, setUpi] = useState(0)
  const [padFor, setPadFor] = useState<null | 'cash' | 'upi'>(null)
  const credit = Math.max(0, total - cash - upi)

  return (
    <>
      <Sheet open={open && padFor === null} onClose={onClose} label="Split payment">
        <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xl font-bold">Split · {money(total)}</p>
            <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPadFor('cash')}
              className="tap-scale flex h-20 flex-col items-center justify-center rounded-2xl bg-slate-100 font-bold"
            >
              <span className="text-[13px] text-slate-500">💵 Cash</span>
              <span className="text-xl tabular-nums">{money(cash)}</span>
            </button>
            <button
              onClick={() => setPadFor('upi')}
              className="tap-scale flex h-20 flex-col items-center justify-center rounded-2xl bg-slate-100 font-bold"
            >
              <span className="text-[13px] text-slate-500">📱 UPI</span>
              <span className="text-xl tabular-nums">{money(upi)}</span>
            </button>
          </div>
          <button
            onClick={onPickCustomer}
            className="tap-scale mt-2 flex w-full items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-left"
          >
            <span className="text-[15px] font-semibold text-amber-900">
              📒 Udhaar {customer ? `· ${customer.name}` : '· pick customer'}
            </span>
            <span className="text-xl font-bold text-amber-900 tabular-nums">{money(credit)}</span>
          </button>
          <button
            onClick={() => onSave({ cash, upi, credit })}
            disabled={credit > 0 && !customer}
            className="tap-scale mt-3 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            {credit > 0 && !customer ? 'Pick a customer for the udhaar part' : 'Save bill'}
          </button>
        </div>
      </Sheet>

      <NumPad
        open={padFor !== null}
        title={padFor === 'cash' ? 'Cash part' : 'UPI part'}
        subtitle={`Bill ${money(total)}`}
        mode="money"
        chips={[{ label: `Full ${money(total)}`, value: total / 100, instant: false }]}
        submitLabel="Set"
        onSubmit={(v) => {
          const paise = Math.min(toPaise(v), total)
          if (padFor === 'cash') setCash(Math.min(paise, total - upi))
          else setUpi(Math.min(paise, total - cash))
          setPadFor(null)
        }}
        onClose={() => setPadFor(null)}
      />
    </>
  )
}
