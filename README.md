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

## One or two taps, everywhere

The billing path is the product. Every action below is counted from the screen you are
already on; nothing on this list opens a confirmation dialog.

| Action | Taps |
|---|---|
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
| Back up everything | 1 — **Backup to file** |

Items with no rate for today are not dead ends: tapping one asks for the sell rate, then
drops straight into the weight pad.

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
  components/ NumPad.tsx · CustomerPicker.tsx · ui.tsx (sheet, toast, primitives)
  screens/    RateBoard · QuickBill · Khata · CustomerDetail · PurchaseEntry · DayClose · SettingsScreen
scripts/      smoke.mjs
```

Backup/restore is a full JSON dump of every table (Settings → Backup to file). The app
nags for a fresh backup once a week of billing has gone by without one.

## Not built, on purpose

GST invoicing, barcodes, batch/expiry, enforced stock, double-entry accounting, any login.
Phase 2 (wastage, WhatsApp share, supplier payables, reports, expenses, standing orders)
and Phase 3 (sync, thermal printing, multi-user) are untouched, but the schema already
carries `wastage`, `expenses` and `suppliers` tables so they drop in without a migration.
