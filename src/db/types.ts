/** All money is integer paise. All weight is integer grams. Never floats. */

export type Unit = 'kg' | 'dozen' | 'bundle' | 'piece'
export type PaymentMode = 'cash' | 'upi' | 'credit' | 'split'
export type PayMode = 'cash' | 'upi'
export type WastageReason = 'spoiled' | 'unsold' | 'damaged'
export type ExpenseCategory = 'transport' | 'hamali' | 'packaging' | 'rent' | 'other'

/** Every row carries these so a server sync can be added later without a migration. */
export interface Row {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Item extends Row {
  nameEn: string
  nameLocal: string
  unit: Unit
  photoUrl?: string
  isActive: 1 | 0
  sortOrder: number
  /** Rolling count of sales, drives "most used first" on the bill grid. */
  useCount: number
}

export interface DailyRate extends Row {
  itemId: string
  date: string // YYYY-MM-DD
  buyRate: number // paise per unit
  sellRate: number // paise per unit
}

export interface Customer extends Row {
  name: string
  phone?: string
  address?: string
  balance: number // paise, positive = owes us
  creditLimit?: number
  notes?: string
  lastSaleAt: number
}

export interface Sale extends Row {
  billNo: number
  date: string
  customerId: string | null
  subtotal: number
  discount: number
  total: number
  paymentMode: PaymentMode
  cashPaid: number
  upiPaid: number
  creditAmount: number
}

export interface SaleItem extends Row {
  saleId: string
  itemId: string
  qty: number // grams for kg items, count otherwise
  unit: Unit
  sellRate: number // snapshot
  buyRate: number // snapshot — needed for margin reports
  lineTotal: number
}

export interface Payment extends Row {
  customerId: string
  date: string
  amount: number
  mode: PayMode
  note?: string
}

export interface Supplier extends Row {
  name: string
  phone?: string
  balance: number // positive = we owe them
}

export interface Purchase extends Row {
  date: string
  supplierId: string | null
  total: number
  paidAmount: number
  dueAmount: number
}

export interface PurchaseItem extends Row {
  purchaseId: string
  itemId: string
  qty: number
  unit: Unit
  buyRate: number
  lineTotal: number
}

export interface Wastage extends Row {
  date: string
  itemId: string
  qty: number
  reason: WastageReason
  estimatedLoss: number
}

export interface Expense extends Row {
  date: string
  category: ExpenseCategory
  amount: number
  note?: string
}

export interface Settings {
  key: 'app'
  shopName: string
  ownerName: string
  phone: string
  upiId: string
  currency: string
  language: 'en' | 'mr' | 'hi'
  lastBackupAt: number | null
  nextBillNo: number
}

/** A cart line before it is written to the ledger. */
export interface CartLine {
  itemId: string
  nameEn: string
  nameLocal: string
  unit: Unit
  qty: number
  sellRate: number
  buyRate: number
  lineTotal: number
}
