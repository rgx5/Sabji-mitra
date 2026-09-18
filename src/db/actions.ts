import { db, saveSettings, stamp, takeBillNo } from './db'
import { lineTotal, now, today } from '../lib/format'
import type {
  CartLine,
  Customer,
  ExpenseCategory,
  Item,
  PayMode,
  PaymentMode,
  Unit,
} from './types'

/* ---------------- rates ---------------- */

export async function rateMapFor(date: string): Promise<Map<string, { buy: number; sell: number }>> {
  const rows = await db.dailyRates.where('date').equals(date).toArray()
  const map = new Map<string, { buy: number; sell: number }>()
  for (const r of rows) if (r.deletedAt === null) map.set(r.itemId, { buy: r.buyRate, sell: r.sellRate })
  return map
}

/** Upsert on the unique (itemId, date) index. Passing only one side keeps the other. */
export async function setRate(
  itemId: string,
  date: string,
  patch: { buyRate?: number; sellRate?: number },
): Promise<void> {
  await db.transaction('rw', db.dailyRates, async () => {
    const existing = await db.dailyRates.where('[itemId+date]').equals([itemId, date]).first()
    if (existing) {
      await db.dailyRates.update(existing.id, { ...patch, updatedAt: now(), deletedAt: null })
    } else {
      await db.dailyRates.add(
        stamp({ itemId, date, buyRate: patch.buyRate ?? 0, sellRate: patch.sellRate ?? 0 }),
      )
    }
  })
}

/** One tap on the rate board: pull the most recent earlier day's rates into `date`. */
export async function copyRatesFrom(date: string, source?: string): Promise<number> {
  const src = source ?? (await lastRateDateBefore(date))
  if (!src) return 0
  return db.transaction('rw', db.dailyRates, async () => {
    const rows = (await db.dailyRates.where('date').equals(src).toArray()).filter(
      (r) => r.deletedAt === null && (r.buyRate > 0 || r.sellRate > 0),
    )
    let copied = 0
    for (const r of rows) {
      const existing = await db.dailyRates.where('[itemId+date]').equals([r.itemId, date]).first()
      if (existing) {
        await db.dailyRates.update(existing.id, {
          buyRate: r.buyRate,
          sellRate: r.sellRate,
          updatedAt: now(),
          deletedAt: null,
        })
      } else {
        await db.dailyRates.add(
          stamp({ itemId: r.itemId, date, buyRate: r.buyRate, sellRate: r.sellRate }),
        )
      }
      copied++
    }
    return copied
  })
}

/** Most recent day (before `date`) that actually has rates. Usually yesterday. */
export async function lastRateDateBefore(date: string): Promise<string | null> {
  const rows = await db.dailyRates.where('date').below(date).toArray()
  let best: string | null = null
  for (const r of rows) {
    if (r.deletedAt !== null) continue
    if (r.buyRate === 0 && r.sellRate === 0) continue
    if (!best || r.date > best) best = r.date
  }
  return best
}

export async function hasRatesFor(date: string): Promise<boolean> {
  const rows = await db.dailyRates.where('date').equals(date).toArray()
  return rows.some((r) => r.deletedAt === null && (r.buyRate > 0 || r.sellRate > 0))
}

/* ---------------- items ---------------- */

export async function addItem(
  nameEn: string,
  nameLocal: string,
  unit: Unit,
): Promise<string> {
  const max = await db.items.orderBy('sortOrder').last()
  const row = stamp({
    nameEn,
    nameLocal,
    unit,
    isActive: 1 as const,
    sortOrder: (max?.sortOrder ?? 0) + 1,
    useCount: 0,
  })
  await db.items.add(row)
  return row.id
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: now() })
}

export async function archiveItem(id: string): Promise<void> {
  await db.items.update(id, { isActive: 0, updatedAt: now() })
}

/* ---------------- customers ---------------- */

