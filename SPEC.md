# Sabzi Vendor Billing & Khata — Build Spec

> Drop this file in the repo root as `SPEC.md` (or `CLAUDE.md`) and tell Claude Code:
> "Read SPEC.md and scaffold Phase 1. Ask me before making any schema decision not covered here."

---

## 0. Assumptions to confirm before building

1. **Primary user is a retail sabzi vendor** (shop or cart) selling to walk-in customers, with a handful of regular khata customers. If the user is mainly a **bulk supplier to hotels/mess/restaurants**, promote Standing Orders and Monthly Consolidated Billing from Phase 2 to Phase 1 — the whole credit model changes.
2. Single operator, single device. No concurrent billing.
3. Fresh unbranded vegetables — **no GST invoicing**.
4. Language: English UI with Marathi/Hindi item names shown alongside.

---

## 1. Stack

- **React + Vite + TypeScript**, installable **PWA**
- **Dexie.js (IndexedDB)** as the primary datastore — local-first, fully offline
- **Tailwind CSS** — mobile-first, large tap targets, one-hand operation
- Backup/restore: export full DB to JSON file; import to restore
- No backend in Phase 1

**Why local-first:** the vendor works at mandi and roadside with unreliable network. Offline must be the default state, not a fallback. Trade-off: single device only. Server sync is a Phase 3 concern — design the data model so it can be added (every row gets `id` as UUID, plus `createdAt`, `updatedAt`, `deletedAt` for soft deletes).

---

## 2. Data conventions (non-negotiable)

- **Money is stored as integer paise.** Never floats. Display as ₹ with 2 decimals.
- **Weight is stored as integer grams.** 1 kg = 1000. Display as kg with up to 3 decimals.
- **Dates are `YYYY-MM-DD` strings** in local time. A "business day" is the calendar day; no shift logic.
- All IDs are UUIDv4.
- Soft delete everywhere (`deletedAt`). Nothing is ever hard-deleted from the ledger.

---

## 3. Schema

### items
| field | type | notes |
|---|---|---|
| id | uuid | |
| nameEn | string | "Tomato" |
| nameLocal | string | "टोमॅटो" |
| unit | enum | `kg` \| `dozen` \| `bundle` \| `piece` |
| photoUrl | string? | optional, base64 or blob ref |
| isActive | bool | |
| sortOrder | int | vendor arranges his own layout |

Seed with ~50 common vegetables.

### dailyRates
| field | type | notes |
|---|---|---|
| id | uuid | |
| itemId | uuid | |
| date | YYYY-MM-DD | |
| buyRate | int (paise per unit) | from mandi |
| sellRate | int (paise per unit) | |

**Unique index on (itemId, date).** This is the single most important design decision — rate is a *daily record*, never a field on `items`. Without this you lose all margin history and can't answer "what did tomato cost me last Tuesday."

### customers
| field | type | notes |
|---|---|---|
| id | uuid | |
| name | string | |
| phone | string? | |
| address | string? | |
| balance | int (paise) | denormalized running balance, positive = owes us |
| creditLimit | int? | optional soft warning |
| notes | string? | |

### sales
| field | type | notes |
|---|---|---|
| id | uuid | |
| billNo | int | auto-increment, human readable |
| date | YYYY-MM-DD | |
| createdAt | timestamp | |
| customerId | uuid? | null for anonymous cash sale |
| subtotal | int | |
| discount | int | |
| total | int | |
| paymentMode | enum | `cash` \| `upi` \| `credit` \| `split` |
| cashPaid | int | |
| upiPaid | int | |
| creditAmount | int | goes to customer balance |

### saleItems
| field | type | notes |
|---|---|---|
| id, saleId, itemId | uuid | |
| qty | int (grams or count) | |
| sellRate | int | snapshot at time of sale |
| buyRate | int | **snapshot — needed for margin reports** |
| lineTotal | int | |

### payments (khata collections)
| field | type | notes |
|---|---|---|
| id | uuid | |
| customerId | uuid | |
| date | YYYY-MM-DD | |
| amount | int | |
| mode | enum | `cash` \| `upi` |
| note | string? | |

**Allocation rule: single running balance.** Do NOT implement bill-by-bill FIFO allocation. A paper khata is one running balance and that is what the vendor understands. Payments simply reduce `customers.balance`.

### suppliers
`id, name, phone?, balance (int, positive = we owe them)`

