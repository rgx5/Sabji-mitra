# Sabji Mitra — Vendor Billing & Khata

Offline-first billing, daily rate board and khata (credit book) for a retail vegetable
vendor. React + Vite + TypeScript, Dexie (IndexedDB) as the only datastore, installable
as a PWA. No backend, no login, works with the phone in flight mode.

Built from [`SPEC.md`](./SPEC.md) — Phase 1 is complete.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # typecheck + production build into dist/
npm run preview        # serve the build
```

End-to-end smoke test of every Phase 1 flow (needs a preview server on :4321):

```bash
npm run build && npm run preview -- --port 4321 &
npm run smoke          # CHROME_PATH=... to pin a browser binary
```

## One nav

There is exactly one navigation control in the app: the six-tab bar at the bottom of
every screen, billing included. A screen that needs its own controls — the billing
screen's total and Cash / UPI / Udhaar / Split row — renders them through `ActionBar`,
which portals into the same fixed bottom stack directly above the tabs. The stack's
height is measured into `--bottom-stack`, so page padding and toasts position themselves
against whatever is actually there instead of a hardcoded offset. No screen places a
second fixed bar, and no screen carries a button that duplicates a tab.

## One or two taps, everywhere

The billing path is the product. Every action below is counted from the screen you are
already on; nothing on this list opens a confirmation dialog.

| Action | Taps |
|---|---|
| Move between screens | 1 — the tab bar, same on every screen |
| Price the whole board from yesterday | 1 — **Copy previous rates** |
| Set one rate | 2 — cell, then a chip (`Same as before`, `+20%`) |
| Price a full item (buy → sell) | cell → **Next** → **Save**, the pad walks the fields |
| Add 1 kg of tomato to a bill | 2 — tile, then the **1 kg** chip |
| Add an odd weight | tile, digits, **Add** |
| Cash or UPI sale | 1 — **Cash** / **UPI** in the checkout bar |
| Udhaar sale, known customer | 2 — **Udhaar**, then the customer |
| Udhaar sale, new customer | 3 — **Udhaar**, type the name, **Add & continue** |
| Collect a full khata balance | 2 — **₹ Collect**, then **💵 Cash** (pre-filled amount) |
| Undo a saved bill | 1 — **Undo** on the toast (5 s) |
| Add a purchase line | 2 — item tile, then a qty chip (rate is remembered) |
| See every bill ever saved | 1 — the **Bills** tab |
| Open a bill's full receipt | 2 — Bills tab, then the bill |
| Add a customer with phone & address | 2 — Khata **＋ New**, then fill and save |
| Back up everything | 1 — **Backup to file** |

Items with no rate for today are not dead ends: tapping one asks for the sell rate, then
drops straight into the weight pad.

Fast does not mean partial. Every record can be opened and completed afterwards:

- **Bills tab** — every bill and every purchase, filtered by Today / Last 7 days / All,
  searchable by bill number, customer or supplier. Tapping one opens the full receipt:
  each line with quantity and rate, discount, total, the cash / UPI / udhaar split, the
  customer (tap through to their khata), and Remove.
- **Customers** — name, phone, address, credit limit and a note, captured when you add
  them and editable any time from the customer's page. The fast path in billing still
  creates from just a name; **New customer with phone & details** in the same picker opens
  the full form when you want it.
- **Suppliers** — name and phone, addable and editable from the purchase screen.

## Design rules held to

- **Money is integer paise, weight is integer grams.** No floats anywhere in the ledger.
- **Rates are daily records** (`dailyRates`, unique on `itemId + date`), never a field on
  the item — so margin history survives.
- **`saleItems` snapshots both sell and buy rate**, which is what makes Day Close's gross
  margin real rather than reconstructed.
- **Khata is one running balance**, exactly like the paper book. No FIFO bill allocation.
- **Soft delete everywhere** (`deletedAt`); voiding a bill reverses the customer balance.
- **Every row carries `id` (UUID), `createdAt`, `updatedAt`, `deletedAt`** so server sync
  can be added in Phase 3 without a migration.
- **Stock is never enforced** — the app will not refuse a sale.
- Custom numeric keypad; the system keyboard is only used for names and phone numbers.
- Minimum 48 px tap targets, one-handed reach, no network error is ever shown.

## Layout

```
src/
  db/         types.ts · db.ts (Dexie schema) · seed.ts (50 vegetables) · actions.ts
  lib/        format.ts (paise/gram math, dates) · router.ts (hash router)
  components/ NumPad · CustomerPicker · CustomerForm · BillSheet · ui (sheet, toast, primitives)
  screens/    RateBoard · QuickBill · Bills · Khata · CustomerDetail · PurchaseEntry · DayClose · SettingsScreen
scripts/      smoke.mjs
```

## Where a bill goes when you tap Cash

Saving is deliberately silent — no confirmation dialog, the cart clears and the pay
buttons grey out because there is nothing left to charge. The bill itself is written, in
one transaction, to two tables in this browser's IndexedDB (database `sabji-mitra`):
`sales` gets the bill header (number, date, totals, how it was paid) and `saleItems` gets
one row per line with the sell **and** buy rate snapshotted. An udhaar bill also moves the
customer's balance in the same transaction.

You can see it three ways: the **✓ Bill #N saved · View** row that replaces the total on
the billing screen, the **Bills** tab, and Day Close. The toast's **Undo** reverses it for
five seconds; after that, remove it from the receipt.

There is no server — that is the point, the vendor works where the network does not. The
consequences are worth saying plainly, and Settings → *Where your data is* says them in
the app: the data belongs to this browser on this phone, another phone or browser sees
nothing, and clearing browsing data (or a browser set to clear site data on exit) deletes
it. The app asks the browser for persistent storage on boot so it is not evicted under
storage pressure; Settings shows whether that was granted and lets you ask again.

Backup/restore is a full JSON dump of every table (Settings → Backup to file). The app
nags for a fresh backup once a week of billing has gone by without one.

## Not built, on purpose

GST invoicing, barcodes, batch/expiry, enforced stock, double-entry accounting, any login.
Phase 2 (wastage, WhatsApp share, supplier payables, reports, expenses, standing orders)
and Phase 3 (sync, thermal printing, multi-user) are untouched, but the schema already
carries `wastage`, `expenses` and `suppliers` tables so they drop in without a migration.
