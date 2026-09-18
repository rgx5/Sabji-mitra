import type { Unit } from '../db/types'

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

export const now = (): number => Date.now()

/** Local-time YYYY-MM-DD. Never use toISOString() — that shifts to UTC. */
export function today(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return today(new Date(y, m - 1, d + days))
}

export function yesterday(date: string): string {
  return shiftDate(date, -1)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (date === today()) return 'Today'
  if (date === yesterday(today())) return 'Yesterday'
  return `${DAY_NAMES[dt.getDay()]} ${d} ${MONTHS[m - 1]}`
}

export function clockTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------- money: integer paise in, string out ---------- */

/** 12345 -> "123.45" */
export function rupees(paise: number): string {
  const neg = paise < 0
  const abs = Math.abs(Math.round(paise))
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return neg ? `-${s}` : s
}

/** 12345 -> "₹123.45" */
export function money(paise: number): string {
  return `₹${rupees(paise)}`
}

/** Drops ".00" — for tiles and totals where the paise are noise. */
export function moneyShort(paise: number): string {
  const s = rupees(paise)
  return `₹${s.endsWith('.00') ? s.slice(0, -3) : s}`
}

/** "123.45" (typed rupees) -> 12345 paise */
export function toPaise(input: string): number {
  const n = Number(input)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/* ---------- quantity: grams for kg items, whole count otherwise ---------- */

export const isWeighed = (unit: Unit): boolean => unit === 'kg'

/** Typed value -> stored qty. "1.5" kg -> 1500 g; "3" pieces -> 3. */
export function toQty(input: string, unit: Unit): number {
  const n = Number(input)
  if (!Number.isFinite(n)) return 0
  return isWeighed(unit) ? Math.round(n * 1000) : Math.round(n)
}

/** Stored qty -> display, up to 3 decimals, trailing zeros trimmed. */
export function qtyText(qty: number, unit: Unit): string {
  if (!isWeighed(unit)) return String(qty)
  const s = (qty / 1000).toFixed(3)
  return s.replace(/\.?0+$/, '')
}

export const UNIT_LABEL: Record<Unit, string> = {
  kg: 'kg',
  dozen: 'dz',
  bundle: 'bdl',
  piece: 'pc',
}

export function qtyLabel(qty: number, unit: Unit): string {
  return `${qtyText(qty, unit)} ${UNIT_LABEL[unit]}`
}

/** rate is per unit (per kg / dozen / bundle / piece). Returns integer paise. */
export function lineTotal(qty: number, rate: number, unit: Unit): number {
  return isWeighed(unit) ? Math.round((qty * rate) / 1000) : Math.round(qty * rate)
}

/** Margin percent on sell rate, or null when either rate is missing. */
export function marginPct(buyRate: number, sellRate: number): number | null {
  if (!buyRate || !sellRate) return null
  return Math.round(((sellRate - buyRate) / sellRate) * 100)
}
