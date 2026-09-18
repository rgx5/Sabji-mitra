import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

/* ---------------- bottom sheet ---------------- */

/** How many sheets are open — toasts move out of their way. */
let openSheets = 0
const sheetListeners = new Set<() => void>()
const subscribeSheets = (fn: () => void) => {
  sheetListeners.add(fn)
  return () => sheetListeners.delete(fn)
}
const setSheetCount = (delta: number) => {
  openSheets = Math.max(0, openSheets + delta)
  sheetListeners.forEach((fn) => fn())
}
export const useSheetOpen = (): boolean =>
  useSyncExternalStore(
    subscribeSheets,
    () => openSheets > 0,
    () => false,
  )

export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    setSheetCount(1)
    return () => {
      window.removeEventListener('keydown', onKey)
      setSheetCount(-1)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label={label}>
      <button
        aria-label="Close"
        className="absolute inset-0 h-full w-full bg-slate-900/40"
        onClick={onClose}
      />
      <div className="animate-sheet relative max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
        {children}
      </div>
    </div>
  )
}

/* ---------------- toast with undo ---------------- */

interface ToastState {
  id: number
  message: string
  actionLabel?: string
  action?: () => void
  tone: 'ok' | 'warn'
}

interface ToastApi {
  toast: (message: string, opts?: { actionLabel?: string; action?: () => void; tone?: 'ok' | 'warn' }) => void
}

const ToastCtx = createContext<ToastApi>({ toast: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null)
  const sheetOpen = useSheetOpen()
  const timer = useRef<number | undefined>(undefined)

  const toast = useCallback<ToastApi['toast']>((message, opts) => {
    window.clearTimeout(timer.current)
    setCurrent({ id: Date.now(), message, tone: opts?.tone ?? 'ok', ...opts })
    timer.current = window.setTimeout(() => setCurrent(null), opts?.action ? 5000 : 2200)
  }, [])

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {current && (
        <div
          className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 ${
            sheetOpen ? 'top-4' : 'bottom-24'
          }`}
        >
          <div
            className={`animate-toast pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl ${
              current.tone === 'warn' ? 'bg-amber-600' : 'bg-slate-900'
            }`}
          >
            <span className="text-[15px] font-medium">{current.message}</span>
            {current.action && (
              <button
                className="tap-scale -my-2 rounded-xl bg-white/15 px-3 py-2 text-[15px] font-bold"
                onClick={() => {
                  current.action?.()
                  setCurrent(null)
                }}
              >
                {current.actionLabel ?? 'Undo'}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

/* ---------------- small primitives ---------------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white shadow-sm ${className}`}>{children}</div>
}

export function StatRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'good' | 'bad' | 'muted'
}) {
  const color =
    tone === 'good' ? 'text-brand-700' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0">
      <span className="text-[15px] text-slate-600">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-bold' : 'font-semibold'} ${color}`}>
        {value}
      </span>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="text-5xl">{icon}</div>
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      {hint && <p className="text-[15px] text-slate-500">{hint}</p>}
    </div>
  )
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <span className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">🔍</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-10 pl-10 text-[16px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500"
      />
      {value && (
        <button
          aria-label="Clear"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1 min-h-0 -translate-y-1/2 px-3 py-2 text-slate-400"
        >
          ✕
        </button>
      )}
    </div>
  )
}
