/**
 * The ledger lives in this browser's IndexedDB. Browsers may evict that under
 * storage pressure unless the site asks to keep it, so ask once on boot.
 */

export interface StorageStatus {
  supported: boolean
  persisted: boolean
  usage: number
  quota: number
}

export async function requestPersistentStorage(): Promise<boolean> {
  const s = navigator.storage
  if (!s?.persist) return false
  try {
    if (await s.persisted?.()) return true
    return await s.persist()
  } catch {
    return false
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  const s = navigator.storage
  if (!s?.estimate) return { supported: false, persisted: false, usage: 0, quota: 0 }
  try {
    const [persisted, estimate] = await Promise.all([
      s.persisted?.() ?? Promise.resolve(false),
      s.estimate(),
    ])
    return {
      supported: true,
      persisted,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    }
  } catch {
    return { supported: false, persisted: false, usage: 0, quota: 0 }
  }
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
