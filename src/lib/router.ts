import { useEffect, useState } from 'react'

export type Route = { path: string; parts: string[] }

const read = (): Route => {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const path = raw || 'bill'
  return { path, parts: path.split('/').filter(Boolean) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export const go = (path: string): void => {
  window.location.hash = `#/${path.replace(/^\/+/, '')}`
}

export const back = (): void => window.history.back()
