import { useEffect, useState } from 'react'

/** Re-renders every `ms` and returns performance.now(). */
export function useNow(ms: number) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
