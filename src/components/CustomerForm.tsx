import { useEffect, useState } from 'react'
import { addCustomer, updateCustomer } from '../db/actions'
import { Sheet } from './ui'
import { money, toPaise } from '../lib/format'
import type { Customer } from '../db/types'

/** Shared add/edit form — the only place customer details are captured. */
export function CustomerForm({
  open,
  customer,
  initialName = '',
  onClose,
  onSaved,
}: {
  open: boolean
  /** null creates a new customer. */
  customer?: Customer | null
  initialName?: string
  onClose: () => void
  onSaved: (c: Customer) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [limit, setLimit] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(customer?.name ?? initialName)
    setPhone(customer?.phone ?? '')
    setAddress(customer?.address ?? '')
    setLimit(customer?.creditLimit ? String(customer.creditLimit / 100) : '')
    setNotes(customer?.notes ?? '')
    setError('')
  }, [open, customer, initialName])

  const save = async () => {
    if (!name.trim()) return setError('Name is needed')
    const patch = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      creditLimit: limit.trim() ? toPaise(limit) : undefined,
      notes: notes.trim() || undefined,
    }
    if (customer) {
      await updateCustomer(customer.id, patch)
      onSaved({ ...customer, ...patch })
    } else {
      onSaved(await addCustomer(patch))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label={customer ? 'Edit customer' : 'New customer'}>
      <div className="pb-safe space-y-3 px-4 pt-4" style={{ ['--pb' as string]: '12px' }}>
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold">{customer ? 'Edit customer' : 'New customer'}</p>
          <button onClick={onClose} aria-label="Close" className="tap-scale px-3 text-2xl text-slate-400">
            ✕
          </button>
        </div>

        <FormField label="Name / नाव *" value={name} onChange={setName} placeholder="Ramesh Hotel" autoFocus />
        <FormField
          label="Phone / फोन"
          value={phone}
          onChange={setPhone}
          type="tel"
          inputMode="tel"
          placeholder="98xxxxxxxx"
        />
        <FormField label="Address / पत्ता" value={address} onChange={setAddress} placeholder="Shop 4, Market Road" />
        <FormField
          label="Credit limit (₹) — warns, never blocks"
          value={limit}
          onChange={setLimit}
          type="number"
          inputMode="decimal"
          placeholder="5000"
        />
        <FormField label="Note" value={notes} onChange={setNotes} placeholder="Pays every Sunday" />

        {customer && customer.balance !== 0 && (
          <p className="text-[14px] text-slate-500">
            Current balance {money(customer.balance)} — change it by billing or collecting, not here.
          </p>
        )}
        {error && <p className="text-[14px] font-semibold text-rose-600">{error}</p>}

        <button
          onClick={() => void save()}
          className="tap-scale w-full rounded-2xl bg-brand-600 text-lg font-bold text-white"
        >
          {customer ? 'Save' : 'Add customer'}
        </button>
      </div>
    </Sheet>
  )
}

export function FormField({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'text' | 'tel' | 'decimal' | 'numeric'
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-slate-500">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[16px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500"
      />
    </label>
  )
}
