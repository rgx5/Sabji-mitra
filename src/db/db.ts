import Dexie, { type Table } from 'dexie'
import { now, uid } from '../lib/format'
import { SEED_ITEMS } from './seed'
import type {
  Customer,
  DailyRate,
  Expense,
  Item,
  Payment,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  Settings,
  Supplier,
  Wastage,
} from './types'

export class SabjiDB extends Dexie {
  items!: Table<Item, string>
  dailyRates!: Table<DailyRate, string>
  customers!: Table<Customer, string>
  sales!: Table<Sale, string>
  saleItems!: Table<SaleItem, string>
  payments!: Table<Payment, string>
  suppliers!: Table<Supplier, string>
  purchases!: Table<Purchase, string>
  purchaseItems!: Table<PurchaseItem, string>
  wastage!: Table<Wastage, string>
  expenses!: Table<Expense, string>
  settings!: Table<Settings, string>

  constructor() {
    super('sabji-mitra')
    this.version(1).stores({
      items: 'id, isActive, sortOrder, useCount, nameEn, deletedAt',
      // The unique compound index is the point of this table: one rate row per item per day.
      dailyRates: 'id, &[itemId+date], date, itemId',
      customers: 'id, name, phone, balance, lastSaleAt, deletedAt',
      sales: 'id, billNo, date, customerId, createdAt, deletedAt',
      saleItems: 'id, saleId, itemId, deletedAt',
      payments: 'id, customerId, date, createdAt, deletedAt',
      suppliers: 'id, name, deletedAt',
      purchases: 'id, date, supplierId, deletedAt',
      purchaseItems: 'id, purchaseId, itemId, deletedAt',
      wastage: 'id, date, itemId, deletedAt',
      expenses: 'id, date, category, deletedAt',
      settings: 'key',
    })
  }
}

export const db = new SabjiDB()

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  shopName: 'My Sabji Shop',
  ownerName: '',
  phone: '',
  upiId: '',
  currency: '₹',
  language: 'en',
  lastBackupAt: null,
  nextBillNo: 1,
}

/** Idempotent: safe to call on every boot. */
export async function initDb(): Promise<void> {
  const settings = await db.settings.get('app')
  if (!settings) await db.settings.put({ ...DEFAULT_SETTINGS })

  const itemCount = await db.items.count()
  if (itemCount === 0) {
    const ts = now()
    await db.items.bulkAdd(
      SEED_ITEMS.map(([nameEn, nameLocal, unit], i) => ({
        id: uid(),
        nameEn,
        nameLocal,
        unit,
        isActive: 1 as const,
        sortOrder: i,
        useCount: 0,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      })),
    )
  }
}

export function stamp<T extends object>(row: T): T & {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt: null
} {
  const ts = now()
  return { id: uid(), createdAt: ts, updatedAt: ts, deletedAt: null, ...row }
}

/** Live rows only — nothing is ever hard-deleted from the ledger. */
export const live = <T extends { deletedAt: number | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === null)

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? { ...DEFAULT_SETTINGS }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, key: 'app' })
}

/** Takes the next human-readable bill number inside the caller's transaction. */
export async function takeBillNo(): Promise<number> {
  const s = await getSettings()
  const billNo = s.nextBillNo
  await db.settings.put({ ...s, nextBillNo: billNo + 1 })
  return billNo
}
