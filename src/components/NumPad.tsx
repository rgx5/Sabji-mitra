import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui'
import { lineTotal, money, toPaise, toQty, UNIT_LABEL } from '../lib/format'
import type { Unit } from '../db/types'

export type PadMode = 'weight' | 'money' | 'count'

export interface PadChip {
  label: string
  /** Typed-unit value: kg for weight, ₹ for money, count for count. */
  value: number
  /** 'set' replaces the entry, 'add' bumps it. */
  kind?: 'set' | 'add'
  /** A 'set' chip submits on the same tap — that is the two-tap path. */
  instant?: boolean
}

export interface PadAction {
  key: string
  label: string
  tone?: 'primary' | 'secondary'
}

export interface NumPadProps {
  open: boolean
  title: string
  subtitle?: string
  mode: PadMode
  unit?: Unit
  /** Paise per unit — shows a live amount while weighing. */
  rate?: number
  initial?: string
  /** Changing this resets the entry — needed when one open pad moves to the next field. */
  sessionKey?: string
  chips?: PadChip[]
  submitLabel?: string
  /** Replaces the single submit key with a stacked column — e.g. Cash / UPI. */
  actions?: PadAction[]
  destructiveLabel?: string
  onDestructive?: () => void
  onSubmit: (value: string, actionKey?: string) => void
  onClose: () => void
}

const decimalsFor = (mode: PadMode): number => (mode === 'weight' ? 3 : mode === 'money' ? 2 : 0)

export function NumPad({
  open,
  title,
  subtitle,
  mode,
  unit = 'kg',
  rate,
  initial = '',
  sessionKey = '',
  chips = [],
  submitLabel = 'Add',
  actions,
  destructiveLabel,
  onDestructive,
  onSubmit,
  onClose,
}: NumPadProps) {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    if (open) setValue(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionKey])

  const maxDecimals = decimalsFor(mode)

  const press = (key: string) => {
    setValue((v) => {
      if (key === 'back') return v.slice(0, -1)
      if (key === '.') {
        if (maxDecimals === 0 || v.includes('.')) return v
        return v === '' ? '0.' : `${v}.`
      }
      const next = v + key
      const [, dec = ''] = next.split('.')
      if (dec.length > maxDecimals) return v
      if (next.replace('.', '').length > 8) return v
      return next.replace(/^0(\d)/, '$1')
    })
  }

  const applyChip = (chip: PadChip) => {
    const typed = chip.kind === 'add' ? (Number(value) || 0) + chip.value : chip.value
    const next = String(Number(typed.toFixed(maxDecimals)))
    if (chip.kind !== 'add' && chip.instant !== false && !actions) {
      onSubmit(next)
      return
    }
    setValue(next)
  }

  const amount = useMemo(() => {
    if (mode !== 'weight' || !rate) return null
    return lineTotal(toQty(value || '0', unit), rate, unit)
  }, [mode, rate, unit, value])

  const canSubmit = Number(value) > 0

  const submit = (actionKey?: string) => {
    if (canSubmit) onSubmit(value, actionKey)
  }

  const unitSuffix = mode === 'weight' ? UNIT_LABEL[unit] : mode === 'money' ? '' : '×'

  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="pb-safe px-3 pt-3" style={{ ['--pb' as string]: '12px' }}>
        <div className="mb-2 flex items-start justify-between gap-2 px-2">
          <div className="min-w-0">
            <p className="truncate text-xl font-bold">{title}</p>
            {subtitle && <p className="truncate text-[15px] text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap-scale -mt-1 rounded-full px-3 text-2xl text-slate-400"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 flex items-baseline justify-end gap-2 rounded-2xl bg-slate-100 px-4 py-3">
          {mode === 'money' && <span className="text-2xl font-bold text-slate-400">₹</span>}
          <span className="text-4xl font-bold tabular-nums">{value || '0'}</span>
          {unitSuffix && <span className="text-xl font-semibold text-slate-400">{unitSuffix}</span>}
          {amount !== null && (
            <span className="ml-auto text-2xl font-bold text-brand-700 tabular-nums">
              {money(amount)}
            </span>
          )}
        </div>

        {chips.length > 0 && (
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            {chips.map((c) => (
              <button
                key={c.label}
                onClick={() => applyChip(c)}
                className="tap-scale shrink-0 rounded-2xl bg-brand-100 px-4 text-[17px] font-bold text-brand-700"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {['1', '2', '3'].map((k) => (
            <Key key={k} onPress={() => press(k)}>
              {k}
            </Key>
          ))}
          <Key onPress={() => press('back')} tone="slate">
            ⌫
          </Key>

          {['4', '5', '6'].map((k) => (
            <Key key={k} onPress={() => press(k)}>
              {k}
            </Key>
          ))}
          {actions && actions.length > 0 ? (
            <div className="row-span-3 grid gap-2" style={{ gridTemplateRows: `repeat(${actions.length}, 1fr)` }}>
              {actions.map((a) => (
                <button
                  key={a.key}
                  onClick={() => submit(a.key)}
                  disabled={!canSubmit}
                  className={`tap-scale rounded-2xl text-[17px] font-bold shadow-sm disabled:bg-slate-200 disabled:text-slate-400 ${
                    a.tone === 'secondary' ? 'bg-sky-600 text-white' : 'bg-brand-600 text-white'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!canSubmit}
              className="tap-scale row-span-3 rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400"
            >
              {submitLabel}
            </button>
          )}

          {['7', '8', '9'].map((k) => (
            <Key key={k} onPress={() => press(k)}>
              {k}
            </Key>
          ))}

          <Key onPress={() => press('.')} tone="slate" disabled={maxDecimals === 0}>
            .
          </Key>
          <Key onPress={() => press('0')}>0</Key>
          <Key onPress={() => press('00')} tone="slate">
            00
          </Key>
        </div>

        {onDestructive && destructiveLabel && (
          <button
            onClick={onDestructive}
            className="tap-scale mt-2 w-full rounded-2xl bg-rose-50 text-[17px] font-bold text-rose-600"
          >
            {destructiveLabel}
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Key({
  children,
  onPress,
  tone = 'white',
  disabled,
}: {
  children: React.ReactNode
  onPress: () => void
  tone?: 'white' | 'slate'
  disabled?: boolean
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`tap-scale h-16 rounded-2xl text-2xl font-semibold shadow-sm disabled:opacity-30 ${
        tone === 'slate' ? 'bg-slate-200 text-slate-700' : 'bg-white text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

/** Money chips in ₹ for payment / rate entry. */
export const moneyChips = (exact?: number): PadChip[] => [
  ...(exact && exact > 0
    ? [{ label: `Full ${money(exact)}`, value: Math.round(exact) / 100, kind: 'set' as const, instant: false }]
    : []),
  { label: '+10', value: 10, kind: 'add' as const },
  { label: '+50', value: 50, kind: 'add' as const },
  { label: '+100', value: 100, kind: 'add' as const },
  { label: '+500', value: 500, kind: 'add' as const },
]

export const paiseFromInput = toPaise
