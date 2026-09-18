import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, saveSettings } from '../db/db'
import { addItem, archiveItem, clearLedger, downloadBackup, importBackup, updateItem } from '../db/actions'
import { Card, Sheet, useToast } from '../components/ui'
import { bytes, requestPersistentStorage, storageStatus } from '../lib/storage'
import { Field } from './CustomerDetail'
import { prettyDate, today, UNIT_LABEL } from '../lib/format'
import { go } from '../lib/router'
import type { Item, Unit } from '../db/types'

const UNITS: Unit[] = ['kg', 'dozen', 'bundle', 'piece']

export default function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  const items = useLiveQuery(async () => (await db.items.toArray()).filter((i) => i.deletedAt === null), [])
  const [shopOpen, setShopOpen] = useState(false)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageStatus>> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    void storageStatus().then(setStorage)
  }, [])

  const counts = useLiveQuery(async () => {
    const [sales, customers, payments, purchases] = await Promise.all([
      db.sales.toArray(),
      db.customers.toArray(),
      db.payments.toArray(),
      db.purchases.toArray(),
    ])
    return {
      bills: sales.filter((r) => r.deletedAt === null).length,
      customers: customers.filter((r) => r.deletedAt === null).length,
      payments: payments.filter((r) => r.deletedAt === null).length,
      purchases: purchases.filter((r) => r.deletedAt === null).length,
    }
  }, [])

  const onExport = async () => {
    const name = await downloadBackup()
    toast(`Saved ${name}`)
  }

  const onImport = async (file: File) => {
    try {
      const { restored } = await importBackup(await file.text())
      toast(`Restored ${restored} rows`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file', { tone: 'warn' })
    }
  }

  const lastBackup = settings?.lastBackupAt
    ? prettyDate(today(new Date(settings.lastBackupAt)))
    : 'never'

  return (
    <div className="px-3 pb-6">
      <header className="sticky top-0 z-30 -mx-3 mb-3 bg-brand-700 px-3 pt-4 pb-4 text-white">
        <p className="text-lg font-bold">{settings?.shopName ?? 'Sabji Mitra'}</p>
        <p className="text-[13px] text-brand-100">Settings · works fully offline</p>
      </header>

      <Card className="mb-3">
        <Row label="🚚 Purchase entry" hint="Mandi bills and buy rates" onClick={() => go('purchase')} />
        <Row label="🏪 Shop details" hint="Name, phone, UPI ID" onClick={() => setShopOpen(true)} />
        <Row
          label="🥬 Items"
          hint={`${items?.filter((i) => i.isActive === 1).length ?? 0} active`}
          onClick={() => setItemsOpen(true)}
        />
      </Card>

      <Card className="mb-3">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[16px] font-semibold">📍 Where your data is</p>
          <p className="mt-1 text-[14px] text-slate-500">
            On this phone only, inside this browser's storage. Nothing is sent to a server, so
            it works with no network — and a different phone or browser sees different data.
          </p>
          <p className="mt-2 text-[14px] text-slate-600">
            {counts
              ? `${counts.bills} bills · ${counts.customers} customers · ${counts.payments} payments · ${counts.purchases} purchases`
              : '…'}
            {storage?.supported ? ` · ${bytes(storage.usage)} used` : ''}
          </p>
          {storage && (
            <button
              onClick={async () => {
                const ok = await requestPersistentStorage()
                setStorage(await storageStatus())
                toast(
                  ok
                    ? 'Protected — the browser will not auto-clear it'
                    : 'Browser would not protect it — keep exporting backups',
                  { tone: ok ? 'ok' : 'warn' },
                )
              }}
              className={`tap-scale mt-2 w-full rounded-2xl text-[15px] font-bold ${
                storage.persisted ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {storage.persisted
                ? '🔒 Protected from auto-cleanup'
                : '⚠️ Not protected — tap to protect'}
            </button>
          )}
          <p className="mt-2 text-[13px] text-slate-500">
            Clearing browsing data, or a browser set to clear site data on exit, deletes it.
            Export a backup after a busy day.
          </p>
        </div>
        <Row label="⬇️ Backup to file" hint={`Last backup: ${lastBackup}`} onClick={() => void onExport()} />
        <Row label="⬆️ Restore from file" hint="Replaces everything on this device" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImport(f)
            e.target.value = ''
          }}
        />
      </Card>

      <Card className="mb-3">
        <button
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true)
            void clearLedger().then(() => {
              setConfirmClear(false)
              toast('Bills, payments and purchases cleared')
            })
          }}
          className={`w-full px-4 py-4 text-left text-[15px] font-bold ${
            confirmClear ? 'text-rose-600' : 'text-slate-500'
          }`}
        >
          {confirmClear ? 'Tap again to clear all bills, khata and purchases' : '🗑 Start fresh (keep items)'}
        </button>
      </Card>

      <p className="px-2 text-center text-[12px] text-slate-400">
        Data lives on this device only. Export a backup weekly.
      </p>

      <ShopSheet open={shopOpen} onClose={() => setShopOpen(false)} />
      <ItemsSheet open={itemsOpen} items={items ?? []} onClose={() => setItemsOpen(false)} />
    </div>
  )
}

function Row({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap-scale flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0"
    >
      <span>
        <span className="block text-[16px] font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-slate-500">{hint}</span>}
      </span>
      <span className="text-slate-300">›</span>
    </button>
  )
}

function ShopSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useLiveQuery(() => getSettings(), [])
  const [form, setForm] = useState({ shopName: '', ownerName: '', phone: '', upiId: '' })
  const { toast } = useToast()

  useEffect(() => {
    if (settings && open) {
      setForm({
        shopName: settings.shopName,
        ownerName: settings.ownerName,
        phone: settings.phone,
        upiId: settings.upiId,
      })
    }
  }, [settings, open])

  return (
    <Sheet open={open} onClose={onClose} label="Shop details">
      <div className="pb-safe space-y-2 px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
        <p className="text-xl font-bold">Shop details</p>
        <Field label="Shop name" value={form.shopName} onChange={(v) => setForm({ ...form, shopName: v })} />
        <Field label="Owner" value={form.ownerName} onChange={(v) => setForm({ ...form, ownerName: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />
        <Field label="UPI ID" value={form.upiId} onChange={(v) => setForm({ ...form, upiId: v })} />
        <button
          onClick={async () => {
            await saveSettings(form)
            toast('Saved')
            onClose()
          }}
          className="tap-scale mt-2 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white"
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}

function ItemsSheet({ open, items, onClose }: { open: boolean; items: Item[]; onClose: () => void }) {
  const [editing, setEditing] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const { toast } = useToast()

  const sorted = items.slice().sort((a, b) => b.isActive - a.isActive || a.nameEn.localeCompare(b.nameEn))

  return (
    <>
      <Sheet open={open && !editing && !adding} onClose={onClose} label="Items">
        <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xl font-bold">Items</p>
            <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
              ✕
            </button>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="tap-scale mb-2 w-full rounded-2xl bg-brand-600 text-[17px] font-bold text-white"
          >
            ＋ New item
          </button>
          <div className="max-h-[60vh] overflow-y-auto">
            {sorted.map((i) => (
              <button
                key={i.id}
                onClick={() => setEditing(i)}
                className="tap-scale flex w-full items-center justify-between border-b border-slate-100 px-2 py-3 text-left last:border-0"
              >
                <span>
                  <span className={`block text-[16px] font-semibold ${i.isActive ? '' : 'text-slate-400 line-through'}`}>
                    {i.nameEn}
                  </span>
                  <span className="block text-[13px] text-slate-500">
                    {i.nameLocal} · per {UNIT_LABEL[i.unit]}
                  </span>
                </span>
                <span className="text-slate-300">›</span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <ItemForm
        open={adding || editing !== null}
        item={editing}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onSaved={(msg) => {
          setAdding(false)
          setEditing(null)
          toast(msg)
        }}
      />
    </>
  )
}

function ItemForm({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean
  item: Item | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [nameEn, setNameEn] = useState('')
  const [nameLocal, setNameLocal] = useState('')
  const [unit, setUnit] = useState<Unit>('kg')

  useEffect(() => {
    if (!open) return
    setNameEn(item?.nameEn ?? '')
    setNameLocal(item?.nameLocal ?? '')
    setUnit(item?.unit ?? 'kg')
  }, [open, item])

  const save = async () => {
    if (!nameEn.trim()) return
    if (item) {
      await updateItem(item.id, { nameEn: nameEn.trim(), nameLocal: nameLocal.trim(), unit })
      onSaved('Item updated')
    } else {
      await addItem(nameEn.trim(), nameLocal.trim(), unit)
      onSaved('Item added')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Item">
      <div className="pb-safe space-y-2 px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
        <p className="text-xl font-bold">{item ? 'Edit item' : 'New item'}</p>
        <Field label="Name (English)" value={nameEn} onChange={setNameEn} />
        <Field label="Local name / स्थानिक नाव" value={nameLocal} onChange={setNameLocal} />
        <div>
          <span className="mb-1 block text-[13px] font-semibold text-slate-500">Sold by</span>
          <div className="grid grid-cols-4 gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`tap-scale rounded-2xl text-[15px] font-bold ${
                  unit === u ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void save()}
          className="tap-scale mt-2 w-full rounded-2xl bg-brand-600 text-lg font-bold text-white"
        >
          Save
        </button>
        {item && item.isActive === 1 && (
          <button
            onClick={async () => {
              await archiveItem(item.id)
              onSaved('Item hidden from the bill grid')
            }}
            className="tap-scale w-full rounded-2xl bg-rose-50 text-[16px] font-bold text-rose-600"
          >
            Hide from bill grid
          </button>
        )}
        {item && item.isActive === 0 && (
          <button
            onClick={async () => {
              await updateItem(item.id, { isActive: 1 })
              onSaved('Item is back on the bill grid')
            }}
            className="tap-scale w-full rounded-2xl bg-slate-100 text-[16px] font-bold text-slate-700"
          >
            Show on bill grid again
          </button>
        )}
      </div>
    </Sheet>
  )
}