export async function addCustomer(
  input: string | Pick<Customer, 'name'> & Partial<Pick<Customer, 'phone' | 'address' | 'creditLimit' | 'notes'>>,
): Promise<Customer> {
  const details = typeof input === 'string' ? { name: input } : input
  const row = stamp({
    ...details,
    name: details.name.trim(),
    balance: 0,
    lastSaleAt: 0,
  }) as Customer
  await db.customers.add(row)
  return row
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<void> {
  await db.customers.update(id, { ...patch, updatedAt: now() })
}

/* ---------------- sales ---------------- */

export interface CheckoutInput {
  lines: CartLine[]
  discount: number
  paymentMode: PaymentMode
  cashPaid: number
  upiPaid: number
  creditAmount: number
  customerId: string | null
  date?: string
}

/** Writes sale + saleItems + customer balance in one transaction. Returns the bill number. */
export async function commitSale(input: CheckoutInput): Promise<{ saleId: string; billNo: number }> {
  const date = input.date ?? today()
  const subtotal = input.lines.reduce((s, l) => s + l.lineTotal, 0)
  const total = Math.max(0, subtotal - input.discount)

  return db.transaction(
    'rw',
    [db.sales, db.saleItems, db.customers, db.items, db.settings],
    async () => {
      const billNo = await takeBillNo()
      const sale = stamp({
        billNo,
        date,
        customerId: input.customerId,
        subtotal,
        discount: input.discount,
        total,
        paymentMode: input.paymentMode,
        cashPaid: input.cashPaid,
        upiPaid: input.upiPaid,
        creditAmount: input.creditAmount,
      })
      await db.sales.add(sale)

      await db.saleItems.bulkAdd(
        input.lines.map((l) =>
          stamp({
            saleId: sale.id,
            itemId: l.itemId,
            qty: l.qty,
            unit: l.unit,
            sellRate: l.sellRate,
            buyRate: l.buyRate,
            lineTotal: l.lineTotal,
          }),
        ),
      )

      for (const l of input.lines) {
        const item = await db.items.get(l.itemId)
        if (item) await db.items.update(l.itemId, { useCount: (item.useCount ?? 0) + 1 })
      }

      if (input.customerId && input.creditAmount > 0) {
        const c = await db.customers.get(input.customerId)
        if (c) {
          await db.customers.update(c.id, {
            balance: c.balance + input.creditAmount,
            lastSaleAt: now(),
            updatedAt: now(),
          })
        }
      } else if (input.customerId) {
        await db.customers.update(input.customerId, { lastSaleAt: now(), updatedAt: now() })
      }

      return { saleId: sale.id, billNo }
    },
  )
}

/** Soft-deletes a bill and reverses its effect on the customer balance. */
export async function voidSale(saleId: string): Promise<void> {
  await db.transaction('rw', [db.sales, db.saleItems, db.customers], async () => {
    const sale = await db.sales.get(saleId)
    if (!sale || sale.deletedAt !== null) return
    await db.sales.update(saleId, { deletedAt: now(), updatedAt: now() })
    const lines = await db.saleItems.where('saleId').equals(saleId).toArray()
    for (const l of lines) await db.saleItems.update(l.id, { deletedAt: now(), updatedAt: now() })
    if (sale.customerId && sale.creditAmount > 0) {
      const c = await db.customers.get(sale.customerId)
      if (c) await db.customers.update(c.id, { balance: c.balance - sale.creditAmount, updatedAt: now() })
    }
  })
}

/* ---------------- payments (khata collection) ---------------- */

/** Single running balance — no bill-by-bill allocation, by design. */
export async function collectPayment(
  customerId: string,
  amount: number,
  mode: PayMode,
  note?: string,
): Promise<void> {
  await db.transaction('rw', [db.payments, db.customers], async () => {
    await db.payments.add(stamp({ customerId, date: today(), amount, mode, note }))
    const c = await db.customers.get(customerId)
    if (c) await db.customers.update(customerId, { balance: c.balance - amount, updatedAt: now() })
  })
}

export async function voidPayment(paymentId: string): Promise<void> {
  await db.transaction('rw', [db.payments, db.customers], async () => {
    const p = await db.payments.get(paymentId)
    if (!p || p.deletedAt !== null) return
    await db.payments.update(paymentId, { deletedAt: now(), updatedAt: now() })
    const c = await db.customers.get(p.customerId)
    if (c) await db.customers.update(c.id, { balance: c.balance + p.amount, updatedAt: now() })
  })
}

/* ---------------- purchases ---------------- */

export interface PurchaseLineInput {
  itemId: string
  unit: Unit
  qty: number
  buyRate: number
}

export async function commitPurchase(input: {
  date: string
  supplierId: string | null
  lines: PurchaseLineInput[]
  paidAmount: number
  updateRates: boolean
}): Promise<string> {
  const total = input.lines.reduce((s, l) => s + lineTotal(l.qty, l.buyRate, l.unit), 0)
  const dueAmount = Math.max(0, total - input.paidAmount)

  const purchaseId = await db.transaction(
    'rw',
    [db.purchases, db.purchaseItems, db.suppliers],
    async () => {
      const purchase = stamp({
        date: input.date,
        supplierId: input.supplierId,
        total,
        paidAmount: Math.min(input.paidAmount, total),
        dueAmount,
      })
      await db.purchases.add(purchase)
      await db.purchaseItems.bulkAdd(
        input.lines.map((l) =>
          stamp({
            purchaseId: purchase.id,
            itemId: l.itemId,
            qty: l.qty,
            unit: l.unit,
            buyRate: l.buyRate,
            lineTotal: lineTotal(l.qty, l.buyRate, l.unit),
          }),
        ),
      )
      if (input.supplierId && dueAmount > 0) {
        const s = await db.suppliers.get(input.supplierId)
        if (s) await db.suppliers.update(s.id, { balance: s.balance + dueAmount, updatedAt: now() })
      }
      return purchase.id
    },
  )

  if (input.updateRates) {
    for (const l of input.lines) await setRate(l.itemId, input.date, { buyRate: l.buyRate })
  }
  return purchaseId
}

export async function addSupplier(name: string, phone?: string): Promise<string> {
  const row = stamp({ name: name.trim(), phone: phone?.trim() || undefined, balance: 0 })
  await db.suppliers.add(row)
  return row.id
}

export async function updateSupplier(id: string, patch: { name?: string; phone?: string }): Promise<void> {
  await db.suppliers.update(id, { ...patch, updatedAt: now() })
}

/** Soft-deletes a purchase and reverses its effect on the supplier balance. */
export async function voidPurchase(purchaseId: string): Promise<void> {
  await db.transaction('rw', [db.purchases, db.purchaseItems, db.suppliers], async () => {
    const purchase = await db.purchases.get(purchaseId)
    if (!purchase || purchase.deletedAt !== null) return
    await db.purchases.update(purchaseId, { deletedAt: now(), updatedAt: now() })
    const lines = await db.purchaseItems.where('purchaseId').equals(purchaseId).toArray()
    for (const l of lines) await db.purchaseItems.update(l.id, { deletedAt: now(), updatedAt: now() })
    if (purchase.supplierId && purchase.dueAmount > 0) {
      const s = await db.suppliers.get(purchase.supplierId)
      if (s) await db.suppliers.update(s.id, { balance: s.balance - purchase.dueAmount, updatedAt: now() })
    }
  })
}

/* ---------------- expenses (light, used by day close) ---------------- */

export async function addExpense(
  category: ExpenseCategory,
  amount: number,
  note?: string,
  date?: string,
): Promise<void> {
  await db.expenses.add(stamp({ date: date ?? today(), category, amount, note }))
}

/* ---------------- day close ---------------- */

export interface DaySummary {
  date: string
  totalSales: number
  billCount: number
  avgBill: number
  cashIn: number
  upiIn: number
  creditGiven: number
  creditCollected: number
  cashCollected: number
  upiCollected: number
  purchaseSpend: number
  expenseSpend: number
  grossMargin: number
  cashInHand: number
  topItems: Array<{ itemId: string; name: string; qty: number; unit: Unit; amount: number }>
}

export async function daySummary(date: string): Promise<DaySummary> {
  const [sales, payments, purchases, expenses, items] = await Promise.all([
    db.sales.where('date').equals(date).toArray(),
    db.payments.where('date').equals(date).toArray(),
    db.purchases.where('date').equals(date).toArray(),
    db.expenses.where('date').equals(date).toArray(),
    db.items.toArray(),
  ])
  const liveSales = sales.filter((s) => s.deletedAt === null)
  const livePayments = payments.filter((p) => p.deletedAt === null)
  const itemName = new Map(items.map((i) => [i.id, i.nameEn]))
  const itemUnit = new Map(items.map((i) => [i.id, i.unit]))

  const saleIds = liveSales.map((s) => s.id)
  const lines = (await db.saleItems.where('saleId').anyOf(saleIds).toArray()).filter(
    (l) => l.deletedAt === null,
  )

  const grossMargin = lines.reduce(
    (sum, l) => sum + (l.buyRate > 0 ? lineTotal(l.qty, l.sellRate - l.buyRate, l.unit) : 0),
    0,
  )

  const byItem = new Map<string, { qty: number; amount: number }>()
  for (const l of lines) {
    const cur = byItem.get(l.itemId) ?? { qty: 0, amount: 0 }
    byItem.set(l.itemId, { qty: cur.qty + l.qty, amount: cur.amount + l.lineTotal })
  }
  const topItems = [...byItem.entries()]
    .map(([itemId, v]) => ({
      itemId,
      name: itemName.get(itemId) ?? '—',
      unit: itemUnit.get(itemId) ?? ('kg' as Unit),
      qty: v.qty,
      amount: v.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  const totalSales = liveSales.reduce((s, x) => s + x.total, 0)
  const cashIn = liveSales.reduce((s, x) => s + x.cashPaid, 0)
  const upiIn = liveSales.reduce((s, x) => s + x.upiPaid, 0)
  const creditGiven = liveSales.reduce((s, x) => s + x.creditAmount, 0)
  const cashCollected = livePayments.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0)
  const upiCollected = livePayments.filter((p) => p.mode === 'upi').reduce((s, p) => s + p.amount, 0)
  const purchaseSpend = purchases
    .filter((p) => p.deletedAt === null)
    .reduce((s, p) => s + p.paidAmount, 0)
  const expenseSpend = expenses.filter((e) => e.deletedAt === null).reduce((s, e) => s + e.amount, 0)

  return {
    date,
    totalSales,
    billCount: liveSales.length,
    avgBill: liveSales.length ? Math.round(totalSales / liveSales.length) : 0,
    cashIn,
    upiIn,
    creditGiven,
    creditCollected: cashCollected + upiCollected,
    cashCollected,
    upiCollected,
    purchaseSpend,
    expenseSpend,
    grossMargin,
    cashInHand: cashIn + cashCollected - purchaseSpend - expenseSpend,
    topItems,
  }
}

/* ---------------- backup / restore ---------------- */

const TABLES = [
  'items',
  'dailyRates',
  'customers',
  'sales',
  'saleItems',
  'payments',
  'suppliers',
  'purchases',
  'purchaseItems',
  'wastage',
  'expenses',
  'settings',
] as const

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await (db as never as Record<string, { toArray(): Promise<unknown[]> }>)[t].toArray()
  const payload = { format: 'sabji-mitra-backup', version: 1, exportedAt: new Date().toISOString(), data }
  await saveSettings({ lastBackupAt: now() })
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export async function downloadBackup(): Promise<string> {
  const blob = await exportBackup()
  const name = `sabji-mitra-backup-${today()}.json`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return name
}

export async function importBackup(text: string): Promise<{ restored: number }> {
  const parsed = JSON.parse(text) as { format?: string; data?: Record<string, unknown[]> }
  if (parsed.format !== 'sabji-mitra-backup' || !parsed.data) throw new Error('Not a Sabji Mitra backup file')
  let restored = 0
  await db.transaction('rw', db.tables, async () => {
    for (const t of TABLES) {
      const rows = parsed.data![t]
      if (!Array.isArray(rows)) continue
      const table = (db as never as Record<string, { clear(): Promise<void>; bulkPut(r: unknown[]): Promise<unknown> }>)[t]
      await table.clear()
      await table.bulkPut(rows)
      restored += rows.length
    }
  })
  return { restored }
}

/** Nukes transactions but keeps the item master — used by Settings → start fresh. */
export async function clearLedger(): Promise<void> {
  await db.transaction(
    'rw',
    [db.sales, db.saleItems, db.payments, db.purchases, db.purchaseItems, db.expenses, db.wastage],
    async () => {
      await Promise.all([
        db.sales.clear(),
        db.saleItems.clear(),
        db.payments.clear(),
        db.purchases.clear(),
        db.purchaseItems.clear(),
        db.expenses.clear(),
        db.wastage.clear(),
      ])
    },
  )
}