### purchases
| field | type | notes |
|---|---|---|
| id, date, supplierId? | | |
| total | int | |
| paidAmount | int | |
| dueAmount | int | adds to supplier balance |

### purchaseItems
`id, purchaseId, itemId, qty (grams), buyRate, lineTotal`

### wastage
`id, date, itemId, qty (grams), reason (enum: spoiled | unsold | damaged), estimatedLoss (int)`

### expenses
`id, date, category (enum: transport | hamali | packaging | rent | other), amount, note?`

### settings
`shopName, ownerName, phone, upiId, currency, language, lastBackupAt`

---

## 4. Screens — Phase 1 (MVP)

### 4.1 Today's Rate Board — **build this first**
The vendor's morning ritual. Must be the fastest screen in the app.
- Grid of active items with two inputs each: buy rate, sell rate
- **"Copy yesterday's rates"** button at top — one tap, then edit only what changed
- Auto-calculated margin % shown per row, greyed
- Saves to `dailyRates` for today's date
- Warn (don't block) if sellRate < buyRate

### 4.2 Quick Bill
**Target: a 5-item bill completed in under 20 seconds.**
- Full-screen grid of item tiles, largest tap targets in the app, most-used items first
- Tap item → numeric keypad for weight → auto-multiplies by today's sellRate → added to cart
- Running total always visible at bottom
- Checkout: Cash / UPI / Udhaar / Split
- If Udhaar → customer picker (search by name or phone, "+ New" inline)
- Show customer's current balance in the picker before confirming
- Save → clear → ready for next customer immediately. No confirmation dialog.

### 4.3 Khata (customers)
- List sorted by balance descending, with search
- Total outstanding across all customers at the top
- Customer detail: running ledger of sales and payments, chronological, with balance after each row
- "Collect payment" button → amount, mode, save

### 4.4 Purchase Entry
- Date, supplier (optional), then item + qty + rate rows
- Paid / partially paid / unpaid
- Optionally offer: "Update today's buy rates from this purchase?" → writes into `dailyRates.buyRate`

### 4.5 Day Close
Single scrollable summary card for the selected date:
- Total sales
- Cash in hand · UPI received · Credit given · Credit collected
- Purchase spend
- **Gross margin** = Σ(sellRate − buyRate) × qty across saleItems
- Bill count, average bill value

### 4.6 Settings
Shop details, UPI ID, item master CRUD, backup export / restore import.

---

## 5. Phase 2

- **Wastage entry** — end-of-day spoiled/unsold qty. Vegetable wastage runs 5–15%; real margin is invisible without it. Day Close gains "Net margin after wastage."
- **WhatsApp share** — `wa.me` deep link with pre-filled text. Bill receipt, and monthly outstanding reminder. Cheaper and far more used than SMS.
- **Supplier payables** — mirror of khata for the mandi side.
- **Reports** — item-wise margin over a date range, outstanding aging (0–30 / 30–60 / 60+ days), top customers by revenue, best-selling items, daily sales trend chart.
- **Expenses** — transport, hamali, packaging, rent. Day Close gains true net profit.
- **Standing orders** — repeat daily order template per hotel/mess customer, plus monthly consolidated bill generation. *(Promote to Phase 1 if the vendor is primarily a bulk supplier.)*

## 6. Phase 3

- Server sync + multi-device
- Thermal printer (58mm ESC/POS over Bluetooth)
- Multi-user with roles

---

## 7. Explicit non-goals

Do not build these. If they seem necessary, ask first.

- GST invoicing and HSN codes
- Barcode scanning
- Batch / expiry tracking
- Enforced stock deduction — **stock is advisory only**, never block a sale for insufficient stock. Vegetable weights are approximate and the vendor will lose trust in the app the first time it refuses a real sale.
- Accounting-grade double-entry ledger
- Any login/auth in Phase 1

---

## 8. UX rules

- Every primary action reachable with one thumb
- Minimum tap target 48×48px
- Numeric keypad is custom and large — never rely on the system keyboard for weights and amounts
- No modal confirmations on the billing path
- Everything works offline; never show a network error on the billing screen
- Prompt for backup if `lastBackupAt` is more than 7 days old

---

## 9. Build order

1. Dexie schema + seed items
2. Today's Rate Board
3. Quick Bill + saleItems
4. Khata + payments
5. Purchase entry
6. Day Close
7. Backup/restore
8. PWA manifest + service worker + install prompt

Ship Phase 1 fully working before touching Phase 2.
